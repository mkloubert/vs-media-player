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

import * as vscode from 'vscode';


/**
 * A quick pick item based on an action.
 */
export interface ActionQuickPickItem extends vscode.QuickPickItem {
    /**
     * The action.
     * 
     * @param {any} state The value from 'state' property.
     * @param {ActionQuickPickItem} item The underlying object.
     * 
     * @return {any} The result.
     */
    action?: (state: any, item: ActionQuickPickItem) => any;
    /**
     * The value for the 1st argument of the action.
     */
    state?: any;
}

/**
 * Extension settings.
 */
export interface Configuration extends vscode.WorkspaceConfiguration {
    /**
     * A list of one or more player settings.
     */
    readonly players?: PlayerConfig[];
}

/**
 * A media player.
 */
export interface MediaPlayer extends NodeJS.EventEmitter, vscode.Disposable {
    /**
     * Gets the underlying config.
     */
    readonly config?: PlayerConfig;
    /**
     * Configures the player.
     * 
     * @type {PromiseLike<boolean>} The promise with the state that indicates if operation was successful or not.
     */
    readonly configure?: () => PromiseLike<boolean>;
    /**
     * Connects to the player.
     * 
     * @memberof MediaPlayer
     */
    readonly connect: () => any;
    /**
     * Returns the list of playlists.
     * 
     * @return {PromiseLike<Playlist[]>} The promise with the playlists.
     */
    readonly getPlaylists: () => PromiseLike<Playlist[]>;
    /**
     * Returns the player status.
     * 
     * @return {PromiseLike<PlayerStatus>} The player status.
     */
    readonly getStatus: () => PromiseLike<PlayerStatus>;
    /**
     * The ID.
     */
    readonly id: number;
    /**
     * Initializes the player.
     * 
     * @return {any} The result.
     */
    readonly initialize: () => any;
    /**
     * Gets if the player is connected or not.
     */
    readonly isConnected: boolean;
    /**
     * Gets if the player has been initialized or not.
     */
    readonly isInitialized: boolean;
    /**
     * Plays / selects the next track.
     * 
     * @return {PromiseLike<boolean>} The promise which indicates if operation was successful or not.
     */
    readonly next: () => PromiseLike<boolean>;
    /**
     * Pauses playing.
     * 
     * @return {PromiseLike<boolean>} The promise which indicates if operation was successful or not.
     */
    readonly pause: () => PromiseLike<boolean>;
    /**
     * Continues playing.
     * 
     * @return {PromiseLike<boolean>} The promise which indicates if operation was successful or not.
     */
    readonly play: () => PromiseLike<boolean>;
    /**
     * Plays / selects the previous track.
     * 
     * @return {PromiseLike<boolean>} The promise which indicates if operation was successful or not.
     */
    readonly prev: () => PromiseLike<boolean>;
    /**
     * Sets the volume of the player.
     * 
     * @param {number} newValue The new value (0 = 0%, 1.0 = 100%)
     * 
     * @return {PromiseLike<boolean>} The promise which indicates if operation was successful or not.
     */
    readonly setVolume: (newValue: number) => PromiseLike<boolean>;
    /**
     * Decreases the volume.
     * 
     * @return {PromiseLike<boolean>} The promise which indicates if operation was successful or not.
     */
    readonly volumeDown: () => PromiseLike<boolean>;
    /**
     * Increases the volume.
     * 
     * @return {PromiseLike<boolean>} The promise which indicates if operation was successful or not.
     */
    readonly volumeUp: () => PromiseLike<boolean>;
}

/**
 * Describes the structure of the package file of that extenstion.
 */
export interface PackageFile {
    /**
     * The display name.
     */
    readonly displayName: string;
    /**
     * The (internal) name.
     */
    readonly name: string;
    /**
     * The version string.
     */
    readonly version: string;
}

/**
 * A player config entry.
 */
export interface PlayerConfig {
    /**
     * [INTERNAL USE]
     * 
     * The ID of the entry.
     */
    readonly __id: number;

