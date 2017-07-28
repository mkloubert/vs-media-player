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
import * as mplayer_contracts from '../contracts';
import * as mplayer_helpers from '../helpers';
import * as URL from 'url';
import * as vscode from 'vscode';
import * as Workflows from 'node-workflows';
import * as Xml2JS from 'xml2js';


type TrackListProvider = () => PromiseLike<mplayer_contracts.Track[]>;
type TrackPlayer = () => PromiseLike<boolean>;

/**
 * A VLC player.
 */
export class VLCPlayer extends Events.EventEmitter implements mplayer_contracts.MediaPlayer {
    /**
     * Stores the underlying configuration.
     */
    protected readonly _CONFIG: mplayer_contracts.VLCPlayerConfig;
    /**
     * Stores the ID.
     */
    protected readonly _ID: number;
    /**
     * Stores if the player is currently connected or not.
     */
    protected _isConnected = false;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {mplayer_contracts.VLCPlayerConfig} cfg The underlying configuration.
     */
    constructor(id: number, cfg: mplayer_contracts.VLCPlayerConfig) {
        super();

        if (!cfg) {
            cfg = <any>{};
        }

        this._ID = id;
        this._CONFIG = cfg;
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
    public get config(): mplayer_contracts.VLCPlayerConfig {
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
    public getPlaylists() {
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
                                                    let firstPlaylist: mplayer_contracts.Playlist;

                                                    if (xml['node']) {
                                                        mplayer_helpers.asArray(xml['node']).filter(r => r).forEach(r => {
                                                            const NODES = mplayer_helpers.asArray(r['node']);

                                                            NODES.filter(x => x).forEach(n => {
                                                                if (firstPlaylist) {
                                                                    return;
                                                                }

                                                                let id: any;
                                                                let name: string;
                                                                if (n['$']) {
                                                                    id = n['$']['id'];
                                                                    name = mplayer_helpers.toStringSafe(n['$']['name']);
                                                                }

                                                                firstPlaylist = {
                                                                    getTracks: undefined,
                                                                    id: id,
                                                                    name: name,
                                                                    player: ME,
                                                                };
                                                                (<any>firstPlaylist)['getTracks'] = ME.createTrackListProvider(firstPlaylist);
                                                            });
                                                        });
                                                    }

                                                    if (firstPlaylist) {
                                                        PLAYLISTS.push(firstPlaylist);
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

                REQUEST.end();
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

                                                    if (xml['root']['currentplid']) {
                                                        const WF = Workflows.create();

                                                        mplayer_helpers.asArray(xml['root']['currentplid']).forEach(x => {
                                                            WF.next((ctx) => {
                                                                return new Promise<any>((res, rej) => {
                                                                    ME.getPlaylists().then((playlists: mplayer_contracts.Playlist[]) => {
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
    public get isConnected(): boolean {
        return this._isConnected;
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
    public setVolume(newValue: number): Promise<boolean> {
        newValue = parseFloat( mplayer_helpers.toStringSafe(newValue).trim() );
        if (isNaN(newValue)) {
            newValue = 1.0;
        }

        newValue = Math.max(0.0, newValue);

        newValue = Math.floor( newValue * 256.0 );
        
        const ME = this;

        console.log(`newValue: ${newValue}`);

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = ME.createCompletedAction(resolve, reject);

            try {
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
