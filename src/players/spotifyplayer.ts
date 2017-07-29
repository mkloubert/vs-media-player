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
import * as mplayer_contracts from '../contracts';
import * as mplayer_helpers from '../helpers';
const SpotifyWebApi = require('spotify-web-api-node');
import { Spotilocal } from 'spotilocal';
import * as URL from 'url';


/**
 * A Spotify player.
 */
export class SpotifyPlayer extends Events.EventEmitter implements mplayer_contracts.MediaPlayer {
    /**
     * Stores the current client.
     */
    protected _client: Spotilocal;
    /**
     * Stores the underlying configuration.
     */
    protected readonly _CONFIG: mplayer_contracts.SpotifyPlayerConfig;
    /**
     * Stores the ID.
     */
    protected readonly _ID: number;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {mplayer_contracts.SpotifyPlayerConfig} cfg The underlying configuration.
     */
    constructor(id: number, cfg: mplayer_contracts.SpotifyPlayerConfig) {
        super();

        if (!cfg) {
            cfg = <any>{};
        }

        this._ID = id;
        this._CONFIG = cfg;
    }

    /**
     * Gets the current client.
     */
    public get client(): Spotilocal {
        return this._client;
    }

    /**
     * Gets the config.
     */
    public get config(): mplayer_contracts.SpotifyPlayerConfig {
        return this._CONFIG;
    }

