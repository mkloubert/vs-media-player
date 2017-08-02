// The MIT License (MIT)
// 
// vs-media-player (https://github.com/mkloubert/vs-media-player)
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

import * as Enumerable from 'node-enumerable';
import * as mplayer_contracts from '../contracts';
import * as mplayer_helpers from '../helpers';
import * as mplayer_players_controls from '../players/controls';
import * as mplayer_players_deezerplayer from '../players/deezerplayer';
import * as mplayer_players_napsterplayer from '../players/napsterplayer';
import * as mplayer_players_spotifyplayer from '../players/spotifyplayer';
import * as mplayer_players_vlcplayer from '../players/vlcplayer';
import * as vscode from 'vscode';


/**
 * Results for a call of the 'connectTo' function.
 */
export type ConnectToResult = mplayer_players_controls.StatusBarController | false;

/**
 * Default device data.
 */
export interface DefaultOutputData {
    /**
     * The ID.
     */
    readonly id: any;
    /**
     * The name.
     */
    readonly name: string;
}

interface PlaylistSearchExpressionRepository {
    [id: number]: string;
}

interface TrackSearchExpressionRepository {
    [id: number]: string;
}


const KEY_PLAYLIST_SEARCH_EXPR_REPO = 'vscMediaPlayerPlaylistSearchExpressionRepository';
const KEY_TRACK_SEARCH_EXPR_REPO = 'vscMediaPlayerTrackSearchExpressionRepository';


/**
 * Connects to a player.
 * 
 * @param {mplayer_contracts.PlayerConfig} cfg The configuration.
 * @param {vscode.ExtensionContext} context The extension context.
 * 
 * @returns {Promise<ConnectToResult>} The promise with the result.
 */
export async function connectTo(cfg: mplayer_contracts.PlayerConfig,
                                context: vscode.ExtensionContext): Promise<ConnectToResult> {
    const ID = cfg.__id;

    if (!cfg) {
        cfg = <any>{};
    }

    let result: ConnectToResult;

    const CONTEXT_PROVIDER = () => context;
    const TYPE = mplayer_helpers.normalizeString(cfg.type);

    let player: mplayer_contracts.MediaPlayer;
    switch (TYPE) {
        case 'deezer':
            player = new mplayer_players_deezerplayer.DeezerPlayer(ID,
                                                                   <mplayer_players_deezerplayer.DeezerPlayerConfig>cfg, context);
            break;

        case 'napster':
            player = new mplayer_players_napsterplayer.NapsterPlayer(ID,
                                                                     <mplayer_players_napsterplayer.NapsterPlayerConfig>cfg, context);
            break;

        case 'spotify':
            player = new mplayer_players_spotifyplayer.SpotifyPlayer(ID,
                                                                     <mplayer_players_spotifyplayer.SpotifyPlayerConfig>cfg, context);
            break;

        case 'vlc':
            player = new mplayer_players_vlcplayer.VLCPlayer(ID,
                                                             <mplayer_players_vlcplayer.VLCPlayerConfig>cfg, context);
            break;
    }

    if (player) {
        if (!mplayer_helpers.toBooleanSafe(player.isInitialized)) {
            await player.initialize();
        }

        if (!mplayer_helpers.toBooleanSafe(player.isConnected)) {
            const HAS_CONNECTED = mplayer_helpers.toBooleanSafe( await player.connect() );
            if (HAS_CONNECTED) {
                result = new mplayer_players_controls.StatusBarController(CONTEXT_PROVIDER,
                                                                          player, cfg);
            }
            else {
                result = false;
            }
        }
        else {
            result = new mplayer_players_controls.StatusBarController(CONTEXT_PROVIDER,
                                                                      player, cfg);
        }
    }

    if ('object' === typeof result) {
        try {
            // initial output device
            const INITIAL_OUTPUT = mplayer_helpers.normalizeString(cfg.initialOutput);
            if ('' !== INITIAL_OUTPUT) {
                const DEVICES = await result.player.getDevices();
                
                Enumerable.from(DEVICES).where(d => {
                    return INITIAL_OUTPUT === mplayer_helpers.normalizeString(d.name);
                }).forEach(async (d) => {
                    try {
                        await d.select();
                    }
                    catch (e) {}
                });
            }
        }
        catch (e) {}
    }

    return result;
}

