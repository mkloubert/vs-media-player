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
import * as vscode from 'vscode';


type TrackListProvider = () => PromiseLike<mplayer_contracts.Track[]>;

let nextCommandId = -1;

class WebApi {
    protected _client: any;
    protected readonly _CONFIG: mplayer_contracts.SpotifyPlayerConfig;
    protected _expiresIn: Moment.Moment;
    
    constructor(cfg: mplayer_contracts.SpotifyPlayerConfig) {
        this._CONFIG = cfg;
    }

    public get code(): string {
        return this._CONFIG.__code;
    }

    public get config(): mplayer_contracts.SpotifyPlayerConfig {
        return this._CONFIG;
    }

    public async getClient(): Promise<any> {
        try {
            const CODE = this.code;
            if (!mplayer_helpers.isEmptyString(CODE)) {
                let createNewClient = true;

                if (this._client) {
                    let EXPIRES_IN = this._expiresIn;
                    if (EXPIRES_IN) {
                        const NOW = Moment.utc();

                        createNewClient = EXPIRES_IN.isSameOrBefore(NOW);
                    }
                }

                if (createNewClient) {
                    const NEW_CLIENT = new SpotifyWebApi({
                        clientId : mplayer_helpers.toStringSafe(this.config.clientID),
                        clientSecret : mplayer_helpers.toStringSafe(this.config.clientSecret),
                        redirectUri : mplayer_helpers.toStringSafe(this.config.redirectURL),
                    });

                    const DATA = await NEW_CLIENT.authorizationCodeGrant( CODE );

                    NEW_CLIENT.setAccessToken(DATA.body['access_token']);

                    this._expiresIn = Moment.utc()
                                            .add( parseInt(mplayer_helpers.toStringSafe(DATA.body['expires_in']).trim()),
                                                  'seconds' );
                    this._client = NEW_CLIENT;
                }
            }
            else {
                this._client = null;
                this._expiresIn = null;
            }
        }
        catch (e) {
            this._client = null;
            this._expiresIn = null;

            console.log(`[ERROR] SpotifyPlayer.WebApi.getClient(): ${mplayer_helpers.toStringSafe(e)}`);
        }
        
        return this._client;
    }
}

/**
 * A Spotify player.
 */
export class SpotifyPlayer extends Events.EventEmitter implements mplayer_contracts.MediaPlayer {
    /**
     * Stores the current API.
     */
    protected readonly _API: WebApi;
    /**
     * Stores the command to authorize with Web API.
     */
    protected _authorizeWebAPICommand: vscode.Disposable;
    /**
     * Stores the name of the VSCode command to authorize with Web API.
     */
    protected _authorizeWebAPICommandName: string;
    /**
     * Stores the current client.
     */
    protected _client: Spotilocal;
    /**
     * Stores the underlying configuration.
     */
    protected readonly _CONFIG: mplayer_contracts.SpotifyPlayerConfig;
    /**
     * Stores the underlying extension context.
     */
    protected readonly _CONTEXT: vscode.ExtensionContext;
    /**
     * Stores the ID.
     */
    protected readonly _ID: number;
    /**
     * Stores if player has been initialized or not.
     */
    protected _isInitialized = false;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {mplayer_contracts.SpotifyPlayerConfig} cfg The underlying configuration.
     * @param {vscode.ExtensionContext} context The extension context.
     */
    constructor(id: number,
                cfg: mplayer_contracts.SpotifyPlayerConfig, context: vscode.ExtensionContext) {
        super();

        if (!cfg) {
            cfg = <any>{};
        }

        this._ID = id;
        this._CONFIG = cfg;
        this._CONTEXT = context;
        this._API = new WebApi(cfg);
    }

