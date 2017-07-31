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

import * as Crypto from 'crypto';
import * as Enumerable from 'node-enumerable';
import * as Events from 'events';
import * as HTTP from 'http';
import * as HTTPs from 'https';
import * as Moment from 'moment';
import * as mplayer_contracts from '../contracts';
import * as mplayer_helpers from '../helpers';
import * as mplayer_players_helpers from './helpers';
import * as mplayer_oauth from '../oauth';
const SpotifyWebApi = require('spotify-web-api-node');
import { Spotilocal } from 'spotilocal';
import * as URL from 'url';
import * as vscode from 'vscode';


type DeviceSelector = () => PromiseLike<boolean>;


/**
 * A Spotify player config entry.
 */
export interface SpotifyPlayerConfig extends mplayer_contracts.PlayerConfig {
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
     * The redirect URL for the authorization.
     */
    readonly redirectURL?: string;
    /** @inheritdoc */
    readonly type: "spotify";
}

interface WebAPIDevice {
    id: string;
    is_active: boolean;
    is_restricted: boolean;
    name: string;
}

interface WebAPIDeviceResult {
    devices: WebAPIDevice[];
}

interface WebAPIPlayerStatus {
    repeat_state?: string;
}

interface WebAPIPlaylistSearchResult {
    playlists: {
        items: WebAPIPlaylistSearchResultItem[];
    };
}

interface WebAPIPlaylistSearchResultItem {
    id: string;
    name: string;
    owner: {
        id: string;
        uri: string;
    },
    uri: string;
}

interface WebAPISettings {
    accessToken?: string;
    code?: string;
    expiresIn?: string;
}

interface WebAPISettingsRepository {
    [name: string]: WebAPISettings;
}

interface WebAPITrackSearchResult {
    tracks: {
        items: WebAPITrackSearchResultItem[];
    };
}

interface WebAPITrackSearchResultItem {
    artists: {
        id: string;
        name: string;
        uri: string;
    }[],
    id: string;
    name: string;
    uri: string;
}

type TrackListProvider = () => PromiseLike<mplayer_contracts.Track[]>;

type TrackPlayer = () => PromiseLike<boolean>;

let nextCommandId = -1;
const REPO_KEY = 'vscMediaPlayerSpotifyWebAPI';

class WebApi {
    protected readonly _CONFIG: SpotifyPlayerConfig;
    protected readonly _CONTEXT: vscode.ExtensionContext;
    
    constructor(cfg: SpotifyPlayerConfig,
                context: vscode.ExtensionContext) {
        this._CONFIG = cfg;
        this._CONTEXT = context;
    }

    public get code(): string {
        return this._CONFIG.__code;
    }

    public get config(): SpotifyPlayerConfig {
        return this._CONFIG;
    }

    public get context(): vscode.ExtensionContext {
        return this._CONTEXT;
    }

    public async getClient(): Promise<any> {
        const ME = this;

        let client: any = null;
        
        const REPO = ME.context.globalState.get<WebAPISettingsRepository>(REPO_KEY);

        let settings: WebAPISettings;
        const SETTINGS_KEY = ME.getSettingsKey();
        if (!mplayer_helpers.isEmptyString(SETTINGS_KEY)) {
            settings = REPO[SETTINGS_KEY];
        }

        const SAVE_SETTINGS = (c: any = null,
                               code: string = null, accessToken: string = null, expiresIn: Moment.Moment = null) => {
            let clientToReturn: any = null;

            if (!mplayer_helpers.isEmptyString(SETTINGS_KEY)) {
                if (mplayer_helpers.isEmptyString(accessToken) || mplayer_helpers.isEmptyString(code) || !expiresIn) {
                    // not enough data
                    
                    delete REPO[SETTINGS_KEY];
                    ME.config.__code = null;
                }
                else {
                    clientToReturn = c;

                    REPO[SETTINGS_KEY] = {
                        accessToken: accessToken,
                        code: code,
                        expiresIn: expiresIn.format('YYYY-MM-DD HH:mm:ss'),
                    };
                }
            }

            client = clientToReturn;

            ME.context.globalState.update(REPO_KEY, REPO).then(() => {
            }, (err) => {
                console.log(`[ERROR] SpotifyPlayer.WebApi.getClient(4): ${mplayer_helpers.toStringSafe(err)}`);
            });
        };

        try {
            let code: string;

            if (settings) {
                code = settings.code;
            }

            if (mplayer_helpers.isEmptyString(code)) {
                code = ME.config.__code;
            }

            if (!mplayer_helpers.isEmptyString(code)) {
                let accessTokenToUse: string;
                let accessTokenExpiresIn: Moment.Moment;

                if (settings) {
                    if (code === settings.code) {
                        if (!mplayer_helpers.isEmptyString(settings.accessToken)) {
                            if (!mplayer_helpers.isEmptyString(settings.expiresIn)) {
                                const EXPIRES_IN = Moment.utc( settings.expiresIn );
                                if (EXPIRES_IN.isValid()) {
                                    const NOW = Moment.utc();

                                    if (EXPIRES_IN.isAfter(NOW)) {
                                        accessTokenToUse = settings.accessToken;
                                        accessTokenExpiresIn = Moment.utc(settings.expiresIn);
                                    }
                                }
                            }
                        }
                    }
                }

                const NEW_CLIENT = new SpotifyWebApi({
                    clientId : mplayer_helpers.toStringSafe(this.config.clientID),
                    clientSecret : mplayer_helpers.toStringSafe(this.config.clientSecret),
                    redirectUri : mplayer_helpers.toStringSafe(this.config.redirectURL),
                });

                let doSaveSettings = false;

                if (mplayer_helpers.isEmptyString(accessTokenToUse)) {
                    const DATA = await NEW_CLIENT.authorizationCodeGrant( code );

                    accessTokenToUse = mplayer_helpers.toStringSafe( DATA.body['access_token'] );
                    accessTokenExpiresIn = Moment.utc()
                                                 .add( parseInt(mplayer_helpers.toStringSafe(DATA.body['expires_in']).trim()),
                                                       'seconds' );

                    doSaveSettings = true;
                }

                if (!mplayer_helpers.isNullOrUndefined( accessTokenToUse )) {
                    NEW_CLIENT.setAccessToken( accessTokenToUse );
                }

                if (doSaveSettings) {
                    SAVE_SETTINGS(NEW_CLIENT,
                                  code, accessTokenToUse, accessTokenExpiresIn);
                }
                else {
                    client = NEW_CLIENT;
                }
            }
            else {
                SAVE_SETTINGS();  // no code
            }
        }
        catch (e) {
            // error => no client
            SAVE_SETTINGS();

            console.log(`[ERROR] SpotifyPlayer.WebApi.getClient(1): ${mplayer_helpers.toStringSafe(e)}`);
        }
        
        return client;
    }

