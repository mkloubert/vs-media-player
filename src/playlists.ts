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

import * as mplayer_contracts from './contracts';
import * as mplayer_helpers from './helpers';
import * as vscode from 'vscode';


/**
 * Selects a track from a playlist of a player for being played.
 * 
 * @param {mplayer_contracts.MediaPlayer} player 
 * 
 * @returns {Promise<void>} The promise.
 */
export async function playTrack(player: mplayer_contracts.MediaPlayer,
                                progress?: vscode.Progress<{ message?: string; }>): Promise<void> {
    const UPDATE_PROGRES = (msg?: string) => {
        if (progress) {
            progress.report( {
                message: mplayer_helpers.normalizeString(msg),
            });
        }
    };

    const QUICK_PICKS: mplayer_contracts.ActionQuickPickItem[] = [];

    const PLAYLISTS = ((await player.getPlaylists()) || []).filter(p => p);
    
    for (let i = 0; i < PLAYLISTS.length; i++) {
        const PL = PLAYLISTS[i];

        UPDATE_PROGRES(`Loading tracks ${i + 1} / ${PLAYLISTS.length} (${Math.floor(i / PLAYLISTS.length * 100.0)} %)`);

        const TRACKS = ((await PL.getTracks()) || []).filter(t => t);
        if (TRACKS.length < 1) {
            continue;
        }

        let label = mplayer_helpers.toStringSafe(PL.name).trim();
        if ('' === label) {
            let id = mplayer_helpers.toStringSafe(PL.id).trim();
            if ('' === id) {
                id = `#${i + 1}`;
            }

            label = `Playlist ${id}`;
        }

        const PL_ITEM: mplayer_contracts.ActionQuickPickItem = {
            description: '',
            action: async () => {
                try {
                    if (TRACKS.length > 0) {
                        await TRACKS[0].play();
                    }
                }
                catch (e) {
                    mplayer_helpers.log(`[ERROR] playlists.playTrack(5): ${mplayer_helpers.toStringSafe(e)}`);
                }
            },
            label: '$(list-unordered) ' + label,
            state: PL,
        };
        QUICK_PICKS.push(PL_ITEM);

        for (let j = 0; j < TRACKS.length; j++) {
            const T = TRACKS[j];

            let label = mplayer_helpers.toStringSafe(T.name).trim();
            if ('' === label) {
                label = `Playlist #${j + 1}`;
            }

            const T_ITEM: mplayer_contracts.ActionQuickPickItem = {
                action: async (track: mplayer_contracts.Track) => {
                    try {
                        await track.play();
                    }
                    catch (e) {
                        mplayer_helpers.log(`[ERROR] playlists.playTrack(4): ${mplayer_helpers.toStringSafe(e)}`);
                    }
                },
                description: '',
                label: "  $(triangle-right) " + `   [${j + 1}] ${label}`,
                state: T,
            };
            QUICK_PICKS.push(T_ITEM);
        }
    }

    if (QUICK_PICKS.length > 0) {
        vscode.window.showQuickPick(QUICK_PICKS, {
            placeHolder: 'Select an item of a playlist...',
        }).then(async (item) => {
            if (!item) {
                return;
            }

            if (item.action) {
                try {
                    await Promise.resolve(item.action(item.state, item));
                }
                catch (e) {
                    mplayer_helpers.log(`[ERROR] playlists.playTrack(3): ${mplayer_helpers.toStringSafe(e)}`);
                }
            }
        }, (err) => {
            mplayer_helpers.log(`[ERROR] playlists.playTrack(2): ${mplayer_helpers.toStringSafe(err)}`);
        });
    }
    else {
        vscode.window.showWarningMessage('[vs-media-player] No track found!').then(() => {
        }, (err) => {
            mplayer_helpers.log(`[ERROR] playlists.playTrack(1): ${mplayer_helpers.toStringSafe(err)}`);
        });
    }
}
