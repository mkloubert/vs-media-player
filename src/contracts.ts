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
 * Extension settings.
 */
export interface Configuration extends vscode.WorkspaceConfiguration {
    /**
     * A list of one or more player settings.
     */
    players?: PlayerConfig[];
}

/**
 * A media player.
 */
export interface MediaPlayer extends vscode.Disposable {
    /**
     * Gets the underlying config.
     */
    readonly config?: PlayerConfig;
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
     * Gets if the player is connected or not.
     */
    readonly isConnected: boolean;
    /**
     * Plays / selects the next track.
     */
    readonly next: () => PromiseLike<boolean>;
    /**
     * Plays / selects the previous track.
     */
    readonly prev: () => PromiseLike<boolean>;
}

/**
 * Describes the structure of the package file of that extenstion.
 */
export interface PackageFile {
    /**
     * The display name.
     */
    displayName: string;
    /**
     * The (internal) name.
     */
    name: string;
    /**
     * The version string.
     */
    version: string;
}

/**
 * A player config entry.
 */
export interface PlayerConfig {
    /**
     * A description for the player.
     */
    description?: string;
    /**
     * A (display) name for the player.
     */
    name?: string;
    /**
     * The type.
     */
    type?: "vlc";
}

/**
 * A player status.
 */
export interface PlayerStatus {
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
 * List of states.
 */
export enum State {
    /**
     * Paused
     */
    Paused = 1,
    /**
     * Playing
     */
    Playing = 0,
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
    host?: string;
    /**
     * The password to use.
     */
    password?: string;
    /**
     * The TCP port of the HTTP service.
     */
    port?: number;
    /** @inheritdoc */
    type: "vlc";
}
