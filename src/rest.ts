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

import * as HTTP from 'http';
import * as HTTPs from 'https';
import * as mplayer_helpers from './helpers';
import * as URL from 'url';


/**
 * A function that provides a request body.
 * 
 * @param {TState} state The state value.
 * 
 * @return {any} The data with the body.
 */
export type RequestBodyProvider<TState = any> = (state: TState) => any;

/**
 * A REST client response.
 */
export interface RestClientResponse<TState = any> {
    /**
     * The underlying client.
     */
    readonly client: RestClient;
    /**
     * Gets the response body.
     */
    readonly getBody: () => Promise<Buffer>;
    /**
     * Gets the body as JSON object.
     * 
     * @param {string} [enc] The custom encosing to use.
     * 
     * @returns {Promise<TResult>} The promise with the (new) object.
     */
    getJSON<TResult>(enc?: string): Promise<TResult>;
    /**
     * Gets the body as string.
     * 
     * @param {string} [enc] The custom encosing to use.
     * 
     * @returns {Promise<string>} The promise with string.
     */
    getString: (enc?: string) => Promise<string>;
    /**
     * The request options.
     */
    readonly request: HTTP.RequestOptions;
    /**
     * The response context.
     */
    readonly response: HTTP.IncomingMessage;
    /**
     * The state value.
     */
    readonly state?: TState;
    /**
     * The URL.
     */
    readonly url: URL.Url;
}

/**
 * A result of a REST client request.
 */
export type RestClientResult<TState = any> = Promise<RestClientResponse<TState>>;

/**
 * A REST client.
 */
export class RestClient {
    /**
     * Stores the function for getting the request body.
     */
    protected _bodyProvider: RequestBodyProvider;
    /**
     * Stores the state value for the function that gets the request body.
     */
    protected _bodyProviderState: any;
    /**
     * The encoding.
     */
    protected _encoding: string;
    /**
     * Stores the headers to send.
     */
    protected _headers: any;
    /**
     * Stores the query parameters to send.
     */
    protected _params: any;
    /**
     * Stores the URL.
     */
    protected _url: string;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {string} [url] The URl.
     */
    constructor(url?: string) {
        this.setUrl(url)
            .reset();
    }

    /**
     * Gets the function that gets the request body.
     */
    public get bodyProvider(): RequestBodyProvider {
        return this._bodyProvider;
    }

    /**
     * Gets the state for the function that gets the request body.
     */
    public get bodyProviderState(): any {
        return this._bodyProviderState;
    }

    /**
     * Starts a DELETE request.
     * 
     * @param {TState} [state] The optional state value.
     * 
     * @returns {RestClientResult<TState>} The promise with the response.
     */
    public DELETE<TState = any>(state?: TState): RestClientResult<TState> {
        return this.REQUEST('DELETE', state);
    }

    /**
     * Starts a GET request.
     * 
     * @param {TState} [state] The optional state value.
     * 
     * @returns {RestClientResult<TState>} The promise with the response.
     */
    public GET<TState = any>(state?: TState): RestClientResult<TState> {
        return this.REQUEST('GET', state);
    }

    /**
     * Gets the encoding.
     */
    public get encoding(): string {
        return this._encoding;
    }
    
    /**
     * Starts a HEAD request.
     * 
     * @param {TState} [state] The optional state value.
     * 
     * @returns {RestClientResult<TState>} The promise with the response.
     */
    public HEAD<TState = any>(state?: TState): RestClientResult<TState> {
        return this.REQUEST('HEAD', state);
    }

    /**
     * Gets the request headers.
     */
    public get headers(): any {
        return this._headers;
    }

    /**
     * Starts an OPTIONS request.
     * 
     * @param {TState} [state] The optional state value.
     * 
     * @returns {RestClientResult<TState>} The promise with the response.
     */
    public OPTIONS<TState = any>(state?: TState): RestClientResult<TState> {
        return this.REQUEST('OPTIONS', state);
    }

    /**
     * Gets the request parameters.
     */
    public get params(): any {
        return this._params;
    }

    /**
     * Starts a PATCH request.
     * 
     * @param {TState} [state] The optional state value.
     * 
     * @returns {RestClientResult<TState>} The promise with the response.
     */
    public PATCH<TState = any>(state?: TState): RestClientResult<TState> {
        return this.REQUEST('PATCH', state);
    }

    /**
     * Starts a POST request.
     * 
     * @param {TState} [state] The optional state value.
     * 
     * @returns {RestClientResult<TState>} The promise with the response.
     */
    public POST<TState = any>(state?: TState): RestClientResult<TState> {
        return this.REQUEST('POST', state);
    }

    /**
     * Starts a PUT request.
     * 
     * @param {TState} [state] The optional state value.
     * 
     * @returns {RestClientResult<TState>} The promise with the response.
     */
    public PUT<TState = any>(state?: TState): RestClientResult<TState> {
        return this.REQUEST('PUT', state);
    }

