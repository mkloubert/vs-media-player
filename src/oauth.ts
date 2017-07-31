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
 * An OAuth response.
 */
export interface OAuthResponse {
    /**
     * The code (if available).
     */
    readonly code?: string;
}

/**
 * Starts a HTTP server for receiving an OAuth code.
 * 
 * @export
 * @param {string} provider The (display) name of the provider.
 * @param {string} authUrl The URL to call for starting authorization process.
 * @param {string} redirectURL The redirect URL to the started HTTP server.
 * 
 * @returns {Promise<OAuthResponse>} The promise wirh the response.
 */
export function getOAuthCode(provider: string,
                             authUrl: string, redirectURL: string): Promise<OAuthResponse> {
    provider = mplayer_helpers.toStringSafe(provider).trim();
    authUrl = mplayer_helpers.toStringSafe(authUrl);
    redirectURL = mplayer_helpers.toStringSafe(redirectURL);

    const ME = this;

    return new Promise<OAuthResponse>((resolve, reject) => {
        const COMPLETED = mplayer_helpers.createSimpleCompletedAction(resolve, reject);

        try {
            const REDIRECT_URL = URL.parse(redirectURL);

            let port: number;
            let serverFactory: (requestListener?: (request: HTTP.IncomingMessage, response: HTTP.ServerResponse) => void) => HTTP.Server;
            switch (mplayer_helpers.normalizeString(REDIRECT_URL.protocol)) {
                case 'https:':
                    // secure HTTP
                    {
                        port = parseInt( mplayer_helpers.toStringSafe(REDIRECT_URL.port).trim() );
                        if (isNaN(port)) {
                            port = 443;  // default
                        }

                        serverFactory = function() {
                            return HTTPs.createServer
                                        .apply(null, arguments);
                        };
                    }
                    break;

                default:
                    // HTTP
                    {
                        port = parseInt( mplayer_helpers.toStringSafe(REDIRECT_URL.port).trim() );
                        if (isNaN(port)) {
                            port = 80;  // default
                        }

                        serverFactory = function() {
                            return HTTP.createServer
                                       .apply(null, arguments);
                        };
                    }
                    break;
            }

            let oauthCode: string;
            let server: HTTP.Server;

            // close server safe
            const CLOSE_SERVER = (err: any) => {
                const RESPONSE: OAuthResponse = {
                    code: oauthCode,
                };

                if (server) {
                    try {
                        server.close(() => {
                            COMPLETED(err, RESPONSE);
                        });
                    }
                    catch (e) {
                        COMPLETED(err, RESPONSE);
                    }
                }
                else {
                    COMPLETED(err, RESPONSE);
                }
            };

            let requestHandled = false;
            server = serverFactory((req, resp) => {
                if (requestHandled) {
                    return;  // already handled
                }

                requestHandled = true;

                try {
                    const PARAMS = mplayer_helpers.queryParamsToObject( URL.parse(req.url).query );
                    const CODE = PARAMS['code'];
                    if (!mplayer_helpers.isEmptyString(CODE)) {
                        oauthCode = CODE;
                    }

                    // send response
                    resp.writeHead(200, 'OK', {
                        'Content-type': 'text/plain; charset=utf-8',
                    });
                    resp.write( new Buffer(`Your account has been authorized${'' !== provider ? ` with ${provider}` : ''}. You can close that application / tab now.`, 'utf8') );
                    resp.end();
                }
                catch (e) { 
                    //TODO: log error
                }
                finally {
                    CLOSE_SERVER(null);
                }
            });

            server.once('error', (err) => {
                if (err) {
                    CLOSE_SERVER(err);
                }
            });

            server.listen(port, (err) => {
                if (err) {
                    CLOSE_SERVER(err);
                }
                else {
                    // open URL (in browser e.g.)

                    mplayer_helpers.open(authUrl, {
                        wait: false,
                    }).then(() => {                                        
                    }).catch((err) => {
                        CLOSE_SERVER(err);
                    });
                }
            });
        }
        catch (e) {
            COMPLETED(e);
        }
    });
}
