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

import * as Enumerable from 'node-enumerable';
import * as Events from 'events';
import * as HTTP from 'http';
import * as mplayer_contracts from '../contracts';
import * as mplayer_helpers from '../helpers';
import * as mplayer_players_helpers from './helpers';
import * as URL from 'url';
import * as vscode from 'vscode';
import * as Workflows from 'node-workflows';
import * as Xml2JS from 'xml2js';


type TrackListProvider = () => PromiseLike<mplayer_contracts.Track[]>;
type TrackPlayer = () => PromiseLike<boolean>;


/**
 * A VLC player config entry.
 */
export interface VLCPlayerConfig extends mplayer_contracts.PlayerConfig {
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
    /**
     * Show all playlists or the first one only.
     */
    readonly showAllPlaylists?: boolean;
    /** @inheritdoc */
    readonly type: "vlc";
}

/**
 * A VLC player.
 */
export class VLCPlayer extends Events.EventEmitter implements mplayer_contracts.MediaPlayer {
    /**
     * Stores the underlying configuration.
     */
    protected readonly _CONFIG: VLCPlayerConfig;
    /**
     * Stores the underlying extension context.
     */
    protected readonly _CONTEXT: vscode.ExtensionContext;
    /**
     * Stores the ID.
     */
    protected readonly _ID: number;
    /**
     * Stores if the player is currently connected or not.
     */
    protected _isConnected = false;
    /**
     * Stores if player has been initialized or not.
     */
    protected _isInitialized = false;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {mplayer_contracts.VLCPlayerConfig} cfg The underlying configuration.
     * @param {vscode.ExtensionContext} context The extension context.
     */
    constructor(id: number,
                cfg: VLCPlayerConfig, context: vscode.ExtensionContext) {
        super();

        if (!cfg) {
            cfg = <any>{};
        }

        this._ID = id;
        this._CONFIG = cfg;
        this._CONTEXT = context;
    }

    /**
     * Gets the base URL.
     * 
     * @type {URL.Url} The base URL.
     */
    public get baseURL(): URL.Url {
        let scheme = 'http';

        let host = mplayer_helpers.toStringSafe(this.config.host).trim();
        if ('' === host) {
            host = 'localhost';
        }

        let port = parseInt( mplayer_helpers.toStringSafe(this.config.port).trim() );
        if (isNaN(port)) {
            port = 8080;
        }

        const PWD = mplayer_helpers.toStringSafe(this.config.password);

        return URL.parse(`${scheme}://${'' !== PWD ? (':' + PWD + '@') : ''}${host}:${port}/`);
    }

