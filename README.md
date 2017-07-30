# vs-media-player

[![Latest Release](https://vsmarketplacebadge.apphb.com/version-short/mkloubert.vs-media-player.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vs-media-player)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/mkloubert.vs-media-player.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vs-media-player)
[![Rating](https://vsmarketplacebadge.apphb.com/rating-short/mkloubert.vs-media-player.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vs-media-player#review-details)

[Visual Studio Code](https://code.visualstudio.com/) (VSCode) extension to control media players like [Spotify](https://developer.spotify.com/) or [VLC](https://www.videolan.org/vlc/) directly from the editor.

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=ZJ4HXH733Y9S8) [![](https://api.flattr.com/button/flattr-badge-large.png)](https://flattr.com/submit/auto?fid=o62pkd&url=https%3A%2F%2Fgithub.com%2Fmkloubert%2Fvs-media-player)

## Table of contents

1. [Install](#install-)
2. [How to use](#how-to-use-)
   * [Spotify](#spotify-)
     * [Web API](#web-api-)
   * [VLC](#vlc-)

## Install [[&uarr;](#table-of-contents)]

Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter:

```bash
ext install vs-media-player
```

## How to use [[&uarr;](#table-of-contents)]

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
| ---- | --------- | --------- |
| Load playlists | &nbsp; | X |
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

To extend the basic features provided by [spotilocal](https://www.npmjs.com/package/spotilocal) module, take a look at the [Web API](#web-api-) second to get to known how to setup client for OAuth.

#### Web API [[&uarr;](#spotify-)]

First of all, you have to register an app [here](https://developer.spotify.com/my-applications/#!/applications/create):

![Register app in Spotify](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify1.png)

After you have added the app, you need to select and edit it (`My Application` on the upper left side):

![Edit registrated app](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify2.png)

Define a redirect URI that does really exist and can delegate to the PC, where your VS Code is running. So keep sure, that your firewall will NOT block the TCP port, you have specified in your redirect URI.

What happens is, that, when you start authorizing, your browser is open with a Spotify address, where you are asked, if your account wants to be connected with the app, you have registered:

![Spotify OAuth page](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify3.png)

The extension will request for the following [scopes / permissions](https://developer.spotify.com/web-api/using-scopes/):

* `playlist-read-collaborative`
* `playlist-read-private`
* `streaming`
* `user-library-read`
* `user-read-playback-state`

At the same time a HTTP server is started, which will wait for Spotify, which will connects to that server, when you click on `OK`.

Spotify will send an OAuth code to that server, that makes it possible to extend the feature list with the help of [Web API](https://developer.spotify.com/web-api/):

![OAuth code received from Spotify](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify4.png)

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

To start the authorization process, click on the following, yellow button in your status bar:

![Start Spotify OAuth](https://raw.githubusercontent.com/mkloubert/vs-media-player/master/img/spotify5.png)

### VLC [[&uarr;](#how-to-use-)]

```json
{
    "media.player": {
        "players": [
            {
                "name": "My VLC player",
                "type": "vlc"
            }
        ]
    }
}
```
