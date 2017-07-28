// The MIT License (MIT)
// 
// vs-script-commands (https://github.com/mkloubert/vs-script-commands)
// Copyright (c) Marcel Joachim Kloubert <marcel.kloubert@gmx.net>
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

import * as Events from 'events';
import * as Moment from 'moment';
import * as mplayer_contracts from './contracts';
import * as mplayer_helpers from './helpers';
import * as mplayer_players_controls from './players/controls';
import * as mplayer_players_vlcplayer from './players/vlcplayer';
import * as vscode from 'vscode';


interface PlayerConfigQuickPickItem extends vscode.QuickPickItem {
    readonly config: mplayer_contracts.PlayerConfig;
}

interface PlayerQuickPickItem extends vscode.QuickPickItem {
    readonly player: mplayer_contracts.MediaPlayer;
}

interface PlaylistQuickPickItem extends vscode.QuickPickItem {
    readonly playlist: mplayer_contracts.Playlist;
}

interface TrackQuickPickItem extends vscode.QuickPickItem {
    readonly track: mplayer_contracts.Track;
}

let nextPlayerConfigId = -1;

/**
 * The controller class for that extension.
 */
export class MediaPlayerController extends Events.EventEmitter implements vscode.Disposable {
    /**
     * Stores the current configuration.
     */
    protected _config: mplayer_contracts.Configuration;
    /**
     * Stores all connected players.
     */
    protected _connectedPlayers: mplayer_players_controls.StatusBarController[];
    /**
     * Stores the extension context.
     */
    protected readonly _CONTEXT: vscode.ExtensionContext;
    /**
     * Stores the global output channel.
     */
    protected readonly _OUTPUT_CHANNEL: vscode.OutputChannel;
    /**
     * Stores the package file of that extension.
     */
    protected _PACKAGE_FILE: mplayer_contracts.PackageFile;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {vscode.ExtensionContext} context The underlying extension context.
     * @param {vscode.OutputChannel} outputChannel The global output channel to use.
     * @param {mplayer_contracts.PackageFile} pkgFile The package file of that extension.
     */
    constructor(context: vscode.ExtensionContext,
                outputChannel: vscode.OutputChannel,
                pkgFile: mplayer_contracts.PackageFile) {
        super();

        this._CONTEXT = context;
        this._OUTPUT_CHANNEL = outputChannel;
        this._PACKAGE_FILE = pkgFile;
    }

    /**
     * Gets the current configuration.
     */
    public get config(): mplayer_contracts.Configuration {
        return this._config;
    }

