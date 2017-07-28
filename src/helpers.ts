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

import * as HTTP from 'http';
import * as Moment from 'moment';
import * as vscode from 'vscode';


/**
 * Describes a simple 'completed' action.
 * 
 * @param {any} err The occurred error.
 * @param {TResult} [result] The result.
 */
export type SimpleCompletedAction<TResult> = (err: any, result?: TResult) => void;


/**
 * Returns a value as array.
 * 
 * @param {T | T[]} val The value.
 * 
 * @return {T[]} The value as array.
 */
export function asArray<T = any>(val: T | T[]): T[] {
    if (!Array.isArray(val)) {
        return [ val ];
    }

    return val;
}

/**
 * Creates a simple 'completed' callback for a promise.
 * 
 * @param {Function} resolve The 'succeeded' callback.
 * @param {Function} reject The 'error' callback.
 * 
 * @return {SimpleCompletedAction<TResult>} The created action.
 */
export function createSimpleCompletedAction<TResult>(resolve: (value?: TResult | PromiseLike<TResult>) => void,
                                                     reject?: (reason: any) => void): SimpleCompletedAction<TResult> {
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
 * Loads the body from a HTTP response.
 * 
 * @param {HTTP.IncomingMessage} resp The response.
 * 
 * @return {Promise<Buffer>} The promise.
 */
export function getHttpBody(resp: HTTP.IncomingMessage): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const COMPLETED = createSimpleCompletedAction(resolve, reject);

        if (!resp) {
            COMPLETED(null);
            return;
        }

        let body = Buffer.alloc(0);

        try {
            const APPEND_CHUNK = (chunk: Buffer): boolean => {
                try {
                    if (chunk) {
                        body = Buffer.concat([body, chunk]);
                    }

                    return true;
                }
                catch (e) {
                    COMPLETED(e);
                    return false;
                }
            };

            resp.on('data', (chunk: Buffer) => {
                APPEND_CHUNK(chunk);
            });

            resp.on('end', (chunk: Buffer) => {
                if (APPEND_CHUNK(chunk)) {
                    COMPLETED(null, body);
                }
            });

            resp.on('error', (err) => {
                COMPLETED(err);
            });
        }
        catch (e) {
            COMPLETED(e);
        }
    });
}

/**
 * Checks if a value is (null) or (undefined).
 * 
 * @param {any} val The value to check.
 * 
 * @return {boolean} Is (null)/(undefined) or not.
 */
export function isNullOrUndefined(val: any): boolean {
    return null === val ||
           'undefined' === typeof val;
}

/**
 * Logs a message.
 * 
 * @param {any} msg The message to log.
 */
export function log(msg: any) {
    const NOW = Moment();

    msg = toStringSafe(msg);
    console.log(`[vs-media-player :: ${NOW.format('YYYY-MM-DD HH:mm:ss')}] => ${msg}`);
}

/**
 * Normalizes a value as string so that is comparable.
 * 
 * @param {any} val The value to convert.
 * @param {(str: string) => string} [normalizer] The custom normalizer.
 * 
 * @return {string} The normalized value.
 */
export function normalizeString(val: any, normalizer?: (str: string) => string): string {
    if (!normalizer) {
        normalizer = (str) => str.toLowerCase().trim();
    }

    return normalizer(toStringSafe(val));
}

/**
 * Converts a value to a boolean.
 * 
 * @param {any} val The value to convert.
 * @param {any} defaultValue The value to return if 'val' is (null) or (undefined).
 * 
 * @return {boolean} The converted value.
 */
export function toBooleanSafe(val: any, defaultValue: any = false): boolean {
    if (isNullOrUndefined(val)) {
        return defaultValue;
    }

    return !!val;
}

/**
 * Converts a value to a string that is NOT (null) or (undefined).
 * 
 * @param {any} val The input value.
 * @param {any} [defValue] The default value.
 * 
 * @return {string} The output value.
 */
export function toStringSafe(val: any, defValue: any = ''): string {
    if (isNullOrUndefined(val)) {
        return defValue;
    }

    return '' + val;
}

/**
 * Tries to dispose an object.
 * 
 * @param {Object} obj The object to dispose.
 * 
 * @return {boolean} Operation was successful or not.
 */
export function tryDispose(obj: { dispose?: () => any }): boolean {
    try {
        if (obj && obj.dispose) {
            obj.dispose();
        }

        return true;
    }
    catch (e) {
        log(`[ERROR] helpers.tryDispose(): ${toStringSafe(e)}`)

        return false;
    }
}