    public getSettingsKey(): string {
        const ME = this;

        try {
            const CLIENT_ID = mplayer_helpers.toStringSafe(ME.config.clientID);
            if (!mplayer_helpers.isEmptyString(CLIENT_ID)) {
                const CLIENT_SECRET  = mplayer_helpers.toStringSafe(ME.config.clientSecret);
                if (!mplayer_helpers.isEmptyString(CLIENT_SECRET)) {
                    const REDIRECT_URL = mplayer_helpers.toStringSafe(ME.config.redirectURL);
                    if (!mplayer_helpers.isEmptyString(REDIRECT_URL)) {
                        const KEY = `vsc-mpl\n` +
                                    `23091979_MK\n` + 
                                    `ID: ${ME.config.__id}\n` + 
                                    `CLIENT_ID: ${CLIENT_ID}\n` + 
                                    `CLIENT_SECRET: ${CLIENT_SECRET}\n` + 
                                    `REDIRECT_URL: ${REDIRECT_URL}\n` + 
                                    `05091979_TM`;

                        return Crypto.createHash('sha256')
                                     .update( new Buffer(KEY, 'utf8') )
                                     .digest('hex');
                    }
                }
            }
        }
        catch (e) {
            console.log(`[ERROR] SpotifyPlayer.WebApi.getSettingKey(): ${mplayer_helpers.toStringSafe(e)}`);
        }

        return null;
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
    protected readonly _CONFIG: SpotifyPlayerConfig;
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
     * Stores the playlist cache.
     */
    protected _playlistCache: mplayer_contracts.Playlist[];

    /**
     * Initializes a new instance of that class.
     * 
     * @param {mplayer_contracts.SpotifyPlayerConfig} cfg The underlying configuration.
     * @param {vscode.ExtensionContext} context The extension context.
     */
    constructor(id: number,
                cfg: SpotifyPlayerConfig, context: vscode.ExtensionContext) {
        super();

        if (!cfg) {
            cfg = <any>{};
        }

        this._ID = id;
        this._CONFIG = cfg;
        this._CONTEXT = context;
        this._API = new WebApi(cfg, context);
    }

    /**
     * Gets the Web API handler.
     */
    protected get api(): WebApi {
        return this._API;
    }

    /**
     * Authorizes for Spotify.
     * 
     * @returns {Promise<any>} The promise.
     */
    protected authorizeWithWebAPI(): Promise<any> {
        const ME = this;

        return new Promise<any>(async (resolve, reject) => {
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

                let url = 'https://accounts.spotify.com/authorize/';
                url += "?client_id=" + encodeURIComponent(CLIENT_ID);
                url += "&response_type=" + encodeURIComponent('code');
                url += "&redirect_uri=" + encodeURIComponent(REDIRECT_URL);
                url += "&scope=" + encodeURIComponent([ 'user-library-read',
                                                        'streaming',
                                                        'playlist-read-collaborative',
                                                        'playlist-read-private',
                                                        'user-read-playback-state' ].join(' '));

                let response = await mplayer_oauth.getOAuthCode('Spotify',
                                                                url,
                                                                REDIRECT_URL);

                ME.config.__code = response.code;

                vscode.window.showInformationMessage("[vs-media-player] Authorization with Spotify succeeded.").then(() => {
                }, (err) => {
                    ME.log(`players.SpotifyPlayer.authorizeWithWebAPI(1): ${mplayer_helpers.toStringSafe(err)}`);
                });

                COMPLETED(null);
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
    public get config(): SpotifyPlayerConfig {
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
                    ME._playlistCache = null;

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
     * Gets the underlying extension context.
     */
    public get context(): vscode.ExtensionContext {
        return this._CONTEXT;
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
     * Creates an output selector.
     * 
     * @param {any} client The API client.
     * @param {mplayer_contracts.Device} device The device.
     *  
     * @returns {DeviceSelector} The selector.
     */
    protected createDeviceSelector(client: any, device: mplayer_contracts.Device): DeviceSelector {
        const ME = this;

        return () => {
            return new Promise<boolean>((resolve, reject) => {
                const COMPLETED = ME.createCompletedAction(resolve, reject);

                try {
                    const CREDETIALS = client['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            const BODY = new Buffer(JSON.stringify({
                                device_ids: [ device.id ],
                            }), 'utf8');

                            let doRequest: () => void;
                            let retries = 5;

                            doRequest = () => {
                                try {
                                    const OPTS: HTTP.RequestOptions = {
                                        headers: {
                                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                        },
                                        hostname: 'api.spotify.com',
                                        path: '/v1/me/player',
                                        method: 'PUT',
                                    };

                                    const REQUEST = HTTPs.request(OPTS, async (resp) => {
                                        try {
                                            switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                                case '204':
                                                    // OK
                                                    COMPLETED(null, true);
                                                    break;

                                                case '202':
                                                    // retry?
                                                    if (retries-- > 0) {
                                                        setTimeout(() => {
                                                            doRequest();
                                                        }, 5250);
                                                    }
                                                    else {
                                                        // too many retries
                                                        COMPLETED(null, false);
                                                    }
                                                    break;

                                                default:
                                                    COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                                    break;
                                            }
                                        }
                                        catch (e) {
                                            COMPLETED(e);
                                        }
                                    });

                                    mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, COMPLETED);

                                    REQUEST.write( BODY );
                                    REQUEST.end();
                                }
                                catch (e) {
                                    COMPLETED(e);
                                }
                            };

                            doRequest();
                        }
                        else {
                            COMPLETED(null, false);
                        }
                    }
                    else {
                        COMPLETED(null, false);
                    }
                }
                catch (e) {
                    COMPLETED(e);
                }
            });
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

        let trackListCache: mplayer_contracts.Track[];

        return () => {
            return new Promise<mplayer_contracts.Track[]>(async (resolve, reject) => {
                const COMPLETED = ME.createCompletedAction(resolve, reject);

                if (trackListCache) {
                    COMPLETED(null, trackListCache);
                }
                else {
                    const TRACKS: mplayer_contracts.Track[] = [];

                    try {
                        const PLAYLIST_TRACKS = await client.getPlaylistTracks(user, playlist.id.split(':')[4], { 'offset' : 0, 'fields' : 'items' });
                        if (PLAYLIST_TRACKS) {
                            const ITEMS = mplayer_helpers.asArray(PLAYLIST_TRACKS.body['items']).filter(i => i);
                            ITEMS.forEach(i => {
                                const TRACK_DATA = i['track'];
                                if (TRACK_DATA) {
                                    let artist = '';
                                    let name = mplayer_helpers.toStringSafe(TRACK_DATA['name']).trim();

                                    const ARTISTS = mplayer_helpers.asArray(TRACK_DATA['artists']).filter(a => a);
                                    ARTISTS.forEach(a => {
                                        let artistName = mplayer_helpers.toStringSafe(a['name']).trim();
                                        if ('' !== artistName) {
                                            artist = artistName;
                                        }
                                    });

                                    const NEW_TRACK: mplayer_contracts.Track = {
                                        id: mplayer_helpers.toStringSafe(TRACK_DATA['uri']),
                                        name: `${artist}${!mplayer_helpers.isEmptyString(artist) ? ' - ' : ''}${name}`.trim(),
                                        play: ME.createTrackPlayer(TRACK_DATA['uri']),
                                        playlist: playlist,
                                    };

                                    TRACKS.push(NEW_TRACK);
                                }
                            });
                        }
                    }
                    catch (e) { }

                    COMPLETED(null,
                              trackListCache = TRACKS);
                }
            });
        };
    }

    /**
     * Creates a track player function.
     * 
     * @param {string} uri The URI.
     * 
     * @returns {TrackPlayer} The created function.
     */
    protected createTrackPlayer(uri: string): TrackPlayer {
        const ME = this;

        return () => {
            return new Promise<boolean>(async (res, rej) => {
                try {
                    await ME.client.play( mplayer_helpers.toStringSafe(uri) );

                    res(true);
                }
                catch (e) {
                    rej(e);
                }
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
        this._playlistCache = null;

        this.removeAllListeners();
    }

    /** @inheritdoc */
    public executeAction(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const QUICK_PICKS: mplayer_contracts.ActionQuickPickItem[] = [];

                QUICK_PICKS.push({
                    label: 'Delete cache of PLAYLISTS',
                    description: '',
                    action: () => {
                        ME._playlistCache = null;
                    }
                });

                let placeholder = 'Execute action for Spotify player';
                {
                    let name = mplayer_helpers.toStringSafe( ME.config.name ).trim();
                    if ('' === name) {
                        name = `Player ${ME.config.__id}`;
                    }

                    placeholder += ` '${name}'`;
                }
                placeholder += '...';

                vscode.window.showQuickPick(QUICK_PICKS.sort((x, y) => {
                    return mplayer_helpers.compareValuesBy(x, y,
                                                           qp => mplayer_helpers.normalizeString(qp.label));
                }), {
                    placeHolder: placeholder,
                }).then(async (item) => {
                    try {
                        if (item) {
                            await Promise.resolve( item.action(item.state, item) );
                        }
                        else {
                            COMPLETED(null, false);
                        }
                    }
                    catch (e) {
                        COMPLETED(e);
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
    public getDevices(): Promise<mplayer_contracts.Device[]> {
        const ME = this;

        return new Promise<mplayer_contracts.Device[]>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const FALLBACK = () => {
                const DEFAULT_DATA = mplayer_players_helpers.getDefaultOutputData(ME.config);

                COMPLETED(null, [{
                    id: DEFAULT_DATA.id,
                    isActive: true,
                    name: DEFAULT_DATA.id,
                    player: ME,
                    select: () => Promise.resolve(true),
                }]);
            };

            try {
                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            let doRequest: () => void;
                            let retries = 5;

                            doRequest = () => {
                                try {
                                    const OPTS: HTTP.RequestOptions = {
                                        headers: {
                                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                        },
                                        hostname: 'api.spotify.com',
                                        path: '/v1/me/player/devices',
                                        method: 'GET',
                                    };

                                    const REQUEST = HTTPs.request(OPTS, async (resp) => {
                                        try {
                                            switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                                case '200':
                                                    // OK
                                                    {
                                                        const RESULT: mplayer_contracts.Device[] = [];

                                                        const BODY = await mplayer_helpers.getHttpBody(resp);
                                                        if (BODY) {
                                                            const DEVICES: WebAPIDeviceResult = JSON.parse(BODY.toString('utf8'));
                                                            if (DEVICES && DEVICES.devices) {
                                                                DEVICES.devices.filter(d => d).forEach(d => {
                                                                    const NEW_DEVICE: mplayer_contracts.Device = {
                                                                        id: mplayer_helpers.toStringSafe(d.id),
                                                                        isActive: mplayer_helpers.toBooleanSafe(d.is_active),
                                                                        name: mplayer_helpers.toStringSafe(d.name),
                                                                        player: ME,
                                                                        select: undefined,
                                                                    };

                                                                    let selector: DeviceSelector;
                                                                    if (!mplayer_helpers.toBooleanSafe(d.is_restricted)) {
                                                                        selector = ME.createDeviceSelector(CLIENT, NEW_DEVICE);
                                                                    }
                                                                    else {
                                                                        // restricted
                                                                        selector = () => Promise.resolve(false);
                                                                    }

                                                                    (<any>NEW_DEVICE)['select'] = selector;

                                                                    RESULT.push(NEW_DEVICE);
                                                                });
                                                            }
                                                        }

                                                        COMPLETED(null, RESULT);
                                                    }
                                                    break;

                                                case '202':
                                                    // retry?
                                                    if (retries-- > 0) {
                                                        setTimeout(() => {
                                                            doRequest();
                                                        }, 5250);
                                                    }
                                                    else {
                                                        // too many retries

                                                        FALLBACK();
                                                    }
                                                    break;

                                                default:
                                                    COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                                    break;
                                            }
                                        }
                                        catch (e) {
                                            FALLBACK();
                                        }
                                    });

                                    mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, () => {
                                        FALLBACK();
                                    });

                                    REQUEST.end();
                                }
                                catch (e) {
                                    FALLBACK();
                                }
                            }

                            doRequest();
                            return;
                        }
                    }
                }

                FALLBACK();
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * Get player status via Web API.
     * 
     * @returns {Promise<mplayer_contracts.RepeatType>} The promise with the status.
     */
    protected getPlayerStatusFromAPI(): Promise<WebAPIPlayerStatus> {
        const ME = this;

        return new Promise<WebAPIPlayerStatus>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const NOT_AVAILBLE = () => {
                COMPLETED(null, null);
            };

            try {
                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            const OPTS: HTTP.RequestOptions = {
                                headers: {
                                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                },
                                hostname: 'api.spotify.com',
                                path: '/v1/me/player',
                                method: 'GET',
                            };

                            const REQUEST = HTTPs.request(OPTS, async (resp) => {
                                try {
                                    switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                        case '200':
                                            {
                                                let status: WebAPIPlayerStatus;

                                                const BODY = await mplayer_helpers.getHttpBody(resp);
                                                if (BODY) {
                                                    status = JSON.parse(BODY.toString('utf8'));
                                                }

                                                COMPLETED(null, status);
                                            }
                                            break;

                                        default:
                                            COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                            break;
                                    }
                                }
                                catch (e) {
                                    COMPLETED(e);
                                }
                            });

                            mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, COMPLETED);

                            REQUEST.end();
                        }
                        else {
                            NOT_AVAILBLE();
                        }
                    }
                    else {
                        NOT_AVAILBLE();
                    }
                }
                else {
                    NOT_AVAILBLE();
                }
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

            const CACHED_PLAYLISTS = ME._playlistCache;
            if (!mplayer_helpers.isNullOrUndefined(CACHED_PLAYLISTS)) {
                COMPLETED(null,
                          CACHED_PLAYLISTS.filter(p => p));
                return;
            }

            try {
                try {
                    const CLIENT = await ME.api.getClient();
                    if (CLIENT) {
                        const USER = await CLIENT.getMe();
                        if (USER) {
                            const USER_ID: string = mplayer_helpers.toStringSafe(USER.body['id']);
                            if (!mplayer_helpers.isEmptyString(USER_ID)) {
                                let playlists: mplayer_contracts.Playlist[] = [];

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

                                        playlists.push(NEW_PLAYLIST);
                                    });
                                }

                                // sort and cache
                                ME._playlistCache = playlists = playlists.sort((x, y) => {
                                    return mplayer_helpers.compareValuesBy(x, y,
                                                                           pl => mplayer_helpers.normalizeString(pl.name));
                                });

                                COMPLETED(null, playlists);
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

    /**
     * Get repeating type via Web API.
     * 
     * @returns {Promise<mplayer_contracts.RepeatType>} The promise with the type.
     */
    public getRepeatTypeFromAPI(): Promise<mplayer_contracts.RepeatType> {
        const ME = this;

        return new Promise<mplayer_contracts.RepeatType>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                let type: mplayer_contracts.RepeatType;

                const STATUS = await ME.getPlayerStatusFromAPI();
                if (STATUS) {
                    switch (mplayer_helpers.normalizeString(STATUS.repeat_state)) {
                        case 'context':
                            type = mplayer_contracts.RepeatType.LoopAll;
                            break;

                        case 'off':
                            type = null;
                            break;

                        case 'track':
                            type = mplayer_contracts.RepeatType.RepeatCurrent;
                            break;
                    }
                }

                COMPLETED(null, type);
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

            try {
                this.client.getStatus().then(async (spotifyStatus) => {
                    try {
                        const BUTTON: mplayer_contracts.PlayerStatusInfoButton = {
                        };

                        let repeat: mplayer_contracts.RepeatType;

                        const STATUS: mplayer_contracts.PlayerStatus = {
                            button: BUTTON,
                            isConnected: undefined,
                            isShuffle: mplayer_helpers.toBooleanSafe(spotifyStatus.shuffle),
                            player: ME,
                        };

                        const FALLBACK_REPEAT_STATE = () => {
                            if (mplayer_helpers.toBooleanSafe(spotifyStatus.repeat)) {
                                repeat = mplayer_contracts.RepeatType.Unknown;
                            }
                        };

                        try {
                            const TYPE = await ME.getRepeatTypeFromAPI();
                            if (!mplayer_helpers.isNullOrUndefined(TYPE)) {
                                repeat = TYPE;
                            }
                            else {
                                FALLBACK_REPEAT_STATE();
                            }
                        }
                        catch (e) {
                            FALLBACK_REPEAT_STATE();
                        }

                        let track: mplayer_contracts.Track;
                        if (spotifyStatus.track) {
                            if (!track) {
                                // use fallback

                                let name = '';
                                if (spotifyStatus.track.track_resource) {
                                    name = mplayer_helpers.toStringSafe( spotifyStatus.track.track_resource.name ).trim();
                                }
                                if (spotifyStatus.track.artist_resource) {
                                    let artist = mplayer_helpers.toStringSafe( spotifyStatus.track.artist_resource.name ).trim();
                                    if ('' !== artist) {
                                        name = `${artist}${'' !== name ? ' - ' : ''}${name}`.trim();
                                    }
                                }
                            
                                track = {
                                    id: spotifyStatus.track.track_resource.uri,
                                    name: name,
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

                        // STATUS.repeat
                        Object.defineProperty(STATUS, 'repeat', {
                            enumerable: true,
                            get: function() {
                                return repeat;
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
                            const CLIENT = await ME.api.getClient();
                            if (CLIENT) {
                                const USER = await CLIENT.getMe();
                                if (USER) {
                                    isAuthorized = true;
                                }
                            }
                        }
                        catch (e) { }

                        (<any>BUTTON)['command'] = ME._authorizeWebAPICommandName;
                        if (isAuthorized) {
                            (<any>BUTTON)['text'] = '$(log-out)';
                            (<any>BUTTON)['tooltip'] = 'Log out...';
                            (<any>BUTTON)['color'] = '#00ff00';
                        }
                        else {
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

            const CMD_NAME = 'extension.mediaPlayer.spotify.toggleAuthorize' + CMD_ID_SUFFIX;
            ME._authorizeWebAPICommand = vscode.commands.registerCommand(CMD_NAME, async () => {
                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    await ME.unauthorizeFromWebAPI();
                }
                else {
                    await ME.authorizeWithWebAPI();
                }
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

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const FALLBACK = () => {
                try {
                    COMPLETED(null, false);
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            try {
                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            let doRequest: () => void;
                            let retries = 5;

                            doRequest = () => {
                                try {
                                    const OPTS: HTTP.RequestOptions = {
                                        headers: {
                                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                        },
                                        hostname: 'api.spotify.com',
                                        path: '/v1/me/player/next',
                                        method: 'POST',
                                    };

                                    const REQUEST = HTTPs.request(OPTS, (resp) => {
                                        try {
                                            switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                                case '204':
                                                    COMPLETED(null, true);  // OK
                                                    break;

                                                case '202':
                                                    // retry?
                                                    if (retries-- > 0) {
                                                        setTimeout(() => {
                                                            doRequest();
                                                        }, 5250);
                                                    }
                                                    else {
                                                        // too many retries

                                                        FALLBACK();
                                                    }
                                                    break;

                                                default:
                                                    COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                                    break;
                                            }
                                        }
                                        catch (e) {
                                            FALLBACK();
                                        }
                                    });

                                    mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, () => {
                                        FALLBACK();
                                    });

                                    REQUEST.end();
                                }
                                catch (e) {
                                    FALLBACK();
                                }
                            }

                            doRequest();
                            return;
                        }
                    }  
                }
            }
            catch (e) {}
            
            FALLBACK();
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

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const FALLBACK = () => {
                try {
                    COMPLETED(null, false);
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            try {
                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            let doRequest: () => void;
                            let retries = 5;

                            doRequest = () => {
                                try {
                                    const OPTS: HTTP.RequestOptions = {
                                        headers: {
                                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                        },
                                        hostname: 'api.spotify.com',
                                        path: '/v1/me/player/previous',
                                        method: 'POST',
                                    };

                                    const REQUEST = HTTPs.request(OPTS, (resp) => {
                                        try {
                                            switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                                case '204':
                                                    COMPLETED(null, true);  // OK
                                                    break;

                                                case '202':
                                                    // retry?
                                                    if (retries-- > 0) {
                                                        setTimeout(() => {
                                                            doRequest();
                                                        }, 5250);
                                                    }
                                                    else {
                                                        // too many retries

                                                        FALLBACK();
                                                    }
                                                    break;

                                                default:
                                                    COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                                    break;
                                            }
                                        }
                                        catch (e) {
                                            FALLBACK();
                                        }
                                    });

                                    mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, () => {
                                        FALLBACK();
                                    });

                                    REQUEST.end();
                                }
                                catch (e) {
                                    FALLBACK();
                                }
                            }

                            doRequest();
                            return;
                        }
                    }  
                }
            }
            catch (e) {}
            
            FALLBACK();
        });
    }

    /** @inheritdoc */
    public searchPlaylists(expr?: string): Promise<mplayer_contracts.PlaylistSearchResult> {
        const ME = this;

        const SEARCH_PARTS = mplayer_players_helpers.toSearchExpressionParts(expr);

        return new Promise<mplayer_contracts.PlaylistSearchResult>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const FALLBACK = () => {
                try {
                    COMPLETED(null, {
                        playlists: [],
                    });
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            try {
                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            const OPTS: HTTP.RequestOptions = {
                                headers: {
                                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                },
                                hostname: 'api.spotify.com',
                                path: '/v1/search?q=' + encodeURIComponent( SEARCH_PARTS.join(' ') ) + 
                                                '&type=' + encodeURIComponent('playlist') + 
                                                '&limit=' + encodeURIComponent('25') + 
                                                '&offset=' + encodeURIComponent('0'),
                                method: 'GET',
                            };

                            const REQUEST = HTTPs.request(OPTS, async (resp) => {
                                try {
                                    switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                        case '200':
                                            {
                                                const SEARCH_RESULT: mplayer_contracts.PlaylistSearchResult = {
                                                    playlists: [],
                                                };

                                                const BODY = await mplayer_helpers.getHttpBody(resp);
                                                if (BODY) {
                                                    const RESULT: WebAPIPlaylistSearchResult = JSON.parse( BODY.toString('utf8') );
                                                    if (RESULT) {
                                                        if (RESULT.playlists && RESULT.playlists.items) {
                                                            RESULT.playlists.items.filter(pl => pl).forEach(pl => {
                                                                let trackProvider: TrackListProvider = () => Promise.resolve([]);

                                                                const NEW_PLAYLIST: mplayer_contracts.Playlist = {
                                                                    id: mplayer_helpers.toStringSafe(pl.uri),
                                                                    name: mplayer_helpers.toStringSafe(pl.name),
                                                                    getTracks: undefined,
                                                                    player: ME,
                                                                };

                                                                if (pl.owner) {
                                                                    let user = mplayer_helpers.toStringSafe(pl.owner.id);

                                                                    trackProvider = ME.createTrackListProvider(CLIENT,
                                                                                                               user,
                                                                                                               NEW_PLAYLIST);
                                                                }

                                                                (<any>NEW_PLAYLIST)['getTracks'] = trackProvider;

                                                                SEARCH_RESULT.playlists.push(NEW_PLAYLIST);
                                                            });
                                                        }
                                                    }
                                                }

                                                COMPLETED(null, SEARCH_RESULT);
                                            }
                                            break;

                                        default:
                                            COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                            break;
                                    }
                                }
                                catch (e) {
                                    FALLBACK();
                                }
                            });

                            mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, () => {
                                FALLBACK();
                            });

                            REQUEST.end();
                            return;
                        }
                    }  
                }
            }
            catch (e) {}

            FALLBACK();
        });
    }

    /** @inheritdoc */
    public searchTracks(expr?: string): Promise<mplayer_contracts.TrackSearchResult> {
        const ME = this;

        const SEARCH_PARTS = mplayer_players_helpers.toSearchExpressionParts(expr);

        return new Promise<mplayer_contracts.TrackSearchResult>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const FALLBACK = () => {
                try {
                    COMPLETED(null, {
                        tracks: [],
                    });
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            try {
                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            const OPTS: HTTP.RequestOptions = {
                                headers: {
                                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                },
                                hostname: 'api.spotify.com',
                                path: '/v1/search?q=' + encodeURIComponent( SEARCH_PARTS.join(' ') ) + 
                                                '&type=' + encodeURIComponent('track') + 
                                                '&limit=' + encodeURIComponent('25') + 
                                                '&offset=' + encodeURIComponent('0'),
                                method: 'GET',
                            };

                            const REQUEST = HTTPs.request(OPTS, async (resp) => {
                                try {
                                    switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                        case '200':
                                            {
                                                const SEARCH_RESULT: mplayer_contracts.TrackSearchResult = {
                                                    tracks: [],
                                                };

                                                const PLAYLIST: mplayer_contracts.Playlist = {
                                                    id: -1,
                                                    getTracks: () => Promise.resolve( SEARCH_RESULT.tracks ),
                                                    name: '',
                                                    player: ME,
                                                };

                                                const BODY = await mplayer_helpers.getHttpBody(resp);
                                                if (BODY) {
                                                    const RESULT: WebAPITrackSearchResult = JSON.parse( BODY.toString('utf8') );
                                                    if (RESULT) {
                                                        if (RESULT.tracks && RESULT.tracks.items) {
                                                            RESULT.tracks.items.filter(t => t).forEach(t => {
                                                                let artist = '';
                                                                let name = mplayer_helpers.toStringSafe(t.name).trim();

                                                                const ARTISTS = mplayer_helpers.asArray(t.artists).filter(a => a);
                                                                ARTISTS.forEach(a => {
                                                                    let artistName = mplayer_helpers.toStringSafe(a['name']).trim();
                                                                    if ('' !== artistName) {
                                                                        artist = artistName;
                                                                    }
                                                                });

                                                                const NEW_TRACK: mplayer_contracts.Track = {
                                                                    id: mplayer_helpers.toStringSafe(t.uri),
                                                                    name: `${artist}${!mplayer_helpers.isEmptyString(artist) ? ' - ' : ''}${name}`.trim(),
                                                                    play: ME.createTrackPlayer(t.uri),
                                                                    playlist: PLAYLIST,
                                                                };

                                                                SEARCH_RESULT.tracks
                                                                             .push(NEW_TRACK);
                                                            });
                                                        }
                                                    }
                                                }

                                                COMPLETED(null, SEARCH_RESULT);
                                            }
                                            break;

                                        default:
                                            COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                            break;
                                    }
                                }
                                catch (e) {
                                    FALLBACK();
                                }
                            });

                            mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, () => {
                                FALLBACK();
                            });

                            REQUEST.end();
                            return;
                        }
                    }  
                }
            }
            catch (e) {}

