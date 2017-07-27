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
import * as Moment from 'moment';
import * as mplayer_contracts from './contracts';
import * as mplayer_helpers from './helpers';
import * as vscode from 'vscode';


/**
 * The controller class for that extension.
 */
export class MediaPlayerController extends Events.EventEmitter implements vscode.Disposable {
    /**
     * Stores the current configuration.
     */
    protected _config: mplayer_contracts.Configuration;
    /**
     * Stores the extension context.
     */
    protected readonly _CONTEXT: vscode.ExtensionContext;
    /**
     * Stores the global output channel.
     */
    protected readonly _OUTPUT_CHANNEL: vscode.OutputChannel;
    /**
     * Stores the package file of that extension.
     */
    protected _PACKAGE_FILE: mplayer_contracts.PackageFile;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {vscode.ExtensionContext} context The underlying extension context.
     * @param {vscode.OutputChannel} outputChannel The global output channel to use.
     * @param {mplayer_contracts.PackageFile} pkgFile The package file of that extension.
     */
    constructor(context: vscode.ExtensionContext,
                outputChannel: vscode.OutputChannel,
                pkgFile: mplayer_contracts.PackageFile) {
        super();

        this._CONTEXT = context;
        this._OUTPUT_CHANNEL = outputChannel;
        this._PACKAGE_FILE = pkgFile;
    }

    /**
     * Gets the current configuration.
     */
    public get config(): mplayer_contracts.Configuration {
        return this._config;
    }

    /**
     * Gets the underlying extension context.
     */
    public get context(): vscode.ExtensionContext {
        return this._CONTEXT;
    }

    /** @inheritdoc */
    public dispose() {
        try {
            this.removeAllListeners();
        }
        catch (e) {
            console.log(`[ERROR] MediaPlayerController.dispose(): ${mplayer_helpers.toStringSafe(e)}`);
        }
    }

    /**
     * Loads a message.
     * 
     * @param {any} msg The message to log.
     * 
     * @chainable
     */
    public log(msg: any): this {
        let now = Moment();

        msg = mplayer_helpers.toStringSafe(msg);
        this.outputChannel
            .appendLine(`[${now.format('YYYY-MM-DD HH:mm:ss')}] ${msg}`);

        return this;
    }

    /**
     * Is invoked AFTER extension has been activated.
     */
    public onActivated() {
        this.reloadConfiguration();
    }

    /**
     * Is invoked when extension is going to be deactivated.
     */
    public onDeactivate() {
    }

    /**
     * Gets the global output channel.
     */
    public get outputChannel(): vscode.OutputChannel {
        return this._OUTPUT_CHANNEL;
    }

    /**
     * Gets the package file of that extension.
     */
    public get packageFile(): mplayer_contracts.PackageFile {
        return this._PACKAGE_FILE;
    }

    /**
     * Reloads configuration.
     */
    public reloadConfiguration() {
        const ME = this;

        try {
            const CFG: mplayer_contracts.Configuration = vscode.workspace.getConfiguration("media.player") ||
                                                         <any>{};

            this._config = CFG;
        }
        catch (e) {
            ME.log(`[ERROR] MediaPlayerController.reloadConfiguration(1): ${mplayer_helpers.toStringSafe(e)}`);
        }
    }
}
