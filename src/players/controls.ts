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
import * as mplayer_playlists from '../playlists';
import * as vscode from 'vscode';


let nextButtonsId = -1;

type TimerDisposer = (timer: NodeJS.Timer) => void;

class Timer implements vscode.Disposable {
    protected _DISPOSER: TimerDisposer;
    protected _TIMER: NodeJS.Timer;
    
    constructor(timer: NodeJS.Timer, disposer: TimerDisposer) {
        this._TIMER = timer;
        this._DISPOSER = disposer;
    }

    public dispose() {
        this._DISPOSER(this._TIMER);
    }
}

/**
 * A status bar controller.
 */
export class StatusBarController implements vscode.Disposable {
    /**
     * Stores the underlying configuration.
     */
    protected readonly _CONFIG: mplayer_contracts.PlayerConfig;
        /**
     * Stores the list of disposable items.
     */
    protected _disposables: vscode.Disposable[];
    /**
     * Stores the underlying player.
     */
    protected readonly _PLAYER: mplayer_contracts.MediaPlayer;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {mplayer_contracts.MediaPlayer} player The underlying player.
     * @param {mplayer_contracts.PlayerConfig} cfg The underlying configuration.
     */
    constructor(player: mplayer_contracts.MediaPlayer, cfg: mplayer_contracts.PlayerConfig) {
        this._CONFIG = cfg;
        this._PLAYER = player;
    }

    /**
     * Gets the underlying configuration.
     */
    public get config(): mplayer_contracts.PlayerConfig {
        return this._CONFIG;
    }
    
    /** @inheritdoc */
    public dispose() {
        this.disposeOldItems();
    }

    protected disposeOldItems() {
        const OLD_ITEMS = this._disposables;
        if (OLD_ITEMS) {
            OLD_ITEMS.forEach(bc => {
                mplayer_helpers.tryDispose(bc);
            });
        }

        this._disposables = null;
    }

    /**
     * Initializes that instance.
     */
    public initialize() {
        const ME = this;

        this.disposeOldItems();

        try {
            const NEW_ITEMS: vscode.Disposable[] = [];
            this._disposables = NEW_ITEMS;

            const ID = ++nextButtonsId;

            const COMMAND_PREFIX = `extension.mediaPlayer.statusBar${ID}.`;

            // label
            {
                let label = mplayer_helpers.toStringSafe(ME.config.name).trim();
                if ('' === label) {
                    label = `Player #${ID + 1}`;
                }

                let btn: vscode.StatusBarItem;

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem());
                btn.text = label + ': ';
                btn.show();
            }

            // previous
            const CMD_PREV = `${COMMAND_PREFIX}prev`;
            {
                let btn: vscode.StatusBarItem;

                NEW_ITEMS.push(vscode.commands.registerCommand(CMD_PREV, async () => {
                    try {
                        await ME.player.prev();
                    }
                    catch (e) {
                        mplayer_helpers.log(`[ERROR] StatusBarController(prev): ${mplayer_helpers.toStringSafe(e)}`);
                    }
                }));

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem());
                btn.command = CMD_PREV;
                btn.text = '$(chevron-left)';
                btn.tooltip = 'PREVIOUS track';
                btn.show();
            }

            // toggle play
            let togglePlayButton: vscode.StatusBarItem;
            const CMD_TOGGLE_PLAY = `${COMMAND_PREFIX}togglePlay`;
            {
                NEW_ITEMS.push(vscode.commands.registerCommand(CMD_TOGGLE_PLAY, async () => {
                    try {
                        const STATUS = await ME.player.getStatus();
                        if (STATUS) {
                            switch (STATUS.state) {
                                case mplayer_contracts.State.Playing:
                                    await ME.player.pause();
                                    break;

                                default:
                                    await ME.player.play();
                                    break;
                            }
                        }
                    }
                    catch (e) {
                        mplayer_helpers.log(`[ERROR] StatusBarController(togglePlay): ${mplayer_helpers.toStringSafe(e)}`);
                    }
                }));

                NEW_ITEMS.push(togglePlayButton = vscode.window.createStatusBarItem());
                togglePlayButton.command = CMD_TOGGLE_PLAY;
                togglePlayButton.text = '---';
                togglePlayButton.show();
            }

