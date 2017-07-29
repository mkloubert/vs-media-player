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
import * as HTTP from 'http';
import * as HTTPs from 'https';
import * as Moment from 'moment';
import * as mplayer_contracts from './contracts';
import * as mplayer_helpers from './helpers';
import * as mplayer_players_controls from './players/controls';
import * as mplayer_players_helpers from './players/helpers';
import * as mplayer_players_vlcplayer from './players/vlcplayer';
import * as URL from 'url';
import * as vscode from 'vscode';
import * as Workflows from 'node-workflows';


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
     * Adds statusbar controls to internal list.
     * 
     * @param controls The controls to add.
     * 
     * @return {boolean} Controls were added or not. 
     */
    protected addStatusBarControls(controls: mplayer_players_controls.StatusBarController): boolean {
        if (controls) {
            this._connectedPlayers
                .push(controls);

            try {
                controls.initialize();
            }
            catch (e) {
                this.log(`MediaPlayerController.addStatusBarControls(): ${mplayer_helpers.toStringSafe(e)}`);
            }

            return true;
        }

        return false;
    }

    /**
     * Authorizes for Spotify.
     * 
     * @returns {Promise<any>} The promise.
     */
    public authorizeForSpotify(): Promise<any> {
        const ME = this;

        return new Promise<any>((resolve, reject) => {
            const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

            try {
                const PLAYERS = ME.getPlayers();
                
                const QUICK_PICKS: PlayerConfigQuickPickItem[] = PLAYERS.map((c, i) => {
                    if ('spotify' !== mplayer_helpers.normalizeString(c.type)) {
                        return;
                    }

                    let label = mplayer_helpers.toStringSafe(c.name).trim();
                    if ('' === label) {
                        label = `Player #${i + 1}`;
                    }

                    const DESCRIPTION = mplayer_helpers.toStringSafe(c.description).trim();
                    
                    return {
                        config: c,
                        label: label,
                        description: DESCRIPTION,
                    };
                }).filter(x => x);

                if (QUICK_PICKS.length < 1) {
                    vscode.window.showWarningMessage('[vs-media-player] Please define at least one Spotify player in your config!').then(() => {
                    }, (err) => {
                        ME.log(`MediaPlayerController.authorizeForSpotify(1): ${mplayer_helpers.toStringSafe(err)}`);
                    });

                    COMPLETED(null);
                    return;
                }

                const AUTHORIZE = (item: PlayerConfigQuickPickItem) => {
                    if (!item) {
                        COMPLETED(null);
                        return;
                    }

                    try {
                        const CFG = <mplayer_contracts.SpotifyPlayerConfig>item.config;

                        const CLIENT_ID = mplayer_helpers.toStringSafe(CFG.clientID);
                        if (mplayer_helpers.isEmptyString(CLIENT_ID)) {
                            vscode.window.showWarningMessage("[vs-media-player] Please define the 'clientID' property!").then(() => {
                            }, (err) => {
                                ME.log(`MediaPlayerController.authorizeForSpotify(2): ${mplayer_helpers.toStringSafe(err)}`);
                            });

                            COMPLETED(null);
                            return;
                        }

                        const REDIRECT_URL = mplayer_helpers.toStringSafe(CFG.redirectURL);
                        if (mplayer_helpers.isEmptyString(REDIRECT_URL)) {
                            vscode.window.showWarningMessage("[vs-media-player] Please define the 'redirectURL' property!").then(() => {
                            }, (err) => {
                                ME.log(`MediaPlayerController.authorizeForSpotify(3): ${mplayer_helpers.toStringSafe(err)}`);
                            });

                            COMPLETED(null);
                            return;
                        }

                        const R_URL = URL.parse(REDIRECT_URL);

                        let url = 'https://accounts.spotify.com/authorize/';
                        url += "?client_id=" + encodeURIComponent(CLIENT_ID);
                        url += "&response_type=" + encodeURIComponent('code');
                        url += "&redirect_uri=" + encodeURIComponent(REDIRECT_URL);
                        url += "&scope=" + encodeURIComponent([ 'user-library-read',
                                                                'streaming',
                                                                'playlist-read-collaborative',
                                                                'playlist-read-private' ].join(' '));
                        url += '&show_dialog=true';

                        let port: number;
                        let serverFactory: (requestListener?: (request: HTTP.IncomingMessage, response: HTTP.ServerResponse) => void) => HTTP.Server;
                        switch (mplayer_helpers.normalizeString(R_URL.protocol)) {
                            case 'http:':
                                port = parseInt( mplayer_helpers.toStringSafe(R_URL.port).trim() );
                                if (isNaN(port)) {
                                    port = 80;
                                }

                                serverFactory = function() {
                                    return HTTP.createServer
                                               .apply(null, arguments);
                                };
                                break;

                            case 'https:':
                                port = parseInt( mplayer_helpers.toStringSafe(R_URL.port).trim() );
                                if (isNaN(port)) {
                                    port = 443;
                                }

                                serverFactory = function() {
                                    return HTTPs.createServer
                                                .apply(null, arguments);
                                };
                                break;
                        }

                        if (serverFactory) {
                            let server: HTTP.Server;
                            const CLOSE_SERVER = (err: any) => {
                                if (server) {
                                    try {
                                        server.close(() => {
                                            COMPLETED(err);
                                        });
                                    }
                                    catch (e) {
                                        ME.log(`MediaPlayerController.authorizeForSpotify(5): ${mplayer_helpers.toStringSafe(e)}`);

                                        COMPLETED(err);
                                    }
                                }
                                else {
                                    COMPLETED(err);
                                }
                            };

                            let handledRequest = false;
                            server = serverFactory((req, resp) => {
                                if (handledRequest) {
                                    return;
                                }

                                handledRequest = true;

                                let err: any;
                                try {
                                    const PARAMS = mplayer_helpers.queryParamsToObject( URL.parse(req.url).query );
                                    const CODE = PARAMS['code'];
                                    if (!mplayer_helpers.isEmptyString(CODE)) {
                                        CFG.__code = CODE;

                                        vscode.window.showInformationMessage("[vs-media-player] Authorization with Spotify succeeded.").then(() => {
                                        }, (err) => {
                                            ME.log(`MediaPlayerController.authorizeForSpotify(7): ${mplayer_helpers.toStringSafe(err)}`);
                                        });
                                    }
                                    else {
                                        vscode.window.showWarningMessage("[vs-media-player] Spotify send no (valid) code!").then(() => {
                                        }, (err) => {
                                            ME.log(`MediaPlayerController.authorizeForSpotify(6): ${mplayer_helpers.toStringSafe(err)}`);
                                        });
                                    }

                                    resp.writeHead(200);
                                    resp.end();
                                }
                                catch (e) {
                                    err = e;
                                }
                                finally {
                                    CLOSE_SERVER(err);
                                }
                            });

                            server.on('error', (err) => {
                                if (err) {
                                    CLOSE_SERVER(err);
                                }
                            });

                            server.listen(port, (err) => {
                                if (err) {
                                    CLOSE_SERVER(err);
                                }
                                else {
                                    mplayer_helpers.open(url, {
                                        wait: false,
                                    }).then(() => {                                        
                                    }).catch((err) => {
                                        CLOSE_SERVER(err);
                                    });
                                }
                            });
                        }
                        else {
                            vscode.window.showWarningMessage("[vs-media-player] HTTP protocol NOT supported!").then(() => {
                            }, (err) => {
                                ME.log(`MediaPlayerController.authorizeForSpotify(4): ${mplayer_helpers.toStringSafe(err)}`);
                            });

                            COMPLETED(null);
                        }
                    }
                    catch (e) {
                        COMPLETED(e);
                    }
                };

                if (QUICK_PICKS.length > 1) {
                    vscode.window.showQuickPick(QUICK_PICKS, {
                        placeHolder: 'Select the Spotify player...',
                    }).then((item) => {
                        AUTHORIZE(item);
                    }, (err) => {
                        ME.log(`MediaPlayerController.authorizeForSpotify(1): ${mplayer_helpers.toStringSafe(err)}`);

                        COMPLETED(err);
                    });
                }
                else {
                    // the one and only.
                    AUTHORIZE(QUICK_PICKS[0]);
                }
            }
            catch (e) {
                COMPLETED(e);
            }
        });
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

                    mplayer_players_helpers.connectTo(item.config).then((newController) => {
                        let result = false;

                        if (false !== newController) {
                            if (newController) {
                                ME.addStatusBarControls(newController);
                            }
                            else {
                                vscode.window.showWarningMessage(`[vs-media-player] Player type is NOT supported!`).then(() => {
                                }, (err) => {
                                    ME.log(`MediaPlayerController.connect(4): ${mplayer_helpers.toStringSafe(err)}`);
                                });
                            }
                        }
                        else {
                            vscode.window.showWarningMessage(`[vs-media-player] Player '${item.label}' is NOT connected!`).then(() => {
                            }, (err) => {
                                ME.log(`MediaPlayerController.connect(3): ${mplayer_helpers.toStringSafe(err)}`);
                            });
                        }

                        COMPLETED(null, result);
                    }).catch((err) => {
                        COMPLETED(err);
                    });
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

        const SHOW_ERROR = (err: any) => {
            vscode.window.showErrorMessage(`Could not (re)load config: ${mplayer_helpers.toStringSafe(err)}`).then(() => {
            }, (e) => {
                ME.log(`MediaPlayerController.reloadConfiguration(1): ${mplayer_helpers.toStringSafe(err)}`);
                ME.log(`MediaPlayerController.reloadConfiguration(2): ${mplayer_helpers.toStringSafe(e)}`);
            });
        };

        try {
            const CFG: mplayer_contracts.Configuration = vscode.workspace.getConfiguration("media.player") ||
                                                         <any>{};

            const WF = Workflows.create();

            // dispose old players
            const OLD_PLAYERS = ME._connectedPlayers;
            if (OLD_PLAYERS)
            {
                OLD_PLAYERS.filter(op => op).forEach(op => {
                    WF.next(() => {
                        mplayer_players_helpers.disposeControlsAndPlayer(op);
                    });
                });
            }

            WF.next(() => {
                ME._connectedPlayers = [];
            });

            if (CFG.players) {
                // update player config entries

                CFG.players.filter(p => p).forEach(p => {
                    const ID = ++nextPlayerConfigId;

                    WF.next(() => {
                        (<any>p)['__id'] = ID;
                    });

                    if (mplayer_helpers.toBooleanSafe(p.connectOnStartup, true)) {
                        WF.next(async () => {
                            try {
                                const NEW_CONTROLS = await mplayer_players_helpers.connectTo(p);
                                if (NEW_CONTROLS) {
                                    ME.addStatusBarControls(NEW_CONTROLS);
                                }
                                else {
                                    //TODO: 
                                }
                            }
                            catch (e) {
                                //TODO: show error message
                            }
                        });
                    }
                });
            }

            WF.start().then(() => {
                ME._config = CFG;
            }).catch((err) => {
                SHOW_ERROR(err);
            });
        }
        catch (e) {
            SHOW_ERROR(e);
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
