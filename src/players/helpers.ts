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

import * as mplayer_contracts from '../contracts';
import * as mplayer_helpers from '../helpers';
import * as mplayer_players_controls from '../players/controls';
import * as mplayer_players_spotifyplayer from '../players/spotifyplayer';
import * as mplayer_players_vlcplayer from '../players/vlcplayer';


/**
 * Results for a call of the 'connectTo' function.
 */
export type ConnectToResult = mplayer_players_controls.StatusBarController | false;

/**
 * Connects to a player.
 * 
 * @param {mplayer_contracts.PlayerConfig} cfg The configuration.
 * 
 * @returns {Promise<ConnectToResult>} The promise with the result.
 */
export async function connectTo(cfg: mplayer_contracts.PlayerConfig): Promise<ConnectToResult> {
    const ID = cfg.__id;

    if (!cfg) {
        cfg = <any>{};
    }

    let result: ConnectToResult;

    const TYPE = mplayer_helpers.normalizeString(cfg.type);

    let player: mplayer_contracts.MediaPlayer;
    switch (TYPE) {
        case 'spotify':
            player = new mplayer_players_spotifyplayer.SpotifyPlayer(ID, <mplayer_contracts.SpotifyPlayerConfig>cfg);
            break;

        case 'vlc':
            player = new mplayer_players_vlcplayer.VLCPlayer(ID, <mplayer_contracts.VLCPlayerConfig>cfg);
            break;
    }

    if (player) {
        if (!mplayer_helpers.toBooleanSafe(player.isConnected)) {
            const HAS_CONNECTED = mplayer_helpers.toBooleanSafe( await player.connect() );
            if (HAS_CONNECTED) {
                result = new mplayer_players_controls.StatusBarController(player, cfg);
            }
            else {
                result = false;
            }
        }
        else {
            result = new mplayer_players_controls.StatusBarController(player, cfg);
        }
    }

    return result;
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
