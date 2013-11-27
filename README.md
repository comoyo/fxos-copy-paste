fxos-copy-paste
===============

XPCom plugin for Firefox OS to add selections and copy-paste. It has three implementations so far:

* Basic working Copy & Paste based off of https://github.com/KevinGrandon/Firefox-OS-Clipboard. Can run as frame script.
* Start of stand-alone version of Kevins version for selections.
* Android version of SelectionHandler with some glue to make it work in FxOS (very WIP).

## How to run basic working Copy & Paste in FxOS

Currently only runs in FF Nightly.

Symlink `selection.js` and `selection.css` to gaia/tools/extensions/browser-helper@gaiamobile.org/content/

Apply the changes in `bootstrap.js` from https://github.com/comoyo/gaia/compare/copypaste?expand=1

Make normal `DEBUG=1` build.

### How to run stand-alone

Open index.html

## Changes I made in android.js

* Replace all `window.devicePixelRatio` by `this._contentWindow.devicePixelRatio`.
* Line 413: Replace document: `let range = this._contentWindow.document.createRange();`
* Before sending the mouse events in _sendMouseEvent:

```js
    // sendMouseEventToWindow fakes a mouse event. The thing is that it only works if there is no chrome
    var adjustX = this._contentWindow.mozInnerScreenX - this._contentWindow.screenX;
    var adjustY = this._contentWindow.mozInnerScreenY - this._contentWindow.screenY;
    if (adjustY === 22) { // b2g desktop @ osx
      adjustY = 0;
    }
    
    aX -= adjustX - 2; // todo: find out what works :p
    aY -= adjustY - 2;

    this._domWinUtils.sendMouseEvent("mousedown", aX, aY, 0, 1, useShift ? Ci.nsIDOMNSEvent.SHIFT_MASK : 0, true);
    this._domWinUtils.sendMouseEvent("mouseup", aX, aY, 0, 1, useShift ? Ci.nsIDOMNSEvent.SHIFT_MASK : 0, true);
```