    /**
     * Starts a request.
     * 
     * @param {string} method The HTTP method.
     * @param {TState} [state] The optional state value.
     * 
     * @returns {RestClientResult<TState>} The promise with the response.
     */
    public REQUEST<TState = any>(method: string, state?: TState): RestClientResult<TState> {
        const ME = this;

        method = mplayer_helpers.toStringSafe(method).toUpperCase().trim();
        if ('' === method) {
            method = 'GET';
        }
        
        return new Promise<RestClientResponse>(async (resolve, reject) => {
            const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

            try {
                const REQUEST_URL = URL.parse(ME.url);

                let defaultEncoding = mplayer_helpers.normalizeString(ME.encoding);
                if ('' === defaultEncoding) {
                    defaultEncoding = 'utf8';
                }

                let path = REQUEST_URL.pathname;
                if (mplayer_helpers.isEmptyString(path)) {
                    path = '';
                }

                // query parameters
                let paramIndex = -1;
                for (let paramName in ME.params) {
                    const PARAM_VALUE = ME.params[paramName];
                    if ('undefined' === typeof PARAM_VALUE) {
                        continue;
                    }

                    ++paramIndex;

                    path += (paramIndex > 0) ? '&' : '?';
                    path += `${paramName}=${encodeURIComponent( mplayer_helpers.toStringSafe(PARAM_VALUE) )}`; 
                }

                const OPTS: HTTP.RequestOptions = {
                    headers: ME.headers,
                    hostname: REQUEST_URL.hostname,
                    path: path,
                    method: method,
                };

                let requestFactory: (options: HTTP.RequestOptions, callback?: (res: HTTP.IncomingMessage) => void) => HTTP.ClientRequest;

                let port: number;
                switch (mplayer_helpers.normalizeString(REQUEST_URL.protocol)) {
                    case "https:":
                        // Secure HTTP
                        {
                            requestFactory = HTTPs.request;

                            port = parseInt( mplayer_helpers.toStringSafe(REQUEST_URL.port) );
                            if (isNaN(port)) {
                                port = 443;
                            }
                        }
                        break;

                    default:
                        // HTTP
                        {
                            requestFactory = HTTP.request;

                            port = parseInt( mplayer_helpers.toStringSafe(REQUEST_URL.port) );
                            if (isNaN(port)) {
                                port = 80;
                            }
                        }
                        break;
                }

                OPTS.port = port;

                const REQUEST = requestFactory(OPTS, (resp) => {
                    try {
                        const BODY_NOT_LOADED = Symbol('BODY_NOT_LOADED');
                        let body: Buffer | symbol = BODY_NOT_LOADED;

                        const RESPONSE: RestClientResponse = {
                            client: ME,
                            getBody: async function() {
                                if (BODY_NOT_LOADED === body) {
                                    body = await mplayer_helpers.getHttpBody(resp);
                                }

                                return <Buffer>body;
                            },
                            getJSON: async function(enc?: string) {
                                return JSON.parse( await this.getString(enc) );
                            },
                            getString: async function(enc?: string) {
                                enc = mplayer_helpers.normalizeString(enc);
                                if ('' === enc) {
                                    enc = defaultEncoding;
                                }

                                return (await this.getBody()).toString(enc);
                            },
                            request: OPTS,
                            response: resp,
                            state: state,
                            url: REQUEST_URL,
                        }

                        COMPLETED(null, RESPONSE);
                    }
                    catch (e) {
                        COMPLETED(e);
                    }
                });

                mplayer_helpers.registerSafeHttpRequestErrorHandlerForCompletedAction(REQUEST, COMPLETED);

                let requestBody: any;
                
                const BODY_PROVIDER = ME.bodyProvider;
                const BODY_PROVIDER_STATE = ME.bodyProviderState;
                if (BODY_PROVIDER) {
                    requestBody = await Promise.resolve( BODY_PROVIDER(BODY_PROVIDER_STATE) );
                }

                if (!mplayer_helpers.isNullOrUndefined(requestBody)) {
                    if (!Buffer.isBuffer(REQUEST.write(requestBody))) {
                        if ('object' === typeof requestBody) {
                            // make JSON
                            requestBody = new Buffer( JSON.stringify(requestBody), defaultEncoding );
                        }
                        else {
                            // as string
                            requestBody = new Buffer( mplayer_helpers.toStringSafe(requestBody), defaultEncoding );
                        }
                    }

                    REQUEST.write(requestBody);
                }

                REQUEST.end();
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * Resets the request data.
     * 
     * @chainable
     */
    public reset(): this {
        return this.resetHeaders()
                   .resetParams()
                   .resetBodyProvider();
    }

    /**
     * Resets the function for getting the request body.
     * 
     * @chainable
     */
    public resetBodyProvider(): this {
        this._bodyProvider = null;
        this._bodyProviderState = null;

        return this;
    }

    /**
     * Resets the encoding.
     * 
     * @chainable
     */
    public resetEncoding(): this {
        this._encoding = null;
        return this;
    }

    /**
     * Resets the request headers.
     * 
     * @chainable
     */
    public resetHeaders() {
        this._headers = {};
        return this;
    }

    /**
     * Resets the query parameters.
     * 
     * @chainable
     */
    public resetParams() {
        this._params = {};
        return this;
    }

    public setAuth(user: string, password: string): this {
        user = mplayer_helpers.toStringSafe(user);
        password = mplayer_helpers.toStringSafe(password);

        let headerValue: string;

        if (!mplayer_helpers.isEmptyString(user) && ('' !== password)) {
            const BASE64 = (new Buffer(`${user}:${password}`)).toString('base64');

            headerValue = `Basic ${BASE64}`;
        }

        return this.setHeader('Authorization', headerValue);
    }

    /**
     * Sets a bearer authorization token.
     * 
     * @param {string} [token] The token to set.
     * 
     * @chainable
     */
    public setBearer(token?: string): this {
        let headerValue = mplayer_helpers.toStringSafe(token);
        if (!mplayer_helpers.isEmptyString(headerValue)) {
            headerValue = `Bearer ${headerValue}`;
        }
        else {
            headerValue = undefined;
        }

        return this.setHeader('Authorization', headerValue);
    }

    /**
     * Sets a value as body.
     * 
     * @param {T} value The value to set.
     * @param {string} [contentType] The content type to set.
     * 
     * @chainable
     */
    public setBody<T>(val: T, contentType?: string): this {
        this.setBodyProvider(() => {
            return val;
        });

        if (arguments.length > 1) {
            contentType = mplayer_helpers.normalizeString(contentType);
            if ('' === contentType) {
                contentType = 'application/octet-stream';
            }

            this.setHeader('Content-type', contentType);
        }

        return this;
    }

    /**
     * Sets the function for getting the request body.
     * 
     * @param {RequestBodyProvider<TState>} [provider] The provider. 
     * @param {TState} [state] The state value for the function.
     * 
     * @chainable
     */
    public setBodyProvider<TState = any>(provider?: RequestBodyProvider<TState>, state?: TState): this {
        this._bodyProvider = provider;
        this._bodyProviderState = state;

        return this;
    }

    /**
     * Sets the encoding.
     * 
     * @param {string} [enc] The new value.
     * 
     * @chainable
     */
    public setEncoding(enc?: string): this {
        enc = mplayer_helpers.normalizeString(enc);
        if ('' === enc) {
            enc = undefined;
        }
        
        return this;
    }

    public setForm(params?: { [name: string]: any }, setContentType = true): this {
        setContentType = mplayer_helpers.toBooleanSafe(setContentType, true);

        this.setBodyProvider(() => {
            let body = '';
            if (params) {
                let i = -1;
                for (let paramName in params) {
                    const PARAM_VALUE = params[paramName];
                    if ('undefined' === typeof PARAM_VALUE) {
                        continue;
                    }

                    ++i;

                    body += (i > 0) ? '&' : '';
                    body += `${paramName}=${encodeURIComponent( mplayer_helpers.toStringSafe(PARAM_VALUE) )}`;
                }
            }

            return body;
        });

        if (setContentType) {
            this.setHeader('Content-type', 'application/x-www-form-urlencoded');
        }

        return this;
    }

    /**
     * Sets a request header.
     * 
     * @param {string} name The name of the header. 
     * @param {any} val The value for the header.
     * 
     * @chainable
     */
    public setHeader(name: string, val: any): this {
        name = mplayer_helpers.toStringSafe(name).trim();
        this.headers[name] = val;

        return this;
    }

    /**
     * Sets an object / value as body.
     * 
     * @param {T} obj The object to set.
     * @param {boolean} [setHeaderValue] Also set 'Content-type' header with 'application/json' value or not.
     * 
     * @chainable
     */
    public setJSON<T>(obj: T, setHeaderValue = true): this {
        setHeaderValue = mplayer_helpers.toBooleanSafe(setHeaderValue, true);

        this.setBodyProvider(() => {
            return JSON.stringify( obj );
        });

        if (setHeaderValue) {
            this.setHeader('Content-type', 'application/json');
        }

        return this;
    }

    /**
     * Sets a parameter.
     * 
     * @param {string} name The name of the parameter. 
     * @param {any} val The value for the parameter.
     * 
     * @chainable
     */
    public setParam(name: string, val: any): this {
        name = mplayer_helpers.toStringSafe(name).trim();
        this.params[name] = val;

        return this;
    }

    /**
     * Sets the URL.
     * 
     * @param {string} url The new value.
     *  
     * @chainable
     */
    public setUrl(url: string): this {
        url = mplayer_helpers.toStringSafe(url);
        if (mplayer_helpers.isEmptyString(url)) {
            url = undefined;
        }

        this._url = url;
        return this;
    }

    /**
     * Gets the URL.
     */
    public get url(): string {
        return this._url;
    }
}
