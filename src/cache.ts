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

import * as Moment from 'moment';
import * as mplayer_helpers from './helpers';
import * as vscode from 'vscode';


interface Repository {
    [name: string]: RepositoryItem;
}

interface RepositoryItem {
    expiresIn?: string;
    value: any;
}

const EXPIRE_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

/**
 * A Memento based cache.
 * 
 * @export
 * @class MementoCache
 */
export class MementoCache {
    /**
     * Stores the Memento.
     */
    protected readonly _MEMENTO: vscode.Memento;
    /**
     * Stores the repository key.
     */
    protected readonly _REPO_KEY: string;
    
    /**
     * Initializes a new instance of that class.
     * 
     * @param {vscode.Memento} memento The Memento.
     * @param {string} repoKey The repository key.
     */
    constructor(memento: vscode.Memento, repoKey: string) {
        this._MEMENTO = memento;
        this._REPO_KEY = mplayer_helpers.toStringSafe(repoKey);
    }

    /**
     * Returns a value.
     * 
     * @param {any} key The key.
     * @param {TDefault} [defaultValue] The default value.
     *  
     * @returns {(T|TDefault)} The result.
     */
    public get<T = any, TDefault = T>(key: any, defaultValue?: TDefault): T | TDefault {
        const NOW = Moment.utc();

        key = this.normalizeItemKey(key);

        try {
            const REPO = this.getRepositorySafe();

            const ITEM = REPO[key];
            if (ITEM) {
                if (!mplayer_helpers.isEmptyString(ITEM.expiresIn)) {
                    const EXPIRES_IN = Moment.utc( mplayer_helpers.toStringSafe(ITEM.expiresIn).trim(),
                                                   EXPIRE_DATE_FORMAT );
                    if (EXPIRES_IN && EXPIRES_IN.isValid()) {
                        if (EXPIRES_IN.isAfter(NOW)) {
                            return ITEM.value;
                        }

                        // expired => remove and update
                        delete REPO[key];
                        this.saveRepository(REPO).then(() => {
                        }, (err) => {
                            mplayer_helpers.log(`[ERROR] cache.MementoCache.get(2): ${mplayer_helpers.toStringSafe(err)}`);
                        });
                    }
                }
                else {
                    return ITEM.value;  // does not expire
                }
            }
        }
        catch (e) {
            mplayer_helpers.log(`[ERROR] cache.MementoCache.get(1): ${mplayer_helpers.toStringSafe(e)}`);
        }

        return defaultValue;
    } 

    /**
     * Returns a non-empty repository object.
     * 
     * @returns {Repository} The object.
     */
    protected getRepositorySafe(): Repository {
        let repo: Repository;
        if (this.memento) {
            repo = this.memento
                       .get<Repository>(this.repositoryKey);
        }

        return repo || {};
    }

    /**
     * Checks if an item exists.
     * 
     * @param {any} key The key.
     * 
     * @returns {boolean} Item exists or not.
     */
    public has(key: any): boolean {
        const NOT_FOUND = Symbol('NOT_FOUND');

        return this.get(key, NOT_FOUND) !== NOT_FOUND;
    }

    /**
     * Gets the Memento.
     */
    public get memento(): vscode.Memento {
        return this._MEMENTO;
    }

    /**
     * Normalizes a key value.
     * 
     * @param {any} key The input value.
     * 
     * @returns {string} The output value.
     */
    protected normalizeItemKey(key: any): string {
        return mplayer_helpers.normalizeString(key);
    }

    /**
     * Gets the repository key.
     */
    public get repositoryKey(): string {
        return this._REPO_KEY;
    }

    /**
     * Saves the repository object to the memento.
     * 
     * @param {Repository} repo The value to save.
     *  
     * @returns {Promise<boolean>} The promise that indicates if operation was successful or not.
     */
    protected async saveRepository(repo: Repository): Promise<boolean> {
        if (this.memento) {
            try {
                await Promise.resolve(
                    this.memento
                        .update(this.repositoryKey, repo)
                );

                return true;
            }
            catch (e) {
                mplayer_helpers.log(`[ERROR] cache.MementoCache.saveRepository(): ${mplayer_helpers.toStringSafe(e)}`);

                return false;
            }
        }

        return null;
    }

    /**
     * Sets a value.
     * 
     * @param {*} key The key.
     * @param {T} value The value.
     * @param {(Moment.Moment|string|number)} [expiresIn] The time the value expires.
     *  
     * @returns {Promise<boolean>} The promise that indicates if operation was successful or not.
     */
    public async set<T>(key: any, value: T, expiresIn?: Moment.Moment | string | number): Promise<boolean> {
        key = this.normalizeItemKey(key);

        try {
            let expireDate: Moment.Moment;

            if (!mplayer_helpers.isNullOrUndefined(expiresIn)) {
                if ('object' === typeof expiresIn) {
                    expireDate = expiresIn;
                }
                else if ('number' === typeof expiresIn) {
                    expireDate = Moment.utc().add(expiresIn, 'seconds');
                }
                else {
                    expireDate = Moment( mplayer_helpers.toStringSafe(expiresIn),
                                         EXPIRE_DATE_FORMAT ).utc();
                }
            }

            const REPO = this.getRepositorySafe();
            REPO[key] = {
                expiresIn: expireDate ? expireDate.format(EXPIRE_DATE_FORMAT) : undefined,
                value: value,
            };

            return await this.saveRepository(REPO);
        }
        catch (e) {
            mplayer_helpers.log(`[ERROR] cache.MementoCache.set(): ${mplayer_helpers.toStringSafe(e)}`);

            return false;
        }
    }
}