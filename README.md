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

#### Web API

### VLC [[&uarr;](#how-to-use-)]