    /** @inheritdoc */
    public connect() {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            if (!ME._isConnected) {
                ME.getPlaylists().then(() => {
                    ME.updateConnectedState(true);

                    resolve(true);
                }).catch((err) => {
                    ME.updateConnectedState(false, err);

                    reject(err);
                });
            }
            else {
                resolve(false);
            }
        });
    }

    /**
     * Gets the config.
     */
    public get config(): VLCPlayerConfig {
        return this._CONFIG;
    }

    /**
     * Creates basic HTTP requests options.
     * 
     * @return {HTTP.RequestOptions} The new, basic object.
     */
    protected createBasicRequestOptions(): HTTP.RequestOptions {
        const BASE_URL = this.baseURL;

        const HEADERS: any = {};

        const AUTH = mplayer_helpers.toStringSafe(BASE_URL.auth);
        if (AUTH.indexOf(':') > -1) {
            const PARTS = AUTH.split(':');

            HEADERS['Authorization'] = `Basic ${new Buffer(AUTH, 'ascii').toString('base64')}`;
        }
        
        const OPTS: HTTP.RequestOptions = {
            headers: HEADERS,
            host: BASE_URL.hostname,
            port: parseInt(BASE_URL.port),
            method: 'GET',
        };

        return OPTS;
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
                ME.updateConnectedState(false, err);

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
     * @param {mplayer_contracts.Playlist} playlist The playlist.
     * 
     * @return {TrackListProvider} The function.
     */
    protected createTrackListProvider(playlist: mplayer_contracts.Playlist): TrackListProvider {
        const ME = this;

        return () => {
            return new Promise<mplayer_contracts.Track[]>((resolve, reject) => {
                const COMPLETED = ME.createCompletedAction(resolve, reject);

                try {
                    const BASE_URL = ME.baseURL;

                    const HEADERS: any = {};

                    const AUTH = mplayer_helpers.toStringSafe(BASE_URL.auth);
                    if (AUTH.indexOf(':') > -1) {
                        const PARTS = AUTH.split(':');

                        HEADERS['Authorization'] = `Basic ${new Buffer(AUTH, 'ascii').toString('base64')}`;
                    }
                    
                    const OPTS: HTTP.RequestOptions = {
                        headers: HEADERS,
                        host: BASE_URL.hostname,
                        path: '/requests/playlist.xml',
                        port: parseInt(BASE_URL.port),
                        method: 'GET',
                    };

                    const REQUEST = HTTP.request(OPTS, (resp) => {
                        try {
                            switch (resp.statusCode) {
                                case 200:
                                    mplayer_helpers.getHttpBody(resp).then((body) => {
                                        try {
                                            Xml2JS.parseString({
                                                toString: () => {
                                                    return body.toString('utf8');
                                                }
                                            }, (err, xml) => {
                                                if (err) {
                                                    COMPLETED(err);
                                                }
                                                else {
                                                    try {
                                                        const TRACKS: mplayer_contracts.Track[] = [];

                                                        if (xml['node']) {
                                                            mplayer_helpers.asArray(xml['node']).filter(r => r).forEach(r => {
                                                                const NODES = mplayer_helpers.asArray(r['node']);

                                                                NODES.filter(x => x).forEach(n => {
                                                                    let playlistId: any;
                                                                    if (n['$']) {
                                                                        playlistId = n['$']['id'];
                                                                    }

                                                                    if (playlistId !== playlist.id) {
                                                                        return;
                                                                    }

                                                                    mplayer_helpers.asArray(n['leaf']).filter(t => t).forEach(t => {
                                                                        let id: any;
                                                                        let name: string;
                                                                        if (t['$']) {
                                                                            id = t['$']['id'];
                                                                            name = mplayer_helpers.toStringSafe(t['$']['name']);
                                                                        }

                                                                        const NEW_TRACK: mplayer_contracts.Track = {
                                                                            id: id,
                                                                            name: name,
                                                                            play: undefined,
                                                                            playlist: playlist,
                                                                        };

                                                                        (<any>NEW_TRACK)['play'] = ME.createTrackPlayer(NEW_TRACK);

                                                                        TRACKS.push(NEW_TRACK);
                                                                    });
                                                                });
                                                            });
                                                        }

                                                        COMPLETED(null, TRACKS);
                                                    }
                                                    catch (e) {
                                                        COMPLETED(null, e);
                                                    }
                                                }
                                            });
                                        }
                                        catch (e) {
                                            COMPLETED(e);
                                        }
                                    }).catch((err) => {
                                        COMPLETED(err);
                                    });
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
                catch (e) {
                    COMPLETED(e);
                }
            });
        };
    }

    /**
     * Creates a player function for a track.
     * 
     * @param {mplayer_contracts.Track} track The track.
     * 
     * @return {TrackPlayer} The function.
     */
    protected createTrackPlayer(track: mplayer_contracts.Track): TrackPlayer {
        const ME = this;

        return () => {
            return new Promise<boolean>((resolve, reject) => {
                const COMPLETED = ME.createCompletedAction(resolve, reject);

                try {
                    const BASE_URL = ME.baseURL;

                    const HEADERS: any = {};

                    const AUTH = mplayer_helpers.toStringSafe(BASE_URL.auth);
                    if (AUTH.indexOf(':') > -1) {
                        const PARTS = AUTH.split(':');

                        HEADERS['Authorization'] = `Basic ${new Buffer(AUTH, 'ascii').toString('base64')}`;
                    }
                    
                    const OPTS: HTTP.RequestOptions = {
                        headers: HEADERS,
                        host: BASE_URL.hostname,
                        path: '/requests/status.xml?command=' + encodeURIComponent('pl_play') +
                                                  '&id=' + encodeURIComponent( mplayer_helpers.toStringSafe(track.id) ),
                        port: parseInt(BASE_URL.port),
                        method: 'GET',
                    };

                    const REQUEST = HTTP.request(OPTS, (resp) => {
                        try {
                            switch (resp.statusCode) {
                                case 200:
                                    COMPLETED(null, true);
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
                catch (e) {
                    COMPLETED(e);
                }
            });
        };
    }

    /** @inheritdoc */
    public dispose() {
        this.removeAllListeners();

        this.updateConnectedState(null);
    }

    /** @inheritdoc */
    public get extension(): vscode.ExtensionContext {
        return this._CONTEXT;
    }

    /**
     * Returns the list of all playlists.
     * 
     * @returns {mplayer_contracts.Playlist[]} The list of playlists.
     */
    public getAllPlaylists() {
        const ME = this;

        return new Promise<mplayer_contracts.Playlist[]>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const BASE_URL = ME.baseURL;

                const HEADERS: any = {};

                const AUTH = mplayer_helpers.toStringSafe(BASE_URL.auth);
                if (AUTH.indexOf(':') > -1) {
                    const PARTS = AUTH.split(':');

                    HEADERS['Authorization'] = `Basic ${new Buffer(AUTH, 'ascii').toString('base64')}`;
                }
                
                const OPTS: HTTP.RequestOptions = {
                    headers: HEADERS,
                    host: BASE_URL.hostname,
                    path: '/requests/playlist.xml',
                    port: parseInt(BASE_URL.port),
                    method: 'GET',
                };

                const REQUEST = HTTP.request(OPTS, (resp) => {
                    try {
                        switch (resp.statusCode) {
                            case 200:
                                mplayer_helpers.getHttpBody(resp).then((body) => {
                                    try {
                                        Xml2JS.parseString({
                                            toString: () => {
                                                return body.toString('utf8');
                                            }
                                        }, (err, xml) => {
                                            if (err) {
                                                COMPLETED(err);
                                            }
                                            else {
                                                try {
                                                    const PLAYLISTS: mplayer_contracts.Playlist[] = [];

                                                    if (xml['node']) {
                                                        mplayer_helpers.asArray(xml['node']).filter(r => r).forEach(r => {
                                                            const NODES = mplayer_helpers.asArray(r['node']);

                                                            NODES.filter(x => x).forEach(n => {
                                                                let id: any;
                                                                let name: string;
                                                                if (n['$']) {
                                                                    id = n['$']['id'];
                                                                    name = mplayer_helpers.toStringSafe(n['$']['name']);
                                                                }

                                                                const NEW_PLAYLIST: mplayer_contracts.Playlist = {
                                                                    getTracks: undefined,
                                                                    id: id,
                                                                    name: name,
                                                                    player: ME,
                                                                };

                                                                (<any>NEW_PLAYLIST)['getTracks'] = ME.createTrackListProvider(NEW_PLAYLIST);

                                                                PLAYLISTS.push(NEW_PLAYLIST);
                                                            });
                                                        });
                                                    }

                                                    COMPLETED(null, PLAYLISTS);
                                                }
                                                catch (e) {
                                                    COMPLETED(null, e);
                                                }
                                            }
                                        });
                                    }
                                    catch (e) {
                                        COMPLETED(e);
                                    }
                                }).catch((err) => {
                                    COMPLETED(err);
                                });
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
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public getDevices(): Promise<mplayer_contracts.Device[]> {
        const ME = this;

        return new Promise<mplayer_contracts.Device[]>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const DEFAULT_DATA = mplayer_players_helpers.getDefaultOutputData(ME.config);

                COMPLETED(null, [
                    {
                        id: DEFAULT_DATA.id,
                        isActive: true,
                        name: DEFAULT_DATA.name,
                        player: ME,
                        select: () => Promise.resolve(true),
                    }
                ]);
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public async getPlaylists() {
        const ALL_PLAYLISTS = await this.getAllPlaylists();

        let playlists: mplayer_contracts.Playlist[] = [];

        if (!mplayer_helpers.toBooleanSafe(this.config.showAllPlaylists)) {
            if (ALL_PLAYLISTS && ALL_PLAYLISTS.length > 0) {
                playlists.push( ALL_PLAYLISTS[0] );
            }
        }
        else {
            playlists = playlists.concat( ALL_PLAYLISTS || [] );
        }

        return playlists.filter(pl => pl);
    }

    /** @inheritdoc */
    public getStatus() {
        const ME = this;

        return new Promise<mplayer_contracts.PlayerStatus>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const OPTS = ME.createBasicRequestOptions();
                OPTS.path = '/requests/status.xml';

                const REQUEST = HTTP.request(OPTS, (resp) => {
                    try {
                        switch (resp.statusCode) {
                            case 200:
                                mplayer_helpers.getHttpBody(resp).then(async (body) => {
                                    try {
                                        Xml2JS.parseString({
                                            toString: () => {
                                                return body.toString('utf8');
                                            }
                                        }, (err, xml) => {
                                            if (err) {
                                                COMPLETED(err);
                                            }
                                            else {
                                                let isShuffle: boolean;
                                                let repeat: mplayer_contracts.RepeatType;

                                                const STATUS: mplayer_contracts.PlayerStatus = {
                                                    isConnected: undefined,
                                                    player: ME,
                                                    state: mplayer_contracts.State.Stopped,
                                                };

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
                                                        const V = this.volume;
                                                        if (!isNaN(V)) {
                                                            return V <= 0.0;
                                                        }
                                                    }
                                                });

                                                // STATUS.isShuffle
                                                Object.defineProperty(STATUS, 'isShuffle', {
                                                    enumerable: true,
                                                    get: function() {
                                                        return isShuffle;
                                                    }
                                                });

                                                // STATUS.repeat
                                                Object.defineProperty(STATUS, 'repeat', {
                                                    enumerable: true,
                                                    get: function() {
                                                        return repeat;
                                                    }
                                                });

                                                let nextAction = () => {
                                                    COMPLETED(null, STATUS);
                                                };

                                                if (xml['root']) {
                                                    // state
                                                    mplayer_helpers.asArray(xml['root']['state']).filter(x => x).forEach(x => {
                                                        let state: mplayer_contracts.State;

                                                        switch (mplayer_helpers.normalizeString(x)) {
                                                            case 'paused':
                                                                state = mplayer_contracts.State.Paused;
                                                                break;

                                                            case 'playing':
                                                                state = mplayer_contracts.State.Playing;
                                                                break;
                                                        }

                                                        (<any>STATUS)['state'] = state;
                                                    });

                                                    // volume
                                                    mplayer_helpers.asArray(xml['root']['volume']).filter(x => x).forEach(x => {
                                                        let vol = parseFloat( mplayer_helpers.toStringSafe(x).trim() );
                                                        if (!isNaN(vol)) {
                                                            if (vol < 0.0) {
                                                                vol = 0;
                                                            }

                                                            vol = vol / 256.0;  // 256 => 100%

                                                            (<any>STATUS)['volume'] = vol;
                                                        }
                                                    });

                                                    // random
                                                    mplayer_helpers.asArray(xml['root']['random']).filter(x => x).forEach(x => {
                                                        x = mplayer_helpers.normalizeString(x);
                                                        if ('' !== x) {
                                                            isShuffle = 'true' === x;
                                                        }
                                                    });

                                                    // loop
                                                    mplayer_helpers.asArray(xml['root']['loop']).filter(x => x).forEach(x => {
                                                        x = mplayer_helpers.normalizeString(x);
                                                        if ('true' === x) {
                                                            repeat = mplayer_contracts.RepeatType.LoopAll;
                                                        }
                                                    });

                                                    // repeat
                                                    mplayer_helpers.asArray(xml['root']['repeat']).filter(x => x).forEach(x => {
                                                        x = mplayer_helpers.normalizeString(x);
                                                        if ('true' === x) {
                                                            repeat = mplayer_contracts.RepeatType.RepeatCurrent;
                                                        }
                                                    });

                                                    if (xml['root']['currentplid']) {
                                                        const WF = Workflows.create();

                                                        mplayer_helpers.asArray(xml['root']['currentplid']).forEach(x => {
                                                            WF.next((ctx) => {
                                                                return new Promise<any>((res, rej) => {
                                                                    ME.getAllPlaylists().then((playlists: mplayer_contracts.Playlist[]) => {
                                                                        res(playlists);
                                                                    }, (err) => {
                                                                        rej(err);
                                                                    });
                                                                });
                                                            });

                                                            WF.next((ctx) => {
                                                                return new Promise<any>((res, rej) => {
                                                                    const WF_TRACKS = Workflows.create();

                                                                    WF_TRACKS.next((ctx2) => {
                                                                        ctx2.result = [];
                                                                    });

                                                                    ctx.previousValue.forEach((pl: mplayer_contracts.Playlist, i) => {
                                                                        WF_TRACKS.next((ctx2) => {
                                                                            const ALL_TRACKS: mplayer_contracts.Track[] = ctx2.result;

                                                                            return new Promise<any>((res2, rej2) => {
                                                                                pl.getTracks().then((tracks: mplayer_contracts.Track[]) => {
                                                                                    ctx2.result = ALL_TRACKS.concat( tracks );
                                                                                    
                                                                                    res2();
                                                                                }, (err) => {
                                                                                    rej2(err);
                                                                                });
                                                                            });
                                                                        });
                                                                    });

                                                                    WF_TRACKS.start().then((tracks: mplayer_contracts.Track[]) => {
                                                                        try {
                                                                            tracks.forEach(t => {
                                                                                if (mplayer_helpers.normalizeString(t.id) === x) {
                                                                                    (<any>STATUS)['track'] = t;
                                                                                }
                                                                            });

                                                                            res();
                                                                        }
                                                                        catch (e) {
                                                                            rej(e);
                                                                        }
                                                                    }).catch((err) => {
                                                                        rej(err);
                                                                    });
                                                                });
                                                            });
                                                        });

                                                        nextAction = () => {
                                                            WF.start().then(() => {
                                                                COMPLETED(null, STATUS);
                                                            }).catch((err) => {
                                                                COMPLETED(err);
                                                            });
                                                        };
                                                    }
                                                }

                                                if (nextAction) {
                                                    nextAction();
                                                }
                                            }
                                        });
                                    }
                                    catch (e) {
                                        COMPLETED(e);
                                    }
                                }).catch((err) => {
                                    COMPLETED(err);
                                });
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
                try {
                    const BASE_URL = ME.baseURL;

                    const HEADERS: any = {};

                    const AUTH = mplayer_helpers.toStringSafe(BASE_URL.auth);
                    if (AUTH.indexOf(':') > -1) {
                        const PARTS = AUTH.split(':');

                        HEADERS['Authorization'] = `Basic ${new Buffer(AUTH, 'ascii').toString('base64')}`;
                    }
                    
                    const OPTS: HTTP.RequestOptions = {
                        headers: HEADERS,
                        host: BASE_URL.hostname,
                        path: '/requests/status.xml?command=' + encodeURIComponent('pl_next'),
                        port: parseInt(BASE_URL.port),
                        method: 'GET',
                    };

                    const REQUEST = HTTP.request(OPTS, (resp) => {
                        try {
                            switch (resp.statusCode) {
                                case 200:
                                    COMPLETED(null, true);
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
                catch (e) {
                    COMPLETED(e);
                }
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
                try {
                    const OPTS = ME.createBasicRequestOptions();
                    OPTS.path = '/requests/status.xml?command=' + encodeURIComponent('pl_pause');

                    const REQUEST = HTTP.request(OPTS, (resp) => {
                        try {
                            switch (resp.statusCode) {
                                case 200:
                                    COMPLETED(null, true);
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
                catch (e) {
                    COMPLETED(e);
                }
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
                try {
                    const OPTS = ME.createBasicRequestOptions();
                    OPTS.path = '/requests/status.xml?command=' + encodeURIComponent('pl_play');

                    const REQUEST = HTTP.request(OPTS, (resp) => {
                        try {
                            switch (resp.statusCode) {
                                case 200:
                                    COMPLETED(null, true);
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
                catch (e) {
                    COMPLETED(e);
                }
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
                try {
                    const BASE_URL = ME.baseURL;

                    const HEADERS: any = {};

                    const AUTH = mplayer_helpers.toStringSafe(BASE_URL.auth);
                    if (AUTH.indexOf(':') > -1) {
                        const PARTS = AUTH.split(':');

                        HEADERS['Authorization'] = `Basic ${new Buffer(AUTH, 'ascii').toString('base64')}`;
                    }
                    
                    const OPTS: HTTP.RequestOptions = {
                        headers: HEADERS,
                        host: BASE_URL.hostname,
                        path: '/requests/status.xml?command=' + encodeURIComponent('pl_previous'),
                        port: parseInt(BASE_URL.port),
                        method: 'GET',
                    };

                    const REQUEST = HTTP.request(OPTS, (resp) => {
                        try {
                            switch (resp.statusCode) {
                                case 200:
                                    COMPLETED(null, true);
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
                catch (e) {
                    COMPLETED(e);
                }
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public searchPlaylists(expr?: string): Promise<mplayer_contracts.PlaylistSearchResult> {
        const ME = this;

        const SEARCH_PARTS = mplayer_players_helpers.toSearchExpressionParts(expr);

        return new Promise<mplayer_contracts.PlaylistSearchResult>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const PLAYLISTS: mplayer_contracts.Playlist[] =
                    Enumerable.from( await ME.getAllPlaylists() )
                              .toArray();

                const MATCHING_PLAYLISTS: mplayer_contracts.Playlist[] = [];

                for (let i = 0; i < PLAYLISTS.length; i++) {
                    const PL = PLAYLISTS[i];

                    if (mplayer_helpers.doesSearchMatch(SEARCH_PARTS, PL.name)) {
                        MATCHING_PLAYLISTS.push(PL);
                    }
                }

                COMPLETED(null, {
                    playlists: MATCHING_PLAYLISTS,
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public searchTracks(expr?: string): Promise<mplayer_contracts.TrackSearchResult> {
        const ME = this;

        const SEARCH_PARTS = mplayer_players_helpers.toSearchExpressionParts(expr);

        return new Promise<mplayer_contracts.TrackSearchResult>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const PLAYLISTS: mplayer_contracts.Playlist[] =
                    Enumerable.from( await ME.getAllPlaylists() )
                              .toArray();

                const MATCHING_TRACKS: mplayer_contracts.Track[] = [];

                for (let i = 0; i < PLAYLISTS.length; i++) {
                    const PL = PLAYLISTS[i];

                    const TRACKS = ((await PL.getTracks()) || []).filter(t => t);
                    for (let j = 0; j < TRACKS.length; j++) {
                        const TR = TRACKS[j];
                        if (mplayer_helpers.doesSearchMatch(SEARCH_PARTS, TR.name)) {
                            MATCHING_TRACKS.push(TR);
                        }
                    }
                }

                COMPLETED(null, {
                    tracks: MATCHING_TRACKS,
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public setVolume(newValue: number): Promise<boolean> {
        newValue = parseFloat( mplayer_helpers.toStringSafe(newValue).trim() );
        if (isNaN(newValue)) {
            newValue = 1.0;
        }

        newValue = Math.max(0.0, newValue);

        newValue = Math.floor( newValue * 256.0 );
        
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                const OPTS = ME.createBasicRequestOptions();
                OPTS.path = '/requests/status.xml?command=' + encodeURIComponent('volume') +
                                                '&val=' + encodeURIComponent( '' + newValue );

                const REQUEST = HTTP.request(OPTS, (resp) => {
                    try {
                        switch (resp.statusCode) {
                            case 200:
                                COMPLETED(null, true);
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
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /** @inheritdoc */
    public toggleRepeat(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>(async (resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                let cmd: string;

                const STATUS = await ME.getStatus();
                if (STATUS) {
                    if (mplayer_helpers.isNullOrUndefined(STATUS.repeat)) {
                        cmd = 'pl_loop';
                    }
                }

                if (mplayer_helpers.isEmptyString(cmd)) {
                    cmd = 'pl_repeat';
                }

                const OPTS = ME.createBasicRequestOptions();
                OPTS.path = '/requests/status.xml?command=' + encodeURIComponent(cmd);

                const REQUEST = HTTP.request(OPTS, (resp) => {
                    try {
                        switch (resp.statusCode) {
                            case 200:
                                COMPLETED(null, true);
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
                const OPTS = ME.createBasicRequestOptions();
                OPTS.path = '/requests/status.xml?command=' + encodeURIComponent('pl_random');

                const REQUEST = HTTP.request(OPTS, (resp) => {
                    try {
                        switch (resp.statusCode) {
                            case 200:
                                COMPLETED(null, true);
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
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * Updates the 'connected' state.
     * 
     * @param {boolean} newState The new state.
     * @param {any} [err] An error (if occurred).
     * 
     * @return {boolean} State has been updated or not.
     */
    protected updateConnectedState(newState: boolean, err?: any): boolean {
        const ME = this;

        if (this._isConnected !== newState) {
            this._isConnected = newState;

            let eventName: string = null;
            const EVENT_ARGS = [ err ];

            if (null !== newState) {
                if (newState) {
                    eventName = 'connected';
                }
                else {
                    eventName = 'disconnected';
                }
            }
            else {
                eventName = 'disposed';
            }

            if (null !== eventName) {
                ME.emit
                  .apply(ME, [ eventName ].concat( EVENT_ARGS ));
            }

            return true;
        }
        
        return false;
    }

    /** @inheritdoc */
    public volumeDown(): Promise<boolean> {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
                try {
                    const OPTS = ME.createBasicRequestOptions();
                    OPTS.path = '/requests/status.xml?command=' + encodeURIComponent('volume') +
                                                     '&val=' + encodeURIComponent( '-5' );

                    const REQUEST = HTTP.request(OPTS, (resp) => {
                        try {
                            switch (resp.statusCode) {
                                case 200:
                                    COMPLETED(null, true);
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
                catch (e) {
                    COMPLETED(e);
                }
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
                try {
                    const OPTS = ME.createBasicRequestOptions();
                    OPTS.path = '/requests/status.xml?command=' + encodeURIComponent('volume') +
                                                     '&val=' + encodeURIComponent( '+5' );

                    const REQUEST = HTTP.request(OPTS, (resp) => {
                        try {
                            switch (resp.statusCode) {
                                case 200:
                                    COMPLETED(null, true);
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
                catch (e) {
                    COMPLETED(e);
                }
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }
}
