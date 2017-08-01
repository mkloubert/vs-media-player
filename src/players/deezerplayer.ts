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
import * as Events from 'events';
import * as Moment from 'moment';
import * as mplayer_cache from '../cache';
import * as mplayer_contracts from '../contracts';
import * as mplayer_helpers from '../helpers';
import * as mplayer_oauth from '../oauth';
import * as mplayer_rest from '../rest';
import * as vscode from 'vscode';


interface AccessToken {
    code: string;
    token: string;
};

/**
 * A Deezer player config entry.
 */
export interface DeezerPlayerConfig extends mplayer_contracts.PlayerConfig {
    /**
     * [INTERNAL USE]
     * 
     * Last OAuth code.
     */
    __code?: string;

    /**
     * The ID of an own registered Deezer app.
     */
    readonly appID: string;
    /**
     * The redirect URL for the authorization.
     */
    readonly redirectURL: string;
    /**
     * The secret key of an own registered Deezer app.
     */
    readonly secretKey: string;
    /** @inheritdoc */
    readonly type: "deezer";
}

/**
 * A Deezer player.
 */
export class DeezerPlayer extends Events.EventEmitter implements mplayer_contracts.MediaPlayer {
    /**
     * Stores the cache of access tokens.
     */
    protected readonly _ACCESS_TOKENS: mplayer_cache.MementoCache;
    /**
     * Stores the underlying configuration.
     */
    protected readonly _CONFIG: DeezerPlayerConfig;
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
     * @param {DeezerPlayerConfig} cfg The underlying configuration.
     * @param {vscode.ExtensionContext} context The extension context.
     */
    constructor(id: number,
                cfg: DeezerPlayerConfig, context: vscode.ExtensionContext) {
        super();

        if (!cfg) {
            cfg = <any>{};
        }

        this._ID = id;
        this._CONFIG = cfg;
        this._CONTEXT = context;
        this._ACCESS_TOKENS = new mplayer_cache.MementoCache(context.globalState,
                                                             'vscMediaPlayerDeezerAPI');
    }

    /**
     * Gets the cache of all access tokens.
     */
    public get accessTokens(): mplayer_cache.MementoCache {
        return this._ACCESS_TOKENS;
    }

    /**
     * Authorizes with API.
     * 
     * @return {Promise<string>} The promise with the OAuth code.
     */
    protected async authorizeWithAPI(): Promise<string> {
        let code: string;

        const API_ID = mplayer_helpers.toStringSafe(this.config.appID);
        const SECRET_KEY = mplayer_helpers.toStringSafe(this.config.secretKey);
        const REDIRECT_URL = mplayer_helpers.toStringSafe(this.config.redirectURL);
        const PERMS = [ 'basic_access', 'email' ];

        let url = 'https://connect.deezer.com/oauth/auth.php';
        url += "?app_id=" + encodeURIComponent(API_ID);
        url += "&redirect_uri=" + encodeURIComponent(REDIRECT_URL);
        url += "&perms=" + encodeURIComponent( PERMS.join(',') );

        const CODE_RESULT = await mplayer_oauth.getOAuthCode('Deezer',
                                                             url, REDIRECT_URL);
        if (CODE_RESULT) {
            code = CODE_RESULT.code;
        }

        return code;
    }

    /**
     * Gets the config.
     */
    public get config(): DeezerPlayerConfig {
        return this._CONFIG;
    }

    /** @inheritdoc */
    public async connect(): Promise<boolean> {
        let result = false;

        if (!this.isConnected) {
            let code: string;

            const CACHE_KEY = this.getAccessTokenKey();
            if (!mplayer_helpers.isEmptyString(CACHE_KEY)) {
                const ACCESS_TOKEN = this.accessTokens.get<AccessToken>(CACHE_KEY);
                if (ACCESS_TOKEN) {
                    code = ACCESS_TOKEN.code;
                }
            }

            if (mplayer_helpers.isEmptyString(code)) {
                code = await this.authorizeWithAPI();
            }

            this.config.__code = code;

            if (!mplayer_helpers.isEmptyString(this.config.__code)) {
                const ACCESS_TOKEN = await this.getNewAccessToken();
                if (ACCESS_TOKEN) {
                    result = true;
                }
            }
        }

        if (result) {
            result = !!(await this.getClient());
        }

        return result;
    }

    /**
     * Gets the extension context.
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

    /** @inheritdoc */
    public dispose() {
        this.removeAllListeners();
    }

    /** @inheritdoc */
    public get extension(): vscode.ExtensionContext {
        return this._CONTEXT;
    }

