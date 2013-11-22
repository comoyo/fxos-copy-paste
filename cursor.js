/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this file,
  * You can obtain one at http://mozilla.org/MPL/2.0/. */
/*global Components:false, dump:false, XPCOMUtils:false, Services:false,
            content:false */
/*jshint esnext:true, moz:true */

"use strict";

var inXPCom = !(typeof Components === 'undefined' ||
  typeof Components.utils === 'undefined');
 
function debug() {
  // Prefer dump, but also needs to run in browser environment
  if (inXPCom) {
    dump('==SectionHandler debug: ' +
      [].slice.call(arguments).map(function(a) {
        return JSON.stringify(a, null, 4);
      }).join(' ') + '\n');
  }
  else {
    console.log(
      [].slice.call(arguments).map(function(a) {
        return JSON.stringify(a, null, 4);
      }).join(' '));
  }
}

function XPComInit() {
  var Ci = Components.interfaces;
  var Cc = Components.classes;
  var Cu = Components.utils;
  
  Cu.import("resource://gre/modules/Services.jsm");
  Cu.import('resource://gre/modules/XPCOMUtils.jsm');
  
  XPCOMUtils.defineLazyServiceGetter(Services, "fm",
                                     "@mozilla.org/focus-manager;1",
                                     "nsIFocusManager");
  
  XPCOMUtils.defineLazyGetter(this, "domWindowUtils", function () {
    return content.QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.nsIDOMWindowUtils);
  });
   
  debug('File loaded: running in XPCom');

  var CursorHandler = {
    init: function sh_init() {
      debug('Init called', {
        hasContent: typeof content,
        location: content.document.location+''
      });
      
      var els = Cc["@mozilla.org/eventlistenerservice;1"]
                  .getService(Ci.nsIEventListenerService);
      
      var addEv = function(target, type, handler) {
        debug('Registered hadnler for ' + type);
        // Using the system group for mouse/touch events to avoid
        // missing events if .stopPropagation() has been called.
        els.addSystemEventListener(target, 
                                  type,
                                  function() {
                                    debug('Handling event', type);
                                    handler.apply(this, arguments);
                                  },
                                  /* useCapture = */ false);
      };
      
      var removeEv = function(target, type, handler) {
        els.removeSystemEventListener(target, 
                                  type,
                                  handler,
                                  /* useCapture = */ false);
      };
      
      content.document.addEventListener('DOMContentLoaded', function() {
        debug('DOMContentLoaded happened in XPCom');
        var cursor = new Cursor(content.document.defaultView, content.document, addEv, removeEv);
        cursor.init();
      });
    }
  };
  
  CursorHandler.init();
}

function BrowserInit() {
  document.addEventListener('DOMContentLoaded', function() {
    debug('File loaded: running in browser');
    var addEv = function(target, type, handler) {
      target.addEventListener(type, handler);
    };
    
    var removeEv = function(target, type, handler) {
      target.removeEventListener(type, handler);
    };
    
    var cursor = new Cursor(window, document, addEv, removeEv);
    cursor.init();
  });
}