    /**
     * A custom offset value for controling the priority of the buttons.
     */
    readonly buttonPriorityOffset?: number;
    /**
     * Connect on startup or not.
     */
    readonly connectOnStartup?: boolean;
    /**
     * A description for the player.
     */
    readonly description?: string;
    /**
     * A (display) name for the player.
     */
    readonly name?: string;
    /**
     * Show button for playing NEXT track or not.
     */
    readonly showNextButton?: boolean;
    /**
     * Show player name or not.
     */
    readonly showPlayerName?: boolean;
    /**
     * Show button for playing PREVIOUS track or not.
     */
    readonly showPrevButton?: boolean;
    /**
     * Show buttons on the RIGHT side or not.
     */
    readonly showRight?: boolean;
    /**
     * Show button for toggle mute state or not.
     */
    readonly showToggleMuteButton?: boolean;
    /**
     * Show button for toggle play state or not.
     */
    readonly showTogglePlayButton?: boolean;
    /**
     * Show button for selecting a track or not.
     */
    readonly showTrackSelectorButton?: boolean;
    /**
     * Show buttons to change volume or not.
     */
    readonly showVolumeButtons?: boolean;
    /**
     * The type.
     */
    readonly type?: "vlc" | "spotify";
}

/**
 * A player status.
 */
export interface PlayerStatus {
    /**
     * Info button.
     */
    readonly button?: PlayerStatusInfoButton;
    /**
     * Gets if the player is currently connected or not.
     */
    readonly isConnected: boolean;
    /**
     * Gets if the player is in 'mute' state or not.
     */
    readonly isMute?: boolean;
    /**
     * Gets the underlyong player.
     */
    readonly player: MediaPlayer;
    /**
     * The state.
     */
    readonly state?: State;
    /**
     * The current track.
     */
    readonly track?: Track;
    /**
     * The current volumn (0 = 0%, 1.0 = 100%)
     */
    readonly volume?: number;
}

/**
 * Player status info button data.
 */
export interface PlayerStatusInfoButton {
    /**
     * Color
     */
    readonly color?: string;
    /**
     * Command
     */
    readonly command?: string;
    /**
     * Text
     */
    readonly text?: string;
    /**
     * Tooltip
     */
    readonly tooltip?: string;
}

/**
 * A playlist.
 */
export interface Playlist {
    /**
     * Gets the description (if available).
     */
    readonly description?: string;
    /**
     * Returns the list of tracks.
     * 
     * @returns {PromiseLike<Track[]>} The promise with the tracks.
     */
    readonly getTracks: () => PromiseLike<Track[]>;
    /**
     * Gets the ID.
     */
    readonly id: any;
    /**
     * Gets the name (if available).
     */
    readonly name?: string;
    /**
     * Gets the underlying player.
     */
    readonly player: MediaPlayer;
}

/**
 * A Spotify player config entry.
 */
export interface SpotifyPlayerConfig extends PlayerConfig {
    /**
     * [INTERNAL USE]
     * 
     * Last OAuth code.
     */
    __code?: string;

    /**
     * The client ID of an own registered Spotify app.
     */
    readonly clientID?: string;
    /**
     * The client secret of an own registered Spotify app.
     */
    readonly clientSecret?: string;
    /**
     * The redirect URL for the authorization..
     */
    readonly redirectURL?: string;
    /** @inheritdoc */
    readonly type: "spotify";
}

/**
 * List of states.
 */
export enum State {
    /**
     * Stopped
     */
    Stopped = 0,
    /**
     * Paused
     */
    Paused = 1,
    /**
     * Playing
     */
    Playing = 2,
}

/**
 * A playlist.
 */
export interface Track {
    /**
     * Gets the description (if available).
     */
    readonly description?: string;
    /**
     * Gets the ID.
     */
    readonly id: any;
    /**
     * Gets the name.
     */
    readonly name: string;
    /**
     * Plays the track.
     * 
     * @return {PromiseLike<boolean>} The promise with the flag that indicates
     *                                if operation was successful or not.
     */
    readonly play: () => PromiseLike<boolean>;
    /**
     * Gets the underlying playlist.
     */
    readonly playlist: Playlist;
}

/**
 * A VLC player config entry.
 */
export interface VLCPlayerConfig extends PlayerConfig {
    /**
     * The host of the HTTP service.
     */
    readonly host?: string;
    /**
     * The password to use.
     */
    readonly password?: string;
    /**
     * The TCP port of the HTTP service.
     */
    readonly port?: number;
    /** @inheritdoc */
    readonly type: "vlc";
}