    /** @inheritdoc */
    public connect() {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            if (!mplayer_helpers.isNullOrUndefined(ME._client)) {
                COMPLETED(null, false);
                return;
            }

            try {
                const NEW_CLIENT = new Spotilocal();
                NEW_CLIENT.init().then((client) => {
                    ME._client = client || NEW_CLIENT;

                    COMPLETED(null, true);
                }).catch((err) => {
                    COMPLETED(err);
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * Creates a simple 'completed' callback for a promise.
     * 
     * @param {Function} resolve The 'succeeded' callback.
     * @param {Function} reject The 'error' callback.
     * 
     * @return {SimpleCompletedAction<TResult>} The created action.
     */
    protected createCompletedAction<TResult>(resolve: (value?: TResult | PromiseLike<TResult>) => void,
                                             reject?: (reason: any) => void): mplayer_helpers.SimpleCompletedAction<TResult> {
        const ME = this;
        let completedInvoked = false;

        return (err, result?) => {
            if (completedInvoked) {
                return;
            }

            completedInvoked = true;
            
            if (err) {
                if (reject) {
                    reject(err);
                }
            }
            else {
                if (resolve) {
                    resolve(result);
                }
            }
        };
    }

    /**
     * Gets the CSRF.
     */
    public get csrf(): string {
        return this.client['csrf'];
    }

    /** @inheritdoc */
    public dispose() {
        this.removeAllListeners();
    }

    /**
     * Executes a generic command.
     * 
     * @param {string} command The name of the command.
     * @param {Map<string, any>} [additionalProps] The additional parameters.
     * 
     * @returns {Promise<TResult>} The promise with the result.
     */
    public genericCommand<TResult = any>(command: string, additionalProps?: Map<string, any>): Promise<TResult> {
        const ME = this;
        const ALL_ARGS = arguments;

        return new Promise<TResult>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const C: any = ME.client;

                C['genericCommand'].apply(C, ALL_ARGS).then((result) => {
                    COMPLETED(null, result);
                }).catch((err) => {
                    COMPLETED(err);
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public getPlaylists() {
        const ME = this;

        return new Promise<mplayer_contracts.Playlist[]>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            //TODO: Not supported
            try {
                ME.client.getStatus().then(async (spotifyStatus) => {
                    try {
                        const PLAYLISTS: mplayer_contracts.Playlist[] = [];

                        const STATUS = await ME.getStatus();
                        if (STATUS) {
                            if (STATUS.track) {
                                if (STATUS.track.playlist) {
                                    PLAYLISTS.push( STATUS.track.playlist );
                                }
                            }
                        }

                        COMPLETED(null, PLAYLISTS);
                    }
                    catch (e) {
                        COMPLETED(e);
                    }
                }).catch((err) => {
                    COMPLETED(err);
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public getStatus() {
        const ME = this;

        return new Promise<mplayer_contracts.PlayerStatus>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            //TODO: Implement
            try {
                this.client.getStatus().then((spotifyStatus) => {
                    try {
                        const STATUS: mplayer_contracts.PlayerStatus = {
                            isConnected: undefined,
                            player: ME,
                        };

                        let track: mplayer_contracts.Track;
                        if (spotifyStatus.track) {
                            track = {
                                id: spotifyStatus.track.track_resource.uri,
                                name: spotifyStatus.track.track_resource.name,
                                play: () => {
                                    return Promise.resolve(false);
                                },
                                playlist: undefined,
                            };

                            const DUMMY_PLAYLIST: mplayer_contracts.Playlist = {
                                id: '1',
                                getTracks: () => {
                                    return Promise.resolve( [ track ] );
                                },
                                player: ME,
                            };

                            // track.playlist
                            Object.defineProperty(STATUS, 'playlist', {
                                enumerable: true,
                                get: function() {
                                    return DUMMY_PLAYLIST;
                                }
                            });
                        }

                        // STATUS.isConnected
                        Object.defineProperty(STATUS, 'isConnected', {
                            enumerable: true,
                            get: function() {
                                return this.player.isConnected;
                            }
                        });

                        // STATUS.isMute
                        Object.defineProperty(STATUS, 'isMute', {
                            enumerable: true,
                            get: function() {
                                return this.volume <= 0.0;
                            }
                        });

                        // STATUS.state
                        Object.defineProperty(STATUS, 'state', {
                            enumerable: true,
                            get: function() {
                                if (mplayer_helpers.toBooleanSafe(spotifyStatus.playing)) {
                                    return mplayer_contracts.State.Playing;
                                }

                                return mplayer_contracts.State.Paused;
                            }
                        });

                        // STATUS.track
                        Object.defineProperty(STATUS, 'track', {
                            enumerable: true,
                            get: function() {
                                return track;
                            }
                        });

                        // STATUS.volume
                        Object.defineProperty(STATUS, 'volume', {
                            enumerable: true,
                            get: function() {
                                return spotifyStatus.volume;
                            }
                        });

                        COMPLETED(null, STATUS);
                    }
                    catch (e) {
                        COMPLETED(e);
                    }
                }).catch((err) => {
                    COMPLETED(err);
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public get id(): number {
        return this._ID;
    }

    /** @inheritdoc */
    public get isConnected(): boolean {
        return !mplayer_helpers.isNullOrUndefined(this._client);
    }

    /**
     * Gets the URL of 'spotilocal' service.
     */
    public get localUrl(): string {
        return this.client['spotilocalUrl'];
    }

    /** @inheritdoc */
    public next(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            //TODO: Not supported
            try {
                COMPLETED(null, false);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * Gets the OAuth token.
     */
    public get oauthToken(): string {
        return this.client['oauth'];
    }

    /** @inheritdoc */
    public pause(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                ME.client.pause(true).then((spotifyStatus) => {
                    COMPLETED(null,
                              !mplayer_helpers.toBooleanSafe(spotifyStatus.playing));
                }).catch((err) => {
                    COMPLETED(err);
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public play(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            ME.client.pause(false).then((spotifyStatus) => {
                COMPLETED(null,
                          mplayer_helpers.toBooleanSafe(spotifyStatus.playing));
            }).catch((err) => {
                COMPLETED(err);
            });
        });
    }

    /** @inheritdoc */
    public prev(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            //TODO: Not supported
            try {
                COMPLETED(null, false);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public setVolume(newValue: number): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            //TODO: Not supported
            try {
                COMPLETED(null, false);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public volumeDown(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            //TODO: Not supported
            try {
                COMPLETED(null, false);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public volumeUp(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            //TODO: Not supported
            try {
                COMPLETED(null, false);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }
}
