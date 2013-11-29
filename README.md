fxos-copy-paste
===============

XPCom plugin for Firefox OS to add selections and copy-paste. It has three implementations so far:

* Basic working Copy & Paste based off of https://github.com/KevinGrandon/Firefox-OS-Clipboard. Can run as frame script.
* Start of stand-alone version of Kevins version for selections.
* Android version of SelectionHandler with some glue to make it work in FxOS (very WIP). You'll need the patch from
    https://bugzilla.mozilla.org/show_bug.cgi?id=943795 to make it work in FF Nightly / B2G desktop

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
      // Use intersection of the text rect and the editor rect
      //    textBounds is in x,y from window object while editorBounds is x,y from screen
      //    so we need to normalize this
      let rect = new Rect(textBounds.left + adjustX, textBounds.top + adjustY, textBounds.width, textBounds.height);
      rect.restrictTo(editorRect);
```

and

```js
    // sendMouseEventToWindow fakes a mouse event. The thing is that it only works if there is no chrome
    var adjustX = this._contentWindow.mozInnerScreenX - this._contentWindow.screenX;
    var adjustY = this._contentWindow.mozInnerScreenY - this._contentWindow.screenY;
    if (adjustY === 22) { // b2g desktop @ osx
      adjustY = 0;
    }
    
    aX -= adjustX;
    aY -= adjustY;

    this._domWinUtils.sendMouseEvent("mousedown", aX, aY, 0, 1, useShift ? Ci.nsIDOMNSEvent.SHIFT_MASK : 0, true);
    this._domWinUtils.sendMouseEvent("mouseup", aX, aY, 0, 1, useShift ? Ci.nsIDOMNSEvent.SHIFT_MASK : 0, true);
```

* On y axis we subtract 1 px. Now do it on x as well: `aX = rect.x + rect.width - 1;`