    /**
     * Gets the key for access token cache.
     * 
     * @returns {string} The key.
     */
    public getAccessTokenKey(): string {
        const ME = this;

        try {
            //TODO: implement

            const API_ID = mplayer_helpers.toStringSafe(ME.config.appID);
            if (!mplayer_helpers.isEmptyString(API_ID)) {
                const SECRET_KEY  = mplayer_helpers.toStringSafe(ME.config.secretKey);
                if (!mplayer_helpers.isEmptyString(SECRET_KEY)) {
                    const KEY = `vsc-mpl\n` +
                                `23091979_MK\n` + 
                                `ID: ${ME.config.__id}\n` + 
                                `API_ID: ${API_ID}\n` + 
                                `SECRET_KEY: ${SECRET_KEY}\n` + 
                                `05091979_TM`;

                    return Crypto.createHash('sha256')
                                 .update( new Buffer(KEY, 'utf8') )
                                 .digest('hex');
                }
            }
        }
        catch (e) {
            console.log(`[ERROR] DeezerPlayer.getAccessTokenKey(): ${mplayer_helpers.toStringSafe(e)}`);
        }

        return null;
    }

    /**
     * Returns a new client.
     * 
     * @return {Promise<mplayer_rest.RestClient>} The promise with the client (if available).
     */
    public async getClient(): Promise<mplayer_rest.RestClient> {
        let client: mplayer_rest.RestClient;

        const CACHE_KEY = this.getAccessTokenKey();
        if (!mplayer_helpers.isEmptyString(CACHE_KEY)) {
            try {
                let accessToken = await this.accessTokens.get<AccessToken>(CACHE_KEY);

                if (!accessToken) {
                    accessToken = await this.getNewAccessToken();
                }

                if (accessToken) {
                    client = new mplayer_rest.RestClient();
                    client.setParam('access_token', accessToken.token);
                }
            }
            catch (e) {
                mplayer_helpers.log(`[ERROR] DeezerPlayer.getClient(): ${mplayer_helpers.toStringSafe(e)}`);
            }
        }

        return client;
    }

    /** @inheritdoc */
    public getDevices(): Promise<mplayer_contracts.Device[]> {
        const ME = this;

        return new Promise<mplayer_contracts.Device[]>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * Gets a new access token.
     * 
     * @returns {Promise<AccessTokenResponse>} The promise with the new token.
     */
    protected async getNewAccessToken(): Promise<AccessToken> {
        let accessToken: AccessToken;

        const CACHE_KEY = this.getAccessTokenKey();
        if (!mplayer_helpers.isEmptyString(CACHE_KEY)) {
            let code = this.config.__code;

            if (!mplayer_helpers.isEmptyString(code)) {
                const API_ID = mplayer_helpers.toStringSafe(this.config.appID);
                const SECRET_KEY = mplayer_helpers.toStringSafe(this.config.secretKey);

                const CLIENT = new mplayer_rest.RestClient('https://connect.deezer.com/oauth/access_token.php');
                CLIENT.setParam('app_id', API_ID)
                      .setParam('secret', SECRET_KEY)
                      .setParam('code', code);

                const RESPONSE = await CLIENT.GET();
                if ('200' !== mplayer_helpers.normalizeString(RESPONSE.response.statusCode)) {
                    throw new Error(`Unexpected response code: ${RESPONSE.response.statusCode}`);
                }

                const NEW_ACCESS_TOKEN_RESULT = await RESPONSE.getString();
                if (!mplayer_helpers.isEmptyString(NEW_ACCESS_TOKEN_RESULT)) {
                    const NEW_ACCESS_TOKEN_OBJECT = mplayer_helpers.queryParamsToObject(NEW_ACCESS_TOKEN_RESULT);
                    if (NEW_ACCESS_TOKEN_OBJECT) {
                        accessToken = {
                            code: code,
                            token: NEW_ACCESS_TOKEN_OBJECT['access_token'],
                        };

                        await this.accessTokens.set(CACHE_KEY, accessToken,
                                                    parseInt( NEW_ACCESS_TOKEN_OBJECT['expires' ]));
                    }
                }
            }
        }

        return accessToken;
    }

    /** @inheritdoc */
    public getPlaylists() {
        const ME = this;

        return new Promise<mplayer_contracts.Playlist[]>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
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
                //TODO: implement
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
            this._isInitialized = true;
        }
    }

    /** @inheritdoc */
    public get isConnected(): boolean {
        const CACHE_KEY = this.getAccessTokenKey();
        if (!mplayer_helpers.isEmptyString(CACHE_KEY)) {
            const NOT_FOUND = Symbol('NOT_FOUND');

            return NOT_FOUND !== this.accessTokens.get(CACHE_KEY, NOT_FOUND);
        }

        return false;
    }

    /** @inheritdoc */
    public get isInitialized(): boolean {
        return this._isInitialized;
    }

    /** @inheritdoc */
    public next(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public pause(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
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

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public prev(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public searchPlaylists(expr?: string): Promise<mplayer_contracts.PlaylistSearchResult> {
        const ME = this;

        return new Promise<mplayer_contracts.PlaylistSearchResult>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public searchTracks(expr?: string): Promise<mplayer_contracts.TrackSearchResult> {
        const ME = this;

        return new Promise<mplayer_contracts.TrackSearchResult>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public setVolume(newValue: number): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public toggleRepeat(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public toggleShuffle(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                //TODO: implement
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

            try {
                //TODO: implement
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

            try {
                //TODO: implement
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }
}
