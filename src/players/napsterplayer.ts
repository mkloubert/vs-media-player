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
import * as mplayer_rest from '../rest';
import * as vscode from 'vscode';


interface AccessTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
};

/**
 * A Napster player config entry.
 */
export interface NapsterPlayerConfig extends mplayer_contracts.PlayerConfig {
    /**
     * The API key of an own registered Napster app.
     */
    readonly apiKey: string;
    /**
     * The API secret of an own registered Napster app.
     */
    readonly apiSecret: string;
    /**
     * The password of the account.
     */
    readonly password: string;
    /** @inheritdoc */
    readonly type: "napster";
    /**
     * The username / email address of the account.
     */
    readonly user: string;
}

/**
 * A Napster player.
 */
export class NapsterPlayer extends Events.EventEmitter implements mplayer_contracts.MediaPlayer {
    /**
     * Stores the cache of access tokens.
     */
    protected readonly _ACCESS_TOKENS: mplayer_cache.MementoCache;
    /**
     * Stores the underlying configuration.
     */
    protected readonly _CONFIG: NapsterPlayerConfig;
    /**
     * Stores the underlying extension context.
     */
    protected readonly _CONTEXT: vscode.ExtensionContext;
    /**
     * Stores the ID.
     */
    protected readonly _ID: number;
    /**
     * Stores if player is connected or not.
     */
    protected _isConnected = false;
    /**
     * Stores if player has been initialized or not.
     */
    protected _isInitialized = false;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {NapsterPlayerConfig} cfg The underlying configuration.
     * @param {vscode.ExtensionContext} context The extension context.
     */
    constructor(id: number,
                cfg: NapsterPlayerConfig, context: vscode.ExtensionContext) {
        super();

        if (!cfg) {
            cfg = <any>{};
        }

        this._ID = id;
        this._CONFIG = cfg;
        this._CONTEXT = context;
        this._ACCESS_TOKENS = new mplayer_cache.MementoCache(context.globalState,
                                                             'vscMediaPlayerNapsterAPI');
    }

    /**
     * Gets the cache of all access tokens.
     */
    public get accessTokens(): mplayer_cache.MementoCache {
        return this._ACCESS_TOKENS;
    }

    /**
     * Gets the config.
     */
    public get config(): NapsterPlayerConfig {
        return this._CONFIG;
    }

    /** @inheritdoc */
    public connect() {
        const ME = this;

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            if (ME.isConnected) {
                COMPLETED(null, false);
                return;
            }

            try {
                const ACCESS_TOKEN = await ME.getNewAccessToken();

                const CACHE_KEY = ME.getAccessTokenKey();
                if (!mplayer_helpers.isEmptyString(CACHE_KEY)) {
                    if (ACCESS_TOKEN && !mplayer_helpers.isEmptyString(ACCESS_TOKEN.access_token)) {
                        let result = false;
                        if ((await ME.accessTokens.set(CACHE_KEY, ACCESS_TOKEN.access_token, ACCESS_TOKEN.expires_in))) {
                            // make an initial call to profile API

                            const CLIENT = await ME.getClient();
                            if (CLIENT) {
                                const RESPONSE = await CLIENT.setUrl('https://api.napster.com/v2.2/me')
                                                             .GET();

                                if (RESPONSE) {
                                    result = !!(await RESPONSE.getJSON());
                                }
                            }
                        }

                        COMPLETED(null,
                                  ME._isConnected = result);
                    }
                    else {
                        COMPLETED(new Error('No access token received!'));
                    }
                }
                else {
                    COMPLETED(new Error('Invalid config data!'));
                }
            }
            catch (e) {
                COMPLETED(e);
            }
        });
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
            const API_KEY = mplayer_helpers.toStringSafe(ME.config.apiKey);
            if (!mplayer_helpers.isEmptyString(API_KEY)) {
                const API_SECRET  = mplayer_helpers.toStringSafe(ME.config.apiSecret);
                if (!mplayer_helpers.isEmptyString(API_SECRET)) {
                    const KEY = `vsc-mpl\n` +
                                `23091979_MK\n` + 
                                `ID: ${ME.config.__id}\n` + 
                                `API_KEY: ${API_KEY}\n` + 
                                `API_SECRET: ${API_SECRET}\n` + 
                                `05091979_TM`;

                    return Crypto.createHash('sha256')
                                 .update( new Buffer(KEY, 'utf8') )
                                 .digest('hex');
                }
            }
        }
        catch (e) {
            console.log(`[ERROR] NapsterPlayer.getAccessTokenCacheKey(): ${mplayer_helpers.toStringSafe(e)}`);
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
                let accessToken = await this.accessTokens.get(CACHE_KEY, '');

                if (mplayer_helpers.isEmptyString(accessToken)) {
                    const NEW_ACCESS_TOKEN = await this.getNewAccessToken();
                    if (NEW_ACCESS_TOKEN) {
                        accessToken = mplayer_helpers.toStringSafe( NEW_ACCESS_TOKEN.access_token );
                        
                        await this.accessTokens.set(CACHE_KEY, accessToken,
                                                    NEW_ACCESS_TOKEN.expires_in);
                    }
                }

                if (!mplayer_helpers.isEmptyString(accessToken)) {
                    client = new mplayer_rest.RestClient();
                    client.setBearer(accessToken);
                }
            }
            catch (e) {
                mplayer_helpers.log(`[ERROR] NapsterPlayerConfig.getClient(): ${mplayer_helpers.toStringSafe(e)}`);
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
    protected getNewAccessToken(): Promise<AccessTokenResponse> {
        const ME = this;

        return new Promise<AccessTokenResponse>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const API_KEY = mplayer_helpers.toStringSafe(ME.config.apiKey);
                const API_SECRET = mplayer_helpers.toStringSafe(ME.config.apiSecret);
                const USERNAME = mplayer_helpers.toStringSafe(ME.config.user).trim();
                const PASSWORD = mplayer_helpers.toStringSafe(ME.config.password);

                const ACCESS_TOKEN_CLIENT = new mplayer_rest.RestClient('https://api.napster.com/oauth/token');
                ACCESS_TOKEN_CLIENT.setForm({
                    'username': USERNAME,
                    'password': PASSWORD,
                    'grant_type': 'password',
                }).setAuth(API_KEY, API_SECRET);

                await ACCESS_TOKEN_CLIENT.updateContentLength();

                const ACCESS_TOKEN_RESPONSE = await ACCESS_TOKEN_CLIENT.POST();
                if ('200' !== mplayer_helpers.normalizeString(ACCESS_TOKEN_RESPONSE.response.statusCode)) {
                    COMPLETED(new Error(`Unexpected status code: ${ACCESS_TOKEN_RESPONSE.response.statusCode}`));
                    return;
                }

                COMPLETED(null,
                          await ACCESS_TOKEN_RESPONSE.getJSON<AccessTokenResponse>());
            }
            catch (e) {
                COMPLETED(e);
            }
        });
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
        return this._isConnected;
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
