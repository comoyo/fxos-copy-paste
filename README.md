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