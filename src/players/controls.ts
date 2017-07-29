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

    /**
     * Disposes all "old" items.
     */
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

        ME.disposeOldItems();

        try {
            let alignment: vscode.StatusBarAlignment;
            if (!mplayer_helpers.isNullOrUndefined(ME.config.showRight)) {
                if (mplayer_helpers.toBooleanSafe(ME.config.showRight)) {
                    alignment = vscode.StatusBarAlignment.Right;
                }
                else {
                    alignment = vscode.StatusBarAlignment.Left;
                }
            }

            let buttonOffset = parseInt( mplayer_helpers.toStringSafe(ME.config.buttonPriorityOffset).trim() );
            if (isNaN(buttonOffset)) {
                buttonOffset = 10;
            }

            const MAX_BUTTON_COUNT = 9;
            const GET_PRIORITY = (offset: number): number => {
                let playerId = parseInt( mplayer_helpers.toStringSafe(ME.player.id).trim() );
                if (isNaN(playerId)) {
                    playerId = 0;
                }

                const PRIORITY = MAX_BUTTON_COUNT - offset;

                try {
                    return Math.pow(MAX_BUTTON_COUNT, playerId + buttonOffset) + PRIORITY;
                }
                catch (e) {
                    return PRIORITY;
                }
            };

            const SET_BUTTON_VISIBILITY = (btn: vscode.StatusBarItem, flag: boolean) => {
                if (btn) {
                    if (mplayer_helpers.toBooleanSafe(flag)) {
                        btn.show();
                    }
                    else {
                        btn.hide();
                    }
                }
            };

            const UPDATE_BUTTON_TEXT = (btn: vscode.StatusBarItem, text: string, tooltip?: string,
                                        color?: string) => {
                color = mplayer_helpers.normalizeString(color);

                text = mplayer_helpers.toStringSafe(text);
                tooltip = mplayer_helpers.toStringSafe(tooltip);

                if (btn) {
                    if (btn.text !== text) {
                        btn.text = text;
                    }
                    if (btn.tooltip !== tooltip) {
                        btn.tooltip = tooltip;
                    }

                    if ('' !== color) {
                        if (btn.color !== color) {
                            btn.color = color;
                        }
                    }
                }
            };

            const NEW_ITEMS: vscode.Disposable[] = [];
            ME._disposables = NEW_ITEMS;

            const ID = ++nextButtonsId;

            const COMMAND_PREFIX = `extension.mediaPlayer.statusBar${ID}.`;

            // [0] label
            {
                let label = mplayer_helpers.toStringSafe(ME.config.name).trim();
                if ('' === label) {
                    label = `Player #${ID + 1}`;
                }

                let btn: vscode.StatusBarItem;

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(0)));
                btn.text = label + ': ';
                SET_BUTTON_VISIBILITY(btn, mplayer_helpers.toBooleanSafe( ME.config.showPlayerName ));
            }

            // [1] previous
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

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(1)));
                btn.command = CMD_PREV;
                btn.text = '$(chevron-left)';
                btn.tooltip = 'PREVIOUS track';
                SET_BUTTON_VISIBILITY(btn, mplayer_helpers.toBooleanSafe( ME.config.showPrevButton, true ));
            }

            // [2] toggle play
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

                NEW_ITEMS.push(togglePlayButton = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(2)));
                togglePlayButton.command = CMD_TOGGLE_PLAY;
                togglePlayButton.text = '---';
                SET_BUTTON_VISIBILITY(togglePlayButton, mplayer_helpers.toBooleanSafe( ME.config.showTogglePlayButton, true ));
            }

            // [3] next
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

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(3)));
                btn.command = CMD_NEXT;
                btn.text = '$(chevron-right)';
                btn.tooltip = 'NEXT track';
                SET_BUTTON_VISIBILITY(btn, mplayer_helpers.toBooleanSafe( ME.config.showNextButton, true ));
            }

            // [4] volumn down
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

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(4)));
                btn.command = CMD_VOLUME_DOWN;
                btn.text = '$(arrow-down)';
                btn.tooltip = 'Volume DOWN';
                SET_BUTTON_VISIBILITY(btn, mplayer_helpers.toBooleanSafe( ME.config.showVolumeButtons ));
            }

            // [5] volumn up
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

                NEW_ITEMS.push(btn = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(5)));
                btn.command = CMD_VOLUME_UP;
                btn.text = '$(arrow-up)';
                btn.tooltip = 'Volume UP';
                SET_BUTTON_VISIBILITY(btn, mplayer_helpers.toBooleanSafe( ME.config.showVolumeButtons ));
            }

            // [6] current track
            let trackButton: vscode.StatusBarItem;
            const CMD_SELECT_TRACK = `${COMMAND_PREFIX}selectTrack`;
            {
                NEW_ITEMS.push(vscode.commands.registerCommand(CMD_SELECT_TRACK, () => {
                    return mplayer_helpers.withProgress(async (ctx) => {
                        try {
                            await mplayer_playlists.playTrack(ME.player, ctx);
                        }
                        catch (e) {
                            mplayer_helpers.log(`[ERROR] StatusBarController(selectTrack): ${mplayer_helpers.toStringSafe(e)}`);
                        }
                    });
                }));

                NEW_ITEMS.push(trackButton = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(6)));
                trackButton.command = CMD_SELECT_TRACK;
                trackButton.text = '';
                SET_BUTTON_VISIBILITY(trackButton, mplayer_helpers.toBooleanSafe( ME.config.showTrackSelectorButton, true ));
            }

            // [7] toggle mute
            let toggleMuteButton: vscode.StatusBarItem;
            const CMD_TOGGLE_MUTE = `${COMMAND_PREFIX}toggleMute`;
            {
                let lastVolumn: number;
                let isTogglinMute = false;
                NEW_ITEMS.push(vscode.commands.registerCommand(CMD_TOGGLE_MUTE, async () => {
                    if (isTogglinMute) {
                        return;
                    }

                    isTogglinMute = true;
                    await mplayer_helpers.withProgress(async (progress) => {
                        try {
                            const STATUS = await ME.player.getStatus();
                            if (STATUS) {
                                let newVolume: number;

                                if (mplayer_helpers.toBooleanSafe(STATUS.isMute, true)) {
                                    newVolume = lastVolumn;

                                    progress.message = 'Unmute player...';
                                }
                                else {
                                    newVolume = 0.0;
                                    lastVolumn = STATUS.volume;

                                    progress.message = 'Mute player...';
                                }

                                if (isNaN(newVolume)) {
                                    newVolume = 1.0;
                                }

                                await ME.player.setVolume(newVolume);
                            }
                        }
                        catch (e) {
                            mplayer_helpers.log(`[ERROR] StatusBarController(toggleMute): ${mplayer_helpers.toStringSafe(e)}`);
                        }
                        finally {
                            isTogglinMute = false;
                        }
                    });
                }));

                NEW_ITEMS.push(toggleMuteButton = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(7)));
                toggleMuteButton.command = CMD_TOGGLE_MUTE;
                toggleMuteButton.text = '';
                SET_BUTTON_VISIBILITY(toggleMuteButton, mplayer_helpers.toBooleanSafe( ME.config.showToggleMuteButton, true ));
            }

            // [8] info button
            let infoButton: vscode.StatusBarItem;
            {
                NEW_ITEMS.push(infoButton = vscode.window.createStatusBarItem(alignment, GET_PRIORITY(8)));
                infoButton.text = '';
                infoButton.hide();
            }

            // status updater
            let isUpdatingStatus = false;
            NEW_ITEMS.push(new Timer(setInterval(async () => {
                if (isUpdatingStatus) {
                    return;
                }

                isUpdatingStatus = true;
                try {
                    let toggleMuteColor = '#ffffff';
                    let toggleMuteText = '';
                    let toggleMuteTooltipText = '';
                    let togglePlayText = '---';
                    let togglePlayTooltipText = '';
                    let track: mplayer_contracts.Track;
                    let trackButtonText = '';

                    const STATUS = await ME.player.getStatus();
                    if (STATUS) {
                        track = STATUS.track;

                        togglePlayText = '$(primitive-square)';
                        togglePlayTooltipText = 'Not playing (click to START)';

                        switch (STATUS.state) {
                            case mplayer_contracts.State.Playing:
                                togglePlayText = '$(triangle-right)';
                                togglePlayTooltipText = 'Playing  (click to STOP)';
                                break;
                        }

                        if (track) {
                            trackButtonText = mplayer_helpers.toStringSafe(STATUS.track.name).trim();
                        }

                        if (!mplayer_helpers.isNullOrUndefined(STATUS.isMute)) {
                            if (mplayer_helpers.toBooleanSafe(STATUS.isMute)) {
                                toggleMuteText = '$(mute)';
                                toggleMuteTooltipText = "MUTE\n\n(click here to UNMUTE)";

                                toggleMuteColor = '#808080';
                            }
                            else {
                                toggleMuteTooltipText = 'click here to MUTE';

                                if (!isNaN(STATUS.volume)) {
                                    toggleMuteTooltipText = `Volume: ${Math.floor(STATUS.volume * 100.0)}%\n\n(${toggleMuteTooltipText})`;
                                }

                                toggleMuteText = '$(unmute)';
                            }
                        }
                    }

                    let trackButtonToolTipText = `Track: '${trackButtonText}'`;
                    if (track) {
                        if (track.playlist) {
                            let playlistName = mplayer_helpers.toStringSafe(track.playlist.name).trim();
                            if ('' === playlistName) {
                                playlistName = `Playlist ${mplayer_helpers.toStringSafe(track.playlist.id).trim()}`;
                            }

                            trackButtonToolTipText += `\nPlaylist: '${playlistName}'`;
                        }
                    }
                    trackButtonToolTipText += "\n\n(click here to select another track)";

                    if (trackButtonText.length > 32) {
                        trackButtonText = trackButtonText.substr(0, 32) + '...';
                    }

                    UPDATE_BUTTON_TEXT(togglePlayButton, togglePlayText, togglePlayTooltipText);
                    UPDATE_BUTTON_TEXT(trackButton, trackButtonText, trackButtonToolTipText);
                    UPDATE_BUTTON_TEXT(toggleMuteButton, toggleMuteText, toggleMuteTooltipText,
                                       toggleMuteColor);

                    // info button
                    try {
                        let infoButtonText = '';
                        let infoButtonTooltipText = '';
                        let infoButtonColor = '';
                        let infoButtonCommand = '';

                        if (STATUS.button) {
                            infoButtonText = mplayer_helpers.toStringSafe(STATUS.button.text);
                            infoButtonTooltipText = mplayer_helpers.toStringSafe(STATUS.button.tooltip);

                            infoButtonColor = mplayer_helpers.normalizeString(STATUS.button.color);
                            infoButtonCommand = mplayer_helpers.toStringSafe(STATUS.button.command);
                        }

                        if (mplayer_helpers.isEmptyString(infoButtonColor)) {
                            infoButtonColor = '#ffffff';
                        }
                        if (mplayer_helpers.isEmptyString(infoButtonCommand)) {
                            infoButtonCommand = undefined;
                        }

                        infoButton.command = infoButtonCommand;
                        infoButton.color = infoButtonColor;

                        UPDATE_BUTTON_TEXT(infoButton, infoButtonText, infoButtonTooltipText);

                        if (mplayer_helpers.isEmptyString(infoButtonText)) {
                            infoButton.hide();
                        }
                        else {
                            infoButton.show();
                        }
                    }
                    catch (e) {

                    }
                }
                finally {
                    isUpdatingStatus = false;
                }
            }, 1000), (t) => clearInterval(t)));

            ME._disposables = NEW_ITEMS;
        }
        catch (e) {
            ME.disposeOldItems();

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