/**
 * Disconnects from a player.
 * 
 * @param {mplayer_players_controls.StatusBarController} controls The controls and the player.
 * 
 * @returns {Promise<boolean>} Promise that indicates if player has been disconnected or not. 
 */
export async function disconnectFrom(controls: mplayer_players_controls.StatusBarController): Promise<boolean> {
    if (controls && controls.player && mplayer_helpers.toBooleanSafe(controls.player.isConnected)) {
        return disposeControlsAndPlayer(controls);
    }

    return null;
}

/**
 * Disposes player controls and the underlying player.
 * 
 * @param {mplayer_players_controls.StatusBarController} controls The controls to dispose.
 * 
 * @returns {boolean} Controls (and player) have been disposed or not.
 */
export function disposeControlsAndPlayer(controls: mplayer_players_controls.StatusBarController): boolean {
    if (controls) {
        mplayer_helpers.tryDispose(controls);
        mplayer_helpers.tryDispose(controls.player);

        return true;
    }

    return false;
}

/**
 * Returns the default settings for a device (from a config entry).
 * 
 * @param {mplayer_contracts.PlayerConfig} [cfg] The optional config entry.
 * 
 * @returns {DefaultOutputData} The default data.
 */
export function getDefaultOutputData(cfg?: mplayer_contracts.PlayerConfig): DefaultOutputData {
    const RESULT = {
        id: undefined,
        name: undefined,  
    };

    if (cfg) {
        RESULT.id = cfg.defaultOutputID;
        RESULT.name = cfg.defaultOutputName;
    }

    if (mplayer_helpers.isNullOrUndefined(RESULT.id)) {
        RESULT.id = 1;
    }

    if (mplayer_helpers.isNullOrUndefined(RESULT.name)) {
        RESULT.name = 'Main device';
    }
    else {
        RESULT.name = mplayer_helpers.toStringSafe(RESULT.name);
    }

    return RESULT;
}

function getLastPlaylistSearchExpression(player: mplayer_contracts.MediaPlayer,
                                         context: vscode.ExtensionContext): string {
    const REPO = getPlaylistSearchExpressionRepository(context);

    return REPO[player.id];
}

function getLastTrackSearchExpression(player: mplayer_contracts.MediaPlayer,
                                      context: vscode.ExtensionContext): string {
    const REPO = getTrackSearchExpressionRepository(context);

    return REPO[player.id];
}

function getPlaylistSearchExpressionRepository(context: vscode.ExtensionContext): PlaylistSearchExpressionRepository {
    return context.workspaceState.get<PlaylistSearchExpressionRepository>(KEY_PLAYLIST_SEARCH_EXPR_REPO) ||
           {};
}

function getTrackSearchExpressionRepository(context: vscode.ExtensionContext): TrackSearchExpressionRepository {
    return context.workspaceState.get<TrackSearchExpressionRepository>(KEY_TRACK_SEARCH_EXPR_REPO) ||
           {};
}

function savePlaylistSearchExpression(player: mplayer_contracts.MediaPlayer,
                                      context: vscode.ExtensionContext,
                                      expr: string): boolean {
    try {
        expr = mplayer_helpers.toStringSafe(expr).trim();

        const REPO = getPlaylistSearchExpressionRepository(context);
        if ('' !== expr) {
            REPO[player.id] = expr;
        }
        else {
            delete REPO[player.id];
        }

        context.workspaceState.update(KEY_PLAYLIST_SEARCH_EXPR_REPO, REPO).then(() => {
        }, (err) => {
            mplayer_helpers.log(`[ERROR] players.helpers.savePlaylistSearchExpression(e): ${mplayer_helpers.toStringSafe(err)}`);
        });

        return true;
    }
    catch (e) {
        mplayer_helpers.log(`[ERROR] players.helpers.savePlaylistSearchExpression(1): ${mplayer_helpers.toStringSafe(e)}`);

        return false;
    }
}

function saveTrackSearchExpression(player: mplayer_contracts.MediaPlayer,
                                   context: vscode.ExtensionContext,
                                   expr: string): boolean {
    try {
        expr = mplayer_helpers.toStringSafe(expr).trim();

        const REPO = getTrackSearchExpressionRepository(context);
        if ('' !== expr) {
            REPO[player.id] = expr;
        }
        else {
            delete REPO[player.id];
        }

        context.workspaceState.update(KEY_TRACK_SEARCH_EXPR_REPO, REPO).then(() => {
        }, (err) => {
            mplayer_helpers.log(`[ERROR] players.helpers.saveTrackSearchExpression(e): ${mplayer_helpers.toStringSafe(err)}`);
        });

        return true;
    }
    catch (e) {
        mplayer_helpers.log(`[ERROR] players.helpers.saveTrackSearchExpression(1): ${mplayer_helpers.toStringSafe(e)}`);

        return false;
    }
}


/**
 * Searches for a playlist inside a player.
 * 
 * @param {mplayer_contracts.MediaPlayer} player The player.
 * @param {vscode.ExtensionContext} context The extension context.
 * 
 * @return {Promise<boolean>} The promise that indicates if operation was successful or not.
 */
export function searchPlaylists(player: mplayer_contracts.MediaPlayer,
                                context: vscode.ExtensionContext): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

        try {
            const SEARCH_FOR = async (player: mplayer_contracts.MediaPlayer, expr: string) => {
                try {
                    const SEARCH = await player.searchPlaylists(expr);
                    if (SEARCH && SEARCH.playlists && SEARCH.playlists.length > 0) {
                        const TRACK_QUICK_PICKS: mplayer_contracts.ActionQuickPickItem[] = SEARCH.playlists.filter(pl => pl).map((pl, i) => {
                            let label = mplayer_helpers.toStringSafe(pl.name).trim();
                            if ('' === label) {
                                label = `Playlist #${i + 1}`;
                            }

                            const DESCRIPTION = mplayer_helpers.toStringSafe(pl.description).trim();

                            return {
                                action: async (currentList: mplayer_contracts.Playlist) => {
                                    await currentList.play();
                                },
                                label: '$(list-unordered)  ' + `${label}`,
                                description: DESCRIPTION,
                                state: pl,
                            };
                        });

                        const allQuickPicks: mplayer_contracts.ActionQuickPickItem[] =
                            [].concat(TRACK_QUICK_PICKS);

                        vscode.window.showQuickPick(allQuickPicks, {
                            placeHolder: 'Select the playlist to start...',
                        }).then(async (item) => {
                            if (!item) {
                                COMPLETED(null, false);
                                return;
                            }

                            try {
                                if (item.action) {
                                    await Promise.resolve( item.action(item.state, item) );
                                }

                                COMPLETED(null, true);
                            }
                            catch (e) {
                                COMPLETED(e);
                            }
                        }, (err) => {
                            mplayer_helpers.log(`players.helpers.searchPlaylists(2): ${mplayer_helpers.toStringSafe(err)}`);

                            COMPLETED(err);
                        });
                    }
                    else {
                        vscode.window.showWarningMessage('[vs-media-player] Nothing found!').then(() => {
                        }, (err) => {
                            mplayer_helpers.log(`players.helpers.searchPlaylists(1): ${mplayer_helpers.toStringSafe(err)}`);
                        });

                        COMPLETED(null, true);
                    }
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            const LAST_EXPR = getLastPlaylistSearchExpression(player, context);

            vscode.window.showInputBox({
                placeHolder: 'Enter an expression to search for...',
                value: mplayer_helpers.toStringSafe( LAST_EXPR ),
            }).then(async (expr) => {
                if (!mplayer_helpers.isEmptyString(expr)) {
                    savePlaylistSearchExpression(player, context,
                                                 expr);

                    await SEARCH_FOR(player, expr);
                }
                else {
                    COMPLETED(null, false);
                }
            }, (err) => {
                COMPLETED(err);
            });
        }
        catch (e) {
            COMPLETED(e);
        }
    });
}