function Cursor(win, doc, addEv, removeEv) {
  var self = this;
  
  this._caret = (function() {
    var c = doc.createElement('div');
    c.classList.add('caret');
    c.hidden = true;
    doc.body.insertBefore(c, doc.body.firstChild);
    return c;
  }());
  
  this._htmlElement = doc.querySelector('html');
  this._caretShouldBeShown = false;
  
  this.init = function() {
    self.longtap(function(el, x, y) {
      var pos = doc.caretPositionFromPoint(x, y);
      el.setSelectionRange(pos.offset, pos.offset);
      el.focus();

      self.draw(el);
    });
  };
  
  /**
   * Draw the cursor
   * @param {HTMLElement} el Current active element
   */
  this.draw = function(el) {
    // We don't handle selections at the moment
    if (el.selectionStart !== el.selectionEnd) {
      return debug('Selections are not supported');
    }
    
    self._caretShouldBeShown = true;
    
    // Remove ourselves on blur
    addEv(el, 'blur', function onBlur() {
      removeEv(el, 'blur', onBlur);
      self.removeCursor();
    });

    var region = self.getCaretRegion(el);
    self.updateCaret(self.getCaretRegionFixed(region));
    
    var lastScrollEvent;
    addEv(win, 'scroll', function(e) {
      // @todo: remove on blur
      lastScrollEvent = e;
      requestAnimationFrame(function() {
        // no need to render older events
        if (e !== lastScrollEvent || !self._caretShouldBeShown) 
          return;
        
        self.updateCaret(self.getCaretRegionFromScrollEvent(region, e));
      });
    });
  };
  
  this.getCaretRegionFromScrollEvent = function(region, e) {
    return {
      startX: region.startX - e.pageX,
      endX: region.endX - e.pageX,
      startY: region.startY - e.pageY,
      endY: region.endY - e.pageY
    };
  };
  
  this.getCaretRegionFixed = function(region) {
    return {
      startX: region.startX - self._htmlElement.scrollLeft,
      endX: region.endX - self._htmlElement.scrollLeft,
      startY: region.startY - self._htmlElement.scrollTop,
      endY: region.endY - self._htmlElement.scrollTop
    };
  };

  this.updateCaret = function(region) {
    requestAnimationFrame(function() {
      if (!self._caretShouldBeShown) {
        return;
      }

      self._caret.style.transform = 'translate(' + region.startX + 'px, ' + region.startY + 'px)';
      self._caret.style.width = (region.endX - region.startX) + 'px';
      self._caret.style.height = (region.endY - region.startY) + 'px';
      self._caret.hidden = false;
    });
  };

  this.removeCursor = function() {
    self._caretShouldBeShown = false;
    self._caret.hidden = true;
  };
  
  /**
   * Longtap fill, as there is nothing in platform to facilitate this yet
   */
  this.longtap = function(callback) {
    var touchTimeout; // when did touch start start?
    var startX, startY, target;
    
    // shit thats important: longtap
    addEv(doc.body, 'touchstart', function(e) {
      if (e.touches.length > 1) return;
      
      target = e.touches[0].target;
      
      // is target contenteditable or an input field we continue
      if (!(target.isContentEditable ||
          target.designMode == "on" ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement)) {
        return;
      }
      
      touchTimeout = setTimeout(function() {
        callback(target, e.touches[0].clientX, e.touches[0].clientY);
      }, 400);
      startX = e.touches[0].pageX;
      startY = e.touches[0].pageY;
    });
    
    addEv(doc.body, 'touchmove', function(e) {
      if (!touchTimeout) return;
      
      if (Math.abs(e.touches[0].pageX - startX) > 10 ||
          Math.abs(e.touches[0].pageY - startY) > 10 ||
          e.touches[0].target !== target) {
        clearTimeout(touchTimeout);
      }
    });
    
    addEv(doc.body, 'touchend', function() {
      clearTimeout(touchTimeout);
    });
  };
  
  /**
   * Gets the region in pixels where the caret is shown
   * @param {HTMLElement} el The element that has focus
   * @returns Object Object containing startX, endX, startY, endY in pixels
   *                  offsetted to the document body element.
   */
  this.getCaretRegion = function(el, method) {
    var container = doc.body;
    
    method = method || 'getBoundingClientRect';

    var input = el;
    var offset = getInputOffset(),
        topPos = offset.top,
        leftPos = offset.left,
        width = getInputCSS('width', true),
        height = getInputCSS('height', true);

        // Styles to simulate a node in an input field
    var cssDefaultStyles = 'white-space:pre; padding:0; margin:0;';
    var listOfModifiers = ['direction', 'font-family', 'font-size',
        'font-size-adjust', 'font-variant', 'font-weight', 'font-style',
        'letter-spacing', 'line-height', 'text-align', 'text-indent',
        'text-transform', 'word-wrap', 'word-spacing'];

    topPos += getInputCSS('padding-top', true);
    topPos += getInputCSS('border-top-width', true);
    leftPos += getInputCSS('padding-left', true);
    leftPos += getInputCSS('border-left-width', true);
    leftPos += 1; //Seems to be necessary

    for (var i = 0; i < listOfModifiers.length; i++) {
        var property = listOfModifiers[i];
        cssDefaultStyles += property + ':' + getInputCSS(property) + ';';
    }
    // End of CSS variable checks

    var text = el.value,
        textLen = text.length,
        fakeClone = doc.createElement('div');

    if (el.selectionStart > 0)
      appendPart(0, el.selectionStart);

    var fakeRange = appendPart(
      el.selectionStart,
      el.selectionEnd
    );

    if (textLen > el.selectionEnd)
      appendPart(el.selectionEnd, textLen);

    // Styles to inherit the font styles of the element
    fakeClone.style.cssText = cssDefaultStyles;

    // Styles to position the text node at the desired position
    fakeClone.style.position = 'absolute';
    fakeClone.style.top = topPos + 'px';
    fakeClone.style.left = leftPos + 'px';
    fakeClone.style.width = width + 'px';
    fakeClone.style.height = height + 'px';
    fakeClone.style.backgroundColor = '#FF0000';
    container.appendChild(fakeClone);
    var returnValue = fakeRange[method]();

    fakeClone.parentNode.removeChild(fakeClone); // Comment this to debug

    function appendPart(start, end) {
      var span = doc.createElement('span');
      //Force styles to prevent unexpected results
      span.style.cssText = cssDefaultStyles;
      span.textContent = text.substring(start, end);
      fakeClone.appendChild(span);
      return span;
    }

    // Computing offset position
    function getInputOffset() {
      var body = container,
          win = doc.defaultView,
          docElem = doc.documentElement,
          box = doc.createElement('div');
      box.style.paddingLeft = box.style.width = '1px';
      body.appendChild(box);
      var isBoxModel = box.offsetWidth == 2;
      body.removeChild(box);
      box = input.getBoundingClientRect();
      var clientTop = docElem.clientTop || body.clientTop || 0,

          clientLeft = docElem.clientLeft || body.clientLeft || 0,

          scrollTop = win.pageYOffset || isBoxModel &&
            docElem.scrollTop || body.scrollTop,

          scrollLeft = win.pageXOffset || isBoxModel &&
            docElem.scrollLeft || body.scrollLeft;

      return {
          top: box.top + scrollTop - clientTop,
          left: box.left + scrollLeft - clientLeft};
    }

    function getInputCSS(prop, isnumber) {
      var val = doc.defaultView
        .getComputedStyle(input, null).getPropertyValue(prop);

      return isnumber ? parseFloat(val) : val;
    }

    return {
      startY: returnValue.top + win.pageYOffset | 0,
      endY: returnValue.bottom + win.pageYOffset | 0,
      startX: returnValue.left + win.pageXOffset | 0,
      endX: returnValue.right + win.pageXOffset | 0
    };
  };
}

if (inXPCom) {
  XPComInit();
}
else {
  BrowserInit();
}