            FALLBACK();
        });
    }

    /** @inheritdoc */
    public setVolume(newValue: number): Promise<boolean> {
        const ME = this;

        newValue = parseFloat( mplayer_helpers.toStringSafe(newValue).trim() );
        if (isNaN(newValue)) {
            newValue = 1.0;
        }

        newValue = Math.max(0.0, newValue);
        newValue = Math.min(1.0, newValue);

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const FALLBACK = () => {
                try {
                    COMPLETED(null, false);
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            try {
                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            let doRequest: () => void;
                            let retries = 5;

                            doRequest = () => {
                                try {
                                    const OPTS: HTTP.RequestOptions = {
                                        headers: {
                                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                        },
                                        hostname: 'api.spotify.com',
                                        path: '/v1/me/player/volume?volume_percent=' + encodeURIComponent( '' + Math.floor( newValue * 100.0 ) ),
                                        method: 'PUT',
                                    };

                                    const REQUEST = HTTPs.request(OPTS, (resp) => {
                                        try {
                                            switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                                case '204':
                                                    COMPLETED(null, true);  // OK
                                                    break;

                                                case '202':
                                                    // retry?
                                                    if (retries-- > 0) {
                                                        setTimeout(() => {
                                                            doRequest();
                                                        }, 5250);
                                                    }
                                                    else {
                                                        // too many retries

                                                        FALLBACK();
                                                    }
                                                    break;

                                                default:
                                                    COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                                    break;
                                            }
                                        }
                                        catch (e) {
                                            FALLBACK();
                                        }
                                    });

                                    mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, () => {
                                        FALLBACK();
                                    });

                                    REQUEST.end();
                                }
                                catch (e) {
                                    FALLBACK();
                                }
                            }

                            doRequest();
                            return;
                        }
                    }  
                }
            }
            catch (e) {}

            FALLBACK();
        });
    }

    /** @inheritdoc */
    public toggleRepeat(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const FALLBACK = () => {
                try {
                    COMPLETED(null, false);
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            try {
                let newState: string;

                try {
                    const STATUS = await ME.getPlayerStatusFromAPI();
                    if (STATUS) {
                        const REPEAT_STATE = mplayer_helpers.normalizeString(STATUS.repeat_state);
                        switch (REPEAT_STATE) {
                            case 'context':
                                newState = 'track';
                                break;

                            case 'track':
                                newState = 'off';
                                break;

                            default:
                                newState = 'context';
                                break;
                        }
                    }
                }
                catch (e) { }

                if (mplayer_helpers.isEmptyString(newState)) {
                    FALLBACK();
                    return;
                }

                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            let doRequest: () => void;
                            let retries = 5;

                            doRequest = () => {
                                try {
                                    const OPTS: HTTP.RequestOptions = {
                                        headers: {
                                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                        },
                                        hostname: 'api.spotify.com',
                                        path: '/v1/me/player/repeat?state=' + encodeURIComponent(newState),
                                        method: 'PUT',
                                    };

                                    const REQUEST = HTTPs.request(OPTS, (resp) => {
                                        try {
                                            switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                                case '204':
                                                    COMPLETED(null, true);  // OK
                                                    break;

                                                case '202':
                                                    // retry?
                                                    if (retries-- > 0) {
                                                        setTimeout(() => {
                                                            doRequest();
                                                        }, 5250);
                                                    }
                                                    else {
                                                        // too many retries

                                                        FALLBACK();
                                                    }
                                                    break;

                                                default:
                                                    COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                                    break;
                                            }
                                        }
                                        catch (e) {
                                            FALLBACK();
                                        }
                                    });

                                    mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, () => {
                                        FALLBACK();
                                    });

                                    REQUEST.end();
                                }
                                catch (e) {
                                    FALLBACK();
                                }
                            }

                            doRequest();
                            return;
                        }
                    }  
                }
            }
            catch (e) {}
            
            FALLBACK();
        });
    }
    
    /** @inheritdoc */
    public toggleShuffle(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);
            const FALLBACK = () => {
                try {
                    COMPLETED(null, false);
                }
                catch (e) {
                    COMPLETED(e);
                }
            };

            try {
                let newState = true;

                const STATUS = await ME.getStatus();
                if (STATUS) {
                    newState = !mplayer_helpers.toBooleanSafe( STATUS.isShuffle, true );
                }

                const CLIENT = await ME.api.getClient();
                if (CLIENT) {
                    const CREDETIALS = CLIENT['_credentials'];
                    if (CREDETIALS) {
                        const ACCESS_TOKEN = mplayer_helpers.toStringSafe( CREDETIALS['accessToken'] );
                        if (!mplayer_helpers.isEmptyString(ACCESS_TOKEN)) {
                            let doRequest: () => void;
                            let retries = 5;

                            doRequest = () => {
                                try {
                                    const OPTS: HTTP.RequestOptions = {
                                        headers: {
                                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                                        },
                                        hostname: 'api.spotify.com',
                                        path: '/v1/me/player/shuffle?state=' + encodeURIComponent(newState ? 'true' : 'false'),
                                        method: 'PUT',
                                    };

                                    const REQUEST = HTTPs.request(OPTS, (resp) => {
                                        try {
                                            switch (mplayer_helpers.normalizeString(resp.statusCode)) {
                                                case '204':
                                                    COMPLETED(null, true);  // OK
                                                    break;

                                                case '202':
                                                    // retry?
                                                    if (retries-- > 0) {
                                                        setTimeout(() => {
                                                            doRequest();
                                                        }, 5250);
                                                    }
                                                    else {
                                                        // too many retries

                                                        FALLBACK();
                                                    }
                                                    break;

                                                default:
                                                    COMPLETED(`Unexpected status code: ${resp.statusCode}`);
                                                    break;
                                            }
                                        }
                                        catch (e) {
                                            FALLBACK();
                                        }
                                    });

                                    mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, () => {
                                        FALLBACK();
                                    });

                                    REQUEST.end();
                                }
                                catch (e) {
                                    FALLBACK();
                                }
                            }

                            doRequest();
                            return;
                        }
                    }  
                }
            }
            catch (e) {}
            
            FALLBACK();
        });
    }

    /**
     * Unauthorizes from Spotify.
     * 
     * @returns {Promise<any>} The promise.
     */
    protected unauthorizeFromWebAPI(): Promise<any> {
        const ME = this;

        return new Promise<any>(async (resolve, reject) => {
            const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

            try {
                const SETTINGS_KEY = ME.api.getSettingsKey();
                if (!mplayer_helpers.isEmptyString(SETTINGS_KEY)) {
                    const REPO = ME.context.globalState.get<WebAPISettingsRepository>(REPO_KEY) ||
                                 {};

                    delete REPO[SETTINGS_KEY];
                    await Promise.resolve( ME.context.globalState.update(REPO_KEY, REPO) );

                    ME.config.__code = null;
                }

                COMPLETED(null);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public volumeDown(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                let result = false;

                const STATUS = await ME.getStatus();
                if (STATUS) {
                    let newVolum = STATUS.volume;
                    if (!isNaN(newVolum)) {
                        newVolum = Math.max(0.0, newVolum - 0.05);

                        result = await ME.setVolume(newVolum);
                    }
                }

                COMPLETED(null, result);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public volumeUp(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                let result = false;

                const STATUS = await ME.getStatus();
                if (STATUS) {
                    let newVolum = STATUS.volume;
                    if (!isNaN(newVolum)) {
                        newVolum = Math.min(1.0, newVolum + 0.05);

                        result = await ME.setVolume(newVolum);
                    }
                }

                COMPLETED(null, result);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }
}