    /**
     * Authorizes for Spotify.
     * 
     * @returns {Promise<any>} The promise.
     */
    protected authorizeWithWebAPI(): Promise<any> {
        const ME = this;

        return new Promise<any>((resolve, reject) => {
            const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

            try {
                const CLIENT_ID = mplayer_helpers.toStringSafe(ME.config.clientID);
                if (mplayer_helpers.isEmptyString(CLIENT_ID)) {
                    vscode.window.showWarningMessage("[vs-media-player] Please define the 'clientID' property!").then(() => {
                    }, (err) => {
                        ME.log(`MediaPlayerController.authorizeForSpotify(2): ${mplayer_helpers.toStringSafe(err)}`);
                    });

                    COMPLETED(null);
                    return;
                }

                const REDIRECT_URL = mplayer_helpers.toStringSafe(ME.config.redirectURL);
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
                                ME.config.__code = CODE;

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
        });
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
     * Creates a track list provider for a playlist.
     * 
     * @param {any} client The Web API client.
     * @param {string} user The user.
     * @param {mplayer_contracts.Playlist} playlist The playlist.
     * 
     * @return {TrackListProvider} The function.
     */
    protected createTrackListProvider(client: any, user: string, playlist: mplayer_contracts.Playlist): TrackListProvider {
        const ME = this;

        return () => {
            return new Promise<mplayer_contracts.Track[]>(async (resolve, reject) => {
                const TRACKS: mplayer_contracts.Track[] = [];

                try {
                    const PLAYLIST_TRACKS = await client.getPlaylistTracks(user, playlist.id, { 'offset' : 0, 'fields' : 'items' });
                    if (PLAYLIST_TRACKS) {
                        const ITEMS = mplayer_helpers.asArray(PLAYLIST_TRACKS.body['items']).filter(i => i);
                        ITEMS.forEach(i => {
                            const TRACK_DATA = i['track'];
                            if (TRACK_DATA) {
                                const NEW_TRACK: mplayer_contracts.Track = {
                                    id: mplayer_helpers.toStringSafe(TRACK_DATA['uri']),
                                    name: mplayer_helpers.toStringSafe(TRACK_DATA['name']),
                                    play: function() {
                                        return new Promise<boolean>(async (res, rej) => {
                                            try {
                                                await ME.client.play( mplayer_helpers.toStringSafe(TRACK_DATA['uri']) );

                                                res(true);
                                            }
                                            catch (e) {
                                                rej(e);
                                            }
                                        });
                                    },
                                    playlist: playlist,
                                };

                                TRACKS.push(NEW_TRACK);
                            }
                        });
                    }
                }
                catch (e) { }

                resolve(TRACKS);
            });
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
        mplayer_helpers.tryDispose( this._authorizeWebAPICommand );

        this.removeAllListeners();
    }

    /** @inheritdoc */
    public get extension(): vscode.ExtensionContext {
        return this._CONTEXT;
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
                try {
                    const CLIENT = await ME._API.getClient();
                    if (CLIENT) {
                        const USER = await CLIENT.getMe();
                        if (USER) {
                            const USER_ID: string = mplayer_helpers.toStringSafe(USER.body['id']);
                            if (!mplayer_helpers.isEmptyString(USER_ID)) {
                                const PLAYLISTS: mplayer_contracts.Playlist[] = [];

                                const PLAYLIST_DATA = await CLIENT.getUserPlaylists(USER_ID);
                                if (PLAYLIST_DATA) {
                                    const ITEMS = mplayer_helpers.asArray(PLAYLIST_DATA.body['items']).filter(i => i);
                                    ITEMS.forEach(i => {
                                        const NEW_PLAYLIST: mplayer_contracts.Playlist = {
                                            id: mplayer_helpers.toStringSafe(i['uri']),
                                            getTracks: undefined,
                                            name: mplayer_helpers.toStringSafe(i['name']),
                                            player: ME,
                                        };

                                        (<any>NEW_PLAYLIST)['getTracks'] = ME.createTrackListProvider(CLIENT, USER_ID, NEW_PLAYLIST);

                                        PLAYLISTS.push(NEW_PLAYLIST);
                                    });
                                }

                                COMPLETED(null, PLAYLISTS);
                                return;
                            }
                        }
                    }
                }
                catch (e) { }

                // use fallback...
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
                this.client.getStatus().then(async (spotifyStatus) => {
                    try {
                        const BUTTON: mplayer_contracts.PlayerStatusInfoButton = {
                        };

                        const STATUS: mplayer_contracts.PlayerStatus = {
                            button: BUTTON,
                            isConnected: undefined,
                            player: ME,
                        };

                        let track: mplayer_contracts.Track;
                        if (spotifyStatus.track) {
                            if (!track) {
                                // use fallback
                            
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

                        let isAuthorized = false;
                        try {
                            const CLIENT = await ME._API.getClient();
                            if (CLIENT) {
                                const USER = await CLIENT.getMe();
                                if (USER) {
                                    isAuthorized = true;
                                }
                            }
                        }
                        catch (e) { }

                        if (!isAuthorized) {
                            (<any>BUTTON)['command'] = ME._authorizeWebAPICommandName;
                            (<any>BUTTON)['text'] = '$(plug)';
                            (<any>BUTTON)['tooltip'] = 'Not authorized!';
                            (<any>BUTTON)['color'] = '#ffff00';
                        }

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
    public initialize(): void {
        if (!this.isInitialized) {
            const ME = this;
            const CMD_ID_SUFFIX = ++nextCommandId;

            const CMD_NAME = 'extension.mediaPlayer.spotify.authorize' + CMD_ID_SUFFIX;
            ME._authorizeWebAPICommand = vscode.commands.registerCommand(CMD_NAME, async () => {
                await ME.authorizeWithWebAPI();
            });
            ME._authorizeWebAPICommandName = CMD_NAME;

            this._isInitialized = true;
        }
    }

    /** @inheritdoc */
    public get isConnected(): boolean {
        return !mplayer_helpers.isNullOrUndefined(this._client);
    }

    /** @inheritdoc */
    public get isInitialized(): boolean {
        return this._isInitialized;
    }

    /**
     * Gets the URL of 'spotilocal' service.
     */
    public get localUrl(): string {
        return this.client['spotilocalUrl'];
    }

    /**
     * Logs a message.
     * 
     * @param {any} msg The message to log.
     * 
     * @returns {this}
     */
    public log(msg: any): this {
        mplayer_helpers.log(msg);
        return this;
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
