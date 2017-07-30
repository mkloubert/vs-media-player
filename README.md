# vs-media-player

[![Latest Release](https://vsmarketplacebadge.apphb.com/version-short/mkloubert.vs-media-player.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vs-media-player)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/mkloubert.vs-media-player.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vs-media-player)
[![Rating](https://vsmarketplacebadge.apphb.com/rating-short/mkloubert.vs-media-player.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vs-media-player#review-details)

[Visual Studio Code](https://code.visualstudio.com/) (VSCode) extension to control media players like [Spotify](https://developer.spotify.com/) or [VLC](https://www.videolan.org/vlc/) directly from the editor.

![Demo 1 Spotify](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/demo1.gif)

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=ZJ4HXH733Y9S8) [![](https://api.flattr.com/button/flattr-badge-large.png)](https://flattr.com/submit/auto?fid=o62pkd&url=https%3A%2F%2Fgithub.com%2Fmkloubert%2Fvs-media-player)

## Table of contents

1. [Install](#install-)
2. [How to use](#how-to-use-)
   * [Spotify](#spotify-)
     * [Web API](#web-api-)
   * [VLC](#vlc-)
   * [Commands](#commands-)
     * [Shortcuts](#shortcuts-)

## Install [[&uarr;](#table-of-contents)]

Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter:

```bash
ext install vs-media-player
```

Or search for things like `vs-media-player` in your editor:

![Start Spotify OAuth](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/screenshot1.png)

## How to use [[&uarr;](#table-of-contents)]

Open (or create) a `settings.json` file in your `.vscode` subfolder of your workspace or edit your global settings by using `CTRL + ,` shortcut:

Add a `media.player` section and define one or more players:

```json
{
    "media.player": {
        "players": [
            {
                "name": "My Spotify player",
                "type": "spotify",
            },

            {
                "name": "My VLC player",
                "type": "vlc",
            }
        ]
    }
}
```

A player entry supports the following, common properties:

| Name | Description |
| ---- | --------- |
| `buttonPriorityOffset` | A custom offset value for controlling the priority of the buttons in the status bar. Default `10` |
| `connectOnStartup` | Connect on startup or not. Default `(true)` |
| `defaultOutputID` | The ID of the default output device. Default `1` |
| `defaultOutputName` | The name of the default output device. Default `Main device` |
| `description` | A description for the player. |
| `initialOutput` | The name of the output device, which should be selected after extension has been connected to the player. |
| `name` | A (display) name for the player. |
| `showNextButton` | Show button for playing NEXT track in status bar or not. Default `(true)` |
| `showPlayerName` | Show player name in status bar or not. Default `(false)` |
| `showPrevButton` | Show button for playing PREVIOUS track in status bar or not. Default `(true)` |
| `showRight` | Show buttons on the RIGHT side of status bar or not. Default `(false)` |
| `showToggleMuteButton` | Show button for toggle mute state in status bar or not. Default `(true)` |
| `showTogglePlayButton` | Show button for toggle play state in status bar or not. Default `(true)` |
| `showToggleRepeatingButton` | Show button for toggle repeating state in status bar or not. Default `(false)` |
| `showToggleShuffleButton` | Show button for toggle shuffle state in status bar or not. Default `(false)` |
| `showTrackSelectorButton` | Show button for selecting a track in status bar or not. Default `(true)` |
| `showVolumeButtons` | Show buttons to change volume in status bar or not. Default `(false)` |
| `type` | The type. |

### Spotify [[&uarr;](#how-to-use-)]

```json
{
    "media.player": {
        "players": [
            {
                "name": "My Spotify player",
                "type": "spotify"
            }
        ]
    }
}
```

| Feature | Supported by [spotilocal](https://www.npmjs.com/package/spotilocal) | Supported by [Web API](#web-api-) |
| ---- |:--:|:--:|
| Load playlists and/or select a track | &nbsp; | X |
| Mute volume |  | X |
| Mute volume |  | X |
| Pause | X | X |
| Play | X | X |
| Play next track |  | X |
| Play previous track |  | X |
| Toggle repeating | (only state is displayed) | X |
| Toggle shuffle | (only state is displayed) | X |
| Volume down |  | X |
| Volume up |  | X |

To extend the basic features provided by [spotilocal](https://www.npmjs.com/package/spotilocal) module, take a look at the [Web API](#web-api-) section to get to known how to setup the extension for OAuth.

#### Web API [[&uarr;](#spotify-)]

First of all, you have to register an app [here](https://developer.spotify.com/my-applications/#!/applications/create):

<kbd>![Register app in Spotify](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify1.png)</kbd>

After you have added the app, you need to select and edit it (`My Applications` on the upper left side):

<kbd>![Edit registrated app](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify2.png)</kbd>

Define a redirect URI that does really exist and can delegate to the PC, where your VS Code is running. So keep sure, that your firewall will NOT block the TCP port, you have specified in your redirect URI.

What happens is, that, when you start authorizing, your browser is open with a Spotify address, where you are asked, if your account wants to be connected with the app, you have registered:

<kbd>![Spotify OAuth page](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify3.png)</kbd>

The extension will request for the following [scopes / permissions](https://developer.spotify.com/web-api/using-scopes/):

* `playlist-read-collaborative`
* `playlist-read-private`
* `streaming`
* `user-library-read`
* `user-read-playback-state`

At the same time a HTTP server is started from VS Code on your local machine, that will wait for Spotify, which will connect to that server, when you click on `OK`.

Spotify will send an OAuth code to that server, that makes it possible to extend the feature list with the help of [Web API](https://developer.spotify.com/web-api/):

<kbd>![OAuth code received from Spotify](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify4.png)</kbd>

Now copy all app data to your `media.player` settings in VS Code:

```json
{
    "media.player": {
        "players": [
            {
                "name": "My Spotify player",
                "type": "spotify",

                "clientID": "<Client ID>",
                "clientSecret": "<Client Secret>",
                "redirectURL": "<Redirect URI>"
            }
        ]
    }
}
```

An entry supports the following, additional settings:

| Name | Description |
| ---- | --------- |
| `clientID` | The client ID of an own registered Spotify app. |
| `clientSecret` | The client secret of an own registered Spotify app. |
| `redirectURL` | The redirect URL for the authorization. |

To start the authorization process, click on the following, yellow button in your status bar:

<kbd>![Start Spotify OAuth](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify5.png)</kbd>

### VLC [[&uarr;](#how-to-use-)]

To control your local [VLC player](https://www.videolan.org/vlc/), you have to activate [Lua HTTP service](https://wiki.videolan.org/VLC_HTTP_requests/).

First select `Tools >> Preferences` in the main menu:

<kbd>![VLC Setup Step 1](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/vlc1.png)</kbd>

Show all settings and select the node `Interface >> Main interfaces` by activating `Web` in the `Extra interface modules` group:

<kbd>![VLC Setup Step 2](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/vlc2.png)</kbd>

In the sub node `Lua` define a password in the `Lua HTTP`:

<kbd>![VLC Setup Step 3](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/vlc3.png)</kbd>

Now save the settings and restart the application.

By default the HTTP service runs on port 8080.

If you already run a service at that port, you can change it by editing the `vlcrc` file, that contains the configuration. Search for the `http-port` value, change it (and uncomment if needed) for your needs (you also have to restart the player after that).

Look at the [FAQ](https://www.videolan.org/support/faq.html) (search for `Where does VLC store its config file?`) to get information about where `vlcrc` is stored on your system.

Now update your settings in VS Code:

```json
{
    "media.player": {
        "players": [
            {
                "name": "My VLC player",
                "type": "vlc",

                "password": "myPassword",
                "port": 8080
            }
        ]
    }
}
```

In that example, you can open [localhost:8080/requests/status.xml](http://localhost:8080/requests/status.xml) to check your configuration. Use the password from the settings and leave the username field blank.

An entry supports the following, additional settings:

| Name | Description |
| ---- | --------- |
| `host` | The host of the (Lua) HTTP service. Default `localhost` |
| `password` | The password for the (Lua) HTTP service. |
| `port` | The TCP port of the (Lua) HTTP service. Default `8080` |

### Commands [[&uarr;](#how-to-use-)]

Press `F1` to open the list of commands and enter one of the following commands:

| Name | Description | ID | 
| ---- | --------- | --------- | 
| `Media Player: Connect` | Connects to a player. | `extension.mediaPlayer.connect` | 
| `Media Player: Disconnect` | Disconnects from a player. | `extension.mediaPlayer.disconnect` | 
| `Media Player: Execute player action` | Executes a player action | `extension.mediaPlayer.executePlayerAction` | 
| `Media Player: Register app for Spotify` | Opens the web page where a new app can be registrated. | `extension.mediaPlayer.spotify.registerApp` | 
| `Media Player: Select item of playlist` | Selects an item of a playlist. | `extension.mediaPlayer.selectItemOfPlaylist` | 
| `Media Player: Select output` | Selects an output device for a player. | `extension.mediaPlayer.selectPlayerOutput` | 

#### Shortcuts [[&uarr;](#commands-)]

If you want to define shortcuts / hotkeys for one or more of the upper [commands](#commands-), have a look at the VS Code article [Key Bindings for Visual Studio Code](https://code.visualstudio.com/docs/getstarted/keybindings).