    /**
     * Connects to a player.
     * 
     * @returns {Promise<any>} The promise.
     */
    public connect(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

            try {
                const PLAYERS = ME.getPlayers() || [];
                if (PLAYERS.length < 1) {
                    vscode.window.showWarningMessage('[vs-media-player] Please define at least one player in your settings!').then(() => {
                    }, (err) => {
                        ME.log(`MediaPlayerController.connect(2): ${mplayer_helpers.toStringSafe(err)}`);
                    });

                    COMPLETED(null);
                    return;
                }

                const CONNECT_TO = (item: PlayerConfigQuickPickItem) => {
                    if (!item) {
                        COMPLETED(null, null);
                        return;
                    }

                    const PLAYER_CFG = item.config;
                    
                    try {
                        const TYPE = mplayer_helpers.normalizeString(PLAYER_CFG.type);

                        let player: mplayer_contracts.MediaPlayer;

                        switch (TYPE) {
                            case 'vlc':
                                player = new mplayer_players_vlcplayer.VLCPlayer(<mplayer_contracts.VLCPlayerConfig>PLAYER_CFG);
                                break;
                        }

                        if (player) {
                            Promise.resolve( player.connect() ).then((hasConnected: boolean) => {
                                try {
                                    if (mplayer_helpers.toBooleanSafe(hasConnected)) {
                                        const NEW_CONTROLLER = new mplayer_players_controls.StatusBarController(player, PLAYER_CFG);
                                        
                                        ME._connectedPlayers
                                          .push(NEW_CONTROLLER);

                                        try {
                                            NEW_CONTROLLER.initialize();
                                        }
                                        catch (e) {
                                            ME.log(`MediaPlayerController.connect(5): ${mplayer_helpers.toStringSafe(e)}`);
                                        }
                                        
                                        vscode.window.showInformationMessage(`[vs-media-player] Connection established to '${item.label}'.`).then(() => {
                                        }, (err) => {
                                            ME.log(`MediaPlayerController.connect(4): ${mplayer_helpers.toStringSafe(err)}`);
                                        });
                                    }
                                    else {
                                        vscode.window.showWarningMessage(`[vs-media-player] Player '${item.label}' is NOT connected!`).then(() => {
                                        }, (err) => {
                                            ME.log(`MediaPlayerController.connect(5): ${mplayer_helpers.toStringSafe(err)}`);
                                        });
                                    }

                                    COMPLETED(null,
                                            mplayer_helpers.toBooleanSafe(hasConnected));
                                }
                                catch (e) {
                                    COMPLETED(e);   
                                }
                            }).catch((err) => {
                                COMPLETED(err);
                            });
                        }
                        else {
                            vscode.window.showWarningMessage(`[vs-media-player] Player type '${TYPE}' is NOT supported!`).then(() => {
                            }, (err) => {
                                ME.log(`MediaPlayerController.connect(3): ${mplayer_helpers.toStringSafe(err)}`);
                            });

                            COMPLETED(null);
                        }
                    }
                    catch (e) {
                        COMPLETED(e);
                    }
                };

                const QUICK_PICKS: PlayerConfigQuickPickItem[] = PLAYERS.map((c, i) => {
                    let label = mplayer_helpers.toStringSafe(c.name).trim();
                    if ('' === label) {
                        label = `Player #${i + 1}`;
                    }

                    const DESCRIPTION = mplayer_helpers.toStringSafe(c.description).trim();
                    
                    return {
                        label: label,
                        config: c,
                        description: DESCRIPTION,
                    };
                });

                if (QUICK_PICKS.length > 1) {
                    vscode.window.showQuickPick(QUICK_PICKS, {
                        placeHolder: 'Select the media player to connect to...',
                    }).then((item) => {
                        CONNECT_TO(item);
                    }, (err) => {
                        COMPLETED(err);
                    });
                }
                else {
                    // the one and only
                    CONNECT_TO(QUICK_PICKS[0]);
                }
            }
            catch (e) {
                ME.log(`MediaPlayerController.connect(1): ${mplayer_helpers.toStringSafe(e)}`);

                COMPLETED(e);
            }
        });
    }

    /**
     * Gets the underlying extension context.
     */
    public get context(): vscode.ExtensionContext {
        return this._CONTEXT;
    }

    /** @inheritdoc */
    public dispose() {
        try {
            this.removeAllListeners();
        }
        catch (e) {
            console.log(`[ERROR] MediaPlayerController.dispose(): ${mplayer_helpers.toStringSafe(e)}`);
        }
    }

    /**
     * Returns the list of players configurations.
     * 
     * @returns {mplayer_contracts.PlayerConfig[]} The list of configurations.
     */
    public getPlayers(): mplayer_contracts.PlayerConfig[] {
        const CFG = this.config;
        if (CFG) {
            const PLAYERS = CFG.players || [];

            return PLAYERS.filter(x => x);
        }
    }

    /**
     * Loads a message.
     * 
     * @param {any} msg The message to log.
     * 
     * @chainable
     */
    public log(msg: any): this {
        let now = Moment();

        msg = mplayer_helpers.toStringSafe(msg);
        this.outputChannel
            .appendLine(`[${now.format('YYYY-MM-DD HH:mm:ss')}] ${msg}`);

        return this;
    }

    /**
     * Is invoked AFTER extension has been activated.
     */
    public onActivated() {
        this.reloadConfiguration();
    }

    /**
     * Is invoked when extension is going to be deactivated.
     */
    public onDeactivate() {
    }

    /**
     * Event after configuration changed.
     */
    public onDidChangeConfiguration() {
        this.reloadConfiguration();
    }

    /**
     * Gets the global output channel.
     */
    public get outputChannel(): vscode.OutputChannel {
        return this._OUTPUT_CHANNEL;
    }

    /**
     * Gets the package file of that extension.
     */
    public get packageFile(): mplayer_contracts.PackageFile {
        return this._PACKAGE_FILE;
    }

    /**
     * Reloads configuration.
     */
    public reloadConfiguration() {
        const ME = this;

        try {
            const CFG: mplayer_contracts.Configuration = vscode.workspace.getConfiguration("media.player") ||
                                                         <any>{};

            // dispose old players
            const OLD_PLAYERS = ME._connectedPlayers;
            if (OLD_PLAYERS)
            {
                OLD_PLAYERS.forEach(op => {
                    mplayer_helpers.tryDispose(op);
                    mplayer_helpers.tryDispose(op.player);
                });
            }

            if (CFG.players) {
                CFG.players.filter(p => p).forEach(p => {
                    const ID = ++nextPlayerConfigId;

                    (<any>p)['__id'] = ID;
                });
            }

            this._connectedPlayers = [];
            this._config = CFG;
        }
        catch (e) {
            ME.log(`[ERROR] MediaPlayerController.reloadConfiguration(1): ${mplayer_helpers.toStringSafe(e)}`);
        }
    }

    /**
     * Selectes an item of a playlist.
     * 
     * @returns {Promise<any>} The promise.
     */
    public selectItemOfPlaylist(): Promise<any> {
        const ME = this;

        return new Promise<any>((resolve, reject) => {
            const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

            try {
                const CONNECTED_PLAYERS = ME._connectedPlayers.filter(x => x &&
                                                                      mplayer_helpers.toBooleanSafe(x.player.isConnected));
                if (CONNECTED_PLAYERS.length < 1) {
                    vscode.window.showWarningMessage('[vs-media-player] Please connect to at least one player!').then(() => {
                    }, (err) => {
                        ME.log(`MediaPlayerController.selectItemOfPlaylist(2): ${mplayer_helpers.toStringSafe(err)}`);
                    });

                    COMPLETED(null);
                    return;
                }

                const PLAY_TRACK = (item: TrackQuickPickItem) => {
                    if (!item) {
                        COMPLETED(null, null);
                        return;
                    }

                    item.track.play().then((hasStarted: boolean) => {
                        if (mplayer_helpers.toBooleanSafe(hasStarted)) {
                            COMPLETED(null);
                        }
                        else {
                            vscode.window.showWarningMessage(`[vs-media-player] Track '${item.label}' has NOT been started!`).then(() => {
                            }, (err) => {
                                ME.log(`MediaPlayerController.selectItemOfPlaylist(4): ${mplayer_helpers.toStringSafe(err)}`);
                            });
                        }

                        COMPLETED(null);
                    }, (err) => {
                        COMPLETED(err);
                    });
                };

                const SELECT_TRACK = (item: PlaylistQuickPickItem) => {
                    if (!item) {
                        COMPLETED(null, null);
                        return;
                    }

                    item.playlist.getTracks().then((tracks) => {
                        const TRACK_QUICK_PICKS: TrackQuickPickItem[] = (tracks || []).filter(t => t).map((t, i) => {
                            let label = mplayer_helpers.toStringSafe(t.name).trim();
                            if ('' === label) {
                                label = `Track #${i + 1}`;
                            }

                            const DESCRIPTION = mplayer_helpers.toStringSafe(t.description).trim();

                            return {
                                label: label,
                                description: DESCRIPTION,
                                track: t,
                            };
                        });

                        if (TRACK_QUICK_PICKS.length > 0) {
                            if (TRACK_QUICK_PICKS.length > 1) {
                                vscode.window.showQuickPick(TRACK_QUICK_PICKS, {
                                    placeHolder: `Select a track from playlist '${item.label}'...`,
                                }).then((item) => {
                                    PLAY_TRACK(item);
                                }, (err) => {
                                    COMPLETED(err);
                                });
                            }
                            else {
                                // the one and only
                                PLAY_TRACK(TRACK_QUICK_PICKS[0]);
                            }
                        }
                        else {
                            vscode.window.showWarningMessage(`[vs-media-player] Could not find a playlist in '${item.label}'!`).then(() => {
                            }, (err) => {
                                ME.log(`MediaPlayerController.selectItemOfPlaylist(3): ${mplayer_helpers.toStringSafe(err)}`);
                            });

                            COMPLETED(null);
                        }
                    }, (err) => {
                        COMPLETED(err);
                    });
                };

                const SELECT_PLAYLIST = (item: PlayerQuickPickItem) => {
                    if (!item) {
                        COMPLETED(null, null);
                        return;
                    }

                    item.player.getPlaylists().then((playlists) => {
                        const PLAYLIST_QUICK_PICKS: PlaylistQuickPickItem[] = (playlists || []).filter(x => x).map((pl, i) => {
                            let label = mplayer_helpers.toStringSafe(pl.name).trim();
                            if ('' === label) {
                                let id = mplayer_helpers.toStringSafe(pl.id).trim();
                                if ('' === id) {
                                    id = `#${i + 1}`;
                                }

                                label = `Player ${id}`;
                            }

                            const DESCRIPTION = mplayer_helpers.toStringSafe(pl.description).trim();
                            
                            return {
                                label: label,
                                description: DESCRIPTION,
                                playlist: pl,
                            };
                        });

                        if (PLAYLIST_QUICK_PICKS.length > 0) {
                            if (PLAYLIST_QUICK_PICKS.length > 1) {
                                vscode.window.showQuickPick(PLAYLIST_QUICK_PICKS, {
                                    placeHolder: `Select a playlist of player '${item.label}'...`,
                                }).then((item) => {
                                    SELECT_TRACK(item);
                                }, (err) => {
                                    COMPLETED(err);
                                });
                            }
                            else {
                                // the one and only
                                SELECT_TRACK(PLAYLIST_QUICK_PICKS[0]);
                            }
                        }
                        else {
                            vscode.window.showWarningMessage(`[vs-media-player] Could not find a playlist in '${item.label}'!`).then(() => {
                            }, (err) => {
                                ME.log(`MediaPlayerController.selectItemOfPlaylist(3): ${mplayer_helpers.toStringSafe(err)}`);
                            });

                            COMPLETED(null);
                        }
                    }, (err) => {
                        COMPLETED(err);
                    });
                };

                const PLAYER_QUICK_PICKS: PlayerQuickPickItem[] = CONNECTED_PLAYERS.map((c, i) => {
                    const PLAYER = c.player;
                    const CFG: mplayer_contracts.PlayerConfig = c.config || <any>{};

                    let label = mplayer_helpers.toStringSafe(CFG.name).trim();
                    if ('' === label) {
                        label = `Player #${i + 1}`;
                    }

                    const DESCRIPTION = mplayer_helpers.toStringSafe(CFG.description).trim();
                    
                    return {
                        label: label,
                        description: DESCRIPTION,
                        player: PLAYER,
                    };
                });

                if (PLAYER_QUICK_PICKS.length > 1) {
                    vscode.window.showQuickPick(PLAYER_QUICK_PICKS, {
                        placeHolder: 'Select the media player...',
                    }).then((item) => {
                        SELECT_PLAYLIST(item);
                    }, (err) => {
                        COMPLETED(err);
                    });
                }
                else {
                    // the one and only
                    SELECT_PLAYLIST(PLAYER_QUICK_PICKS[0]);
                }
            }
            catch (e) {
                ME.log(`MediaPlayerController.selectItemOfPlaylist(1): ${mplayer_helpers.toStringSafe(e)}`);

                COMPLETED(e);
            }
        });
    }
}
