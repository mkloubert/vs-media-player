'use strict';

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

import * as FS from 'fs';
import * as mplayer_contracts from './contracts';
import * as mplayer_controller from './controller';
import * as mplayer_helpers from './helpers';
import * as Path from 'path';
import * as vscode from 'vscode';


let controller: mplayer_controller.MediaPlayerController;

export function activate(context: vscode.ExtensionContext) {
    // version
    let pkgFile: mplayer_contracts.PackageFile;
    try {
        pkgFile = JSON.parse(FS.readFileSync(Path.join(__dirname, '../../package.json'), 'utf8'));
    }
    catch (e) {
        mplayer_helpers.log(`[ERROR] extension.activate(): ${mplayer_helpers.toStringSafe(e)}`);
    }

    const OUTPUT_CHANNEL = vscode.window.createOutputChannel("Media Player");

    // show infos about the app
    {
        if (pkgFile) {
            OUTPUT_CHANNEL.appendLine(`${pkgFile.displayName} (${pkgFile.name}) - v${pkgFile.version}`);
        }

        OUTPUT_CHANNEL.appendLine(`Copyright (c) 2017  Marcel Joachim Kloubert <marcel.kloubert@gmx.net>`);
        OUTPUT_CHANNEL.appendLine('');
        OUTPUT_CHANNEL.appendLine(`GitHub : https://github.com/mkloubert/vs-media-player`);
        OUTPUT_CHANNEL.appendLine(`Twitter: https://twitter.com/mjkloubert`);
        OUTPUT_CHANNEL.appendLine(`Donate : [PayPal] https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=ZJ4HXH733Y9S8`);
        OUTPUT_CHANNEL.appendLine(`         [Flattr] https://flattr.com/submit/auto?fid=o62pkd&url=https%3A%2F%2Fgithub.com%2Fmkloubert%2Fvs-media-player`);

        OUTPUT_CHANNEL.appendLine('');
    }

    controller = new mplayer_controller.MediaPlayerController(context, OUTPUT_CHANNEL, pkgFile);

    // connect to player
    const CMD_CONNECT = vscode.commands.registerCommand('extension.mediaPlayer.connect', async () => {
        await controller.connect();
    });

    // disconnects from a player
    const CMD_DISCONNECT = vscode.commands.registerCommand('extension.mediaPlayer.disconnect', async () => {
        await controller.disconnect();
    });

    // configure a player
    const CMD_CONFIGURE = vscode.commands.registerCommand('extension.mediaPlayer.configure', async () => {
        await controller.configure();
    });

    // select item of playlist
    const CMD_SELECT_ITEM_OF_PLAYLIST = vscode.commands.registerCommand('extension.mediaPlayer.selectItemOfPlaylist', async () => {
        await controller.selectItemOfPlaylist();
    });

    // open browser to register an app for Spotify
    const CMD_SPOTIFY_REGISTER_APP = vscode.commands.registerCommand('extension.mediaPlayer.spotify.registerApp', async () => {
        await mplayer_helpers.open('https://developer.spotify.com/my-applications/#!/applications/create', {
            wait: false,
        });
    });

    // notfiy setting changes
    context.subscriptions
           .push(vscode.workspace.onDidChangeConfiguration(controller.onDidChangeConfiguration, controller));

    // commands
    context.subscriptions
           .push(CMD_CONNECT, CMD_DISCONNECT,
                 CMD_CONFIGURE,
                 CMD_SELECT_ITEM_OF_PLAYLIST,
                 CMD_SPOTIFY_REGISTER_APP);

    controller.onActivated();
    context.subscriptions
           .push(controller);
}

export function deactivate() {
    if (controller) {
        controller.onDeactivate();
    }
}