/**
 * Searches for a track inside a player.
 * 
 * @param {mplayer_contracts.MediaPlayer} player The player.
 * @param {vscode.ExtensionContext} context The extension context.
 * 
 * @return {Promise<boolean>} The promise that indicates if operation was successful or not.
 */
export function searchTrack(player: mplayer_contracts.MediaPlayer,
                            context: vscode.ExtensionContext): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

        try {
            const SEARCH_FOR = async (player: mplayer_contracts.MediaPlayer, expr: string) => {
                try {
                    const SEARCH = await player.searchTracks(expr);
                    if (SEARCH && SEARCH.tracks && SEARCH.tracks.length > 0) {
                        const TRACK_QUICK_PICKS: mplayer_contracts.ActionQuickPickItem[] = SEARCH.tracks.filter(t => t).map((t, i) => {
                            let label = mplayer_helpers.toStringSafe(t.name).trim();
                            if ('' === label) {
                                label = `Track #${i + 1}`;
                            }

                            const DESCRIPTION = mplayer_helpers.toStringSafe(t.description).trim();

                            return {
                                action: async (currentTrack: mplayer_contracts.Track) => {
                                    await currentTrack.play();
                                },
                                label: '$(triangle-right)  ' + `${label}`,
                                description: DESCRIPTION,
                                state: t,
                            };
                        });

                        const allQuickPicks: mplayer_contracts.ActionQuickPickItem[] =
                            [].concat(TRACK_QUICK_PICKS);

                        vscode.window.showQuickPick(allQuickPicks, {
                            placeHolder: 'Select the track to play...',
                        }).then(async (item) => {
                            if (!item) {
                                COMPLETED(null, false);
                                return;
                            }

                            try {
                                if (item.action) {
                                    await Promise.resolve( item.action(item.state, item) );
                                }

                                COMPLETED(null, true);
                            }
                            catch (e) {
                                COMPLETED(e);
                            }
                        }, (err) => {
                            mplayer_helpers.log(`players.helpers.searchTrack(2): ${mplayer_helpers.toStringSafe(err)}`);

                            COMPLETED(err);
                        });
                    }
                    else {
                        vscode.window.showWarningMessage('[vs-media-player] Nothing found!').then(() => {
                        }, (err) => {
                            mplayer_helpers.log(`players.helpers.searchTrack(1): ${mplayer_helpers.toStringSafe(err)}`);
                        });

                        COMPLETED(null, true);
                    }
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            const LAST_EXPR = getLastTrackSearchExpression(player, context);

            vscode.window.showInputBox({
                placeHolder: 'Enter an expression to search for...',
                value: mplayer_helpers.toStringSafe( LAST_EXPR ),
            }).then(async (expr) => {
                if (!mplayer_helpers.isEmptyString(expr)) {
                    saveTrackSearchExpression(player, context,
                                              expr);

                    await SEARCH_FOR(player, expr);
                }
                else {
                    COMPLETED(null, false);
                }
            }, (err) => {
                COMPLETED(err);
            });
        }
        catch (e) {
            COMPLETED(e);
        }
    });
}

/**
 * Extracts the parts of a search expression.
 * 
 * @param {string} [expr] The expression.
 * 
 * @return {string[]} The parts.
 */
export function toSearchExpressionParts(expr?: string): string[] {
    expr = mplayer_helpers.toStringSafe(expr);
    expr = mplayer_helpers.replaceAllStrings(expr, "\n", '');
    expr = mplayer_helpers.replaceAllStrings(expr, "\r", '');
    expr = mplayer_helpers.replaceAllStrings(expr, "\t", '    ');

    return Enumerable.from(mplayer_helpers.toStringSafe(expr).split(' ')).select(x => {
        return mplayer_helpers.normalizeString(x);
    }).where(x => {
        return '' !== x;
    }).distinct()
      .toArray();
}