            // next
            const CMD_NEXT = `${COMMAND_PREFIX}next`;
            {
                let btn: vscode.StatusBarItem;

                NEW_ITEMS.push(vscode.commands.registerCommand(CMD_NEXT, async () => {
                    try {
                        await ME.player.next();
                    }
                    catch (e) {
                        mplayer_helpers.log(`[ERROR] StatusBarController(next): ${mplayer_helpers.toStringSafe(e)}`);
                    }
                }));

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem());
                btn.command = CMD_NEXT;
                btn.text = '$(chevron-right)';
                btn.tooltip = 'NEXT track';
                btn.show();
            }

            // volumn down
            const CMD_VOLUME_DOWN = `${COMMAND_PREFIX}volumeDown`;
            {
                let btn: vscode.StatusBarItem;

                NEW_ITEMS.push(vscode.commands.registerCommand(CMD_VOLUME_DOWN, async () => {
                    try {
                        await ME.player.volumeDown();
                    }
                    catch (e) {
                        mplayer_helpers.log(`[ERROR] StatusBarController(volumeDown): ${mplayer_helpers.toStringSafe(e)}`);
                    }
                }));

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem());
                btn.command = CMD_VOLUME_DOWN;
                btn.text = '$(arrow-down)';
                btn.tooltip = 'Volume DOWN';
                btn.show();
            }

            // volumn up
            const CMD_VOLUME_UP = `${COMMAND_PREFIX}volumeUp`;
            {
                let btn: vscode.StatusBarItem;

                NEW_ITEMS.push(vscode.commands.registerCommand(CMD_VOLUME_UP, async () => {
                    try {
                        await ME.player.volumeUp();
                    }
                    catch (e) {
                        mplayer_helpers.log(`[ERROR] StatusBarController(volumeUp): ${mplayer_helpers.toStringSafe(e)}`);
                    }
                }));

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem());
                btn.command = CMD_VOLUME_UP;
                btn.text = '$(arrow-up)';
                btn.tooltip = 'Volume UP';
                btn.show();
            }

            // current track
            let trackButton: vscode.StatusBarItem;
            const CMD_SELECT_TRACK = `${COMMAND_PREFIX}selectTrack`;
            {
                NEW_ITEMS.push(vscode.commands.registerCommand(CMD_SELECT_TRACK, async () => {
                    try {
                        await mplayer_playlists.playTrack(ME.player);
                    }
                    catch (e) {
                        mplayer_helpers.log(`[ERROR] StatusBarController(selectTrack): ${mplayer_helpers.toStringSafe(e)}`);
                    }
                }));

                NEW_ITEMS.push(trackButton = vscode.window.createStatusBarItem());
                trackButton.command = CMD_SELECT_TRACK;
                trackButton.text = '';
                trackButton.show();
            }

            let isUpdatingStatus = false;
            NEW_ITEMS.push(new Timer(setInterval(async () => {
                if (isUpdatingStatus) {
                    return;
                }

                isUpdatingStatus = true;
                try {
                    let togglePlayText = '---';
                    let trackButtonText = '';

                    const STATUS = await ME.player.getStatus();
                    if (STATUS) {
                        togglePlayText = '$(primitive-square)';

                        switch (STATUS.state) {
                            case mplayer_contracts.State.Playing:
                                togglePlayText = '$(triangle-right)';
                                break;
                        }

                        if (STATUS.track) {
                            trackButtonText = mplayer_helpers.toStringSafe(STATUS.track.name).trim();
                        }
                    }

                    const TRACK_BTN_TOOLTIP_TEXT = trackButtonText;
                    if (trackButtonText.length > 32) {
                        trackButtonText = trackButtonText.substr(0, 32) + '...';
                    }

                    if (togglePlayButton.text !== togglePlayText) {
                        togglePlayButton.text = togglePlayText;
                    }

                    trackButton.text = trackButtonText;
                    trackButton.tooltip = TRACK_BTN_TOOLTIP_TEXT;
                }
                finally {
                    isUpdatingStatus = false;
                }
            }, 1000), (t) => clearInterval(t)));

            this._disposables = NEW_ITEMS;
        }
        catch (e) {
            this.disposeOldItems();

            throw e;
        }
    }

    /**
     * Gets the underlying player.
     */
    public get player(): mplayer_contracts.MediaPlayer {
        return this._PLAYER;
    }
}