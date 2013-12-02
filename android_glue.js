/*global Components:false, dump:false, XPCOMUtils:false, Services:false,
            content:false SelectionHandler:false */
/*jshint esnext:true, moz:true */

"use strict";

dump("###################################### SelectionHandler_glue.js loaded\n");

let Ci = Components.interfaces;
let Cc = Components.classes;
let Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

let uuidGenerator = Cc["@mozilla.org/uuid-generator;1"]
                      .getService(Components.interfaces.nsIUUIDGenerator);

XPCOMUtils.defineLazyGetter(this, "domWindowUtils", function () {
  return content.QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIDOMWindowUtils);
});

let UUID = uuidGenerator.generateUUID().toString();
let TAP_ENABLED = true;

function debug() {
  dump('==AndroidSelectionHandler: ' +
    [].slice.call(arguments).map(function(a) {
      return JSON.stringify(a, null, 4);
    }).join(' ') + '\n');
}

// So the caret gets moved by clicking somewhere, but there is a delay
// between the moment the touch happens and when platform changes the actual
// caret. Maybe rely on inputcontext for this.
let POSITION_HANDLE_TIMING = 100;

XPCOMUtils.defineLazyModuleGetter(this, "Rect",
                                "resource://gre/modules/Geometry.jsm");

function SelectionHandlerGlue() {
	var self = this;
	
  // I'd like to use the system event listener I guess but it requires
  // something with permissions that I don't have...
  // var els = Cc["@mozilla.org/eventlistenerservice;1"]
  //             .getService(Ci.nsIEventListenerService);
  
  var addEv = function(target, type, handler) {
    target.addEventListener(type, handler, false);
    // Using the system group for mouse/touch events to avoid
    // missing events if .stopPropagation() has been called.
    // els.addSystemEventListener(target, 
    //                           type,
    //                           handler,
    //                           /* useCapture = */ false);
  };
  
  var removeEv = function(target, type, handler) {
    target.removeEventListener(type, handler, false);
    // els.removeSystemEventListener(target, 
    //                           type,
    //                           handler,
    //                           /* useCapture = */ false);
  };
  
  this.init = function() {
		selectionGlue();
  };
  
  /**
   * Holds an instance of the caret handler that manages UI
   */
  this.caretHandler = null;
  
  // We don't want to render everything when it arrives, but rather on
  // requestAnimationFrame, so hold on to that here
  var renderQueue = [];

  // We should only go and do stuff when a real tap happened and we are going
  // to show the carets
  this.attachContentWindow = function(contentWindow) {
		if (this._contentWindow) {
			return;
		}
		
		dump('Attach _contentWindow! ' + contentWindow.location + '\n');
		
		this._contentWindow = contentWindow;
		
		/**
		 * Make sure we only communicate the new position of the caret every tick
		 */
		function renderLoop() {
			var last;
			// Only process the last event, probably its accurate
			if (renderQueue.length > 0) {
				last = renderQueue.pop();
				
				if (SelectionHandler._activeType !== SelectionHandler.TYPE_NONE) {
					TAP_ENABLED = false;
					SelectionHandler.observe(null, last.name, JSON.stringify(last.data));
					TAP_ENABLED = true;
				}
				
				renderQueue = [];
			}

			contentWindow.requestAnimationFrame(function() {
				// on next frame, make sure position is correct
				if (last && last.name === 'TextSelection:Move') {
					if (SelectionHandler._activeType !== SelectionHandler.TYPE_NONE) {
						SelectionHandler._positionHandles();
					}
				}
				// and LOOP!
				renderLoop();
			});
		}
		contentWindow.requestAnimationFrame(renderLoop);
		
		// caretHandler does the UI of the carets
		self.caretHandler = createCaretHandler(contentWindow, contentWindow.document,
			self.receiveContentEvent);
		
		// I dont know how to do this properly
		injectCss(contentWindow.document);
  };
  
  /**
   * Caret handler calls this. It's still called content event because I did
   * this in system first
   */
  this.receiveContentEvent = function(name, data) {
		dump('receiveContentEvent ' + JSON.stringify({ name: name, data: data }) + '\n');

		renderQueue.push({ name: name, data: data });
  };
}

let glue = new SelectionHandlerGlue();
glue.init();

/**
 * SelectionHandler.js requires this, I dont know what it does
 */
var BrowserApp = {
  deck: {
    addEventListener: function(n) {
      debug('BrowserApp.deck.addEventListener', n);
    },
    removeEventListener: function(n) {
      debug('BrowserApp.deck.removeEventListener', n);
    }
  },
  selectedBrowser: {
    get contentWindow() {
    	return glue._contentWindow;
    }
  }
};

/**
 * SelectionHandler calls this if it wants to update the UI state
 */
function sendMessageToJava(msg) {
  glue.caretHandler.onMessageFromJava(msg);
	
  // let browser = Services.wm.getMostRecentWindow("navigator:browser");
  // browser.shell.sendChromeEvent({
  //   type: "selection",
  //   msg: JSON.stringify(msg),
  //   id: UUID
  // });
};

function selectionGlue() {
	// @todo: use Gesture:SingleTap (but doesnt work for now)
  // === Glue between browser & SelectionHandler (in Android this lives in mobile/android/chrome/browser.js ===
  createTapHandler(function(e) {
    var element = e.target;
    // on real device for some reason the div inside the textbox is the target
    if (element.classList.contains('anonymous-div')) {
    	element = element.parentNode; // <div class=\"anonymous-div\"><br></div>'))
    }

    // This is the check from Android but it misses f.e. contenteditable
    // Need to find out how android does that
    if (!element.disabled &&
        ((element instanceof Ci.nsIDOMHTMLInputElement && element.mozIsTextField(false)) ||
        (element instanceof Ci.nsIDOMHTMLTextAreaElement))) {
      
      // We are going to show something, so let's attach the window
      glue.attachContentWindow(element.ownerDocument.defaultView);
      
      element.ownerDocument.defaultView.setTimeout(function() {
        SelectionHandler.attachCaret(element);
      }, POSITION_HANDLE_TIMING); // make sure the browser sets selection first
    }
  });
  
  // Normal tap handler
  function createTapHandler(onTap) {
    var target;
    var startX, startY;
    var now;

    addEventListener("touchstart", function(e) {
      if (!TAP_ENABLED) return;
      if (e.touches.length > 1) return;
      // Need to check the ownerDocument because the event can propagate thru
      if (e.touches[0].target.ownerDocument !== content.document) return;
      
      target = e.touches[0].target;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      now = +new Date;
    }, true, false);
    
    addEventListener("touchend", function(e) {
      if (!TAP_ENABLED) return;
      if (e.changedTouches.length > 1) return;
      if (e.changedTouches[0].target !== target) return;
      
      // 100 ms to tap
      if ((+new Date) > (now + 250))
        return;
      
      onTap({ target: target, clientX: startX, clientY: startY });
      
      now = 0;
    }, true, false);
  }
}

function injectCss(doc) {
	/**
	 * Dont know how to fix this properly
	 */
	var css = '\n\
.caret {\n\
  width: 0;\n\
	height: 0;\n\
	font-size: 0;\n\
	line-height: 0;\n\
  position: absolute;\n\
  z-index: 1000000;\n\
  -moz-user-focus: ignore;\n\
}\n\
\n\
.caret[data-hidden] {\n\
  display: none;\n\
}\n\
\n\
.caret.middle {\n\
	border-left: 25px solid transparent;  /* left arrow slant */\n\
	border-right: 25px solid transparent; /* right arrow slant */\n\
	border-bottom: 50px solid green; /* bottom, add background color here */\n\
	margin-left: -25px; /* in the middle */\n\
}';
	
	var el = doc.createElement('style');
	el.innerHTML = css;
	doc.querySelector('head').appendChild(el);
}

function createCaretHandler(win, doc, sendContentEvent) {
  function debug() {
    dump('System SelectionHandler: ' +
      [].slice.call(arguments).map(function(a) {
        return JSON.stringify(a, null, 4);
      }).join(' ') + '\n');
  }

  // In FF for Android everything is positioned on the screen based on screenX,
  // screenY coordinates. But here we need to have the relative position cause
  // we position in process
  var ADJUST_X, ADJUST_Y;

  function onResize() {
    // So get the innerScreenX to get the correct position
    ADJUST_X = win.mozInnerScreenX - win.screenX;
    ADJUST_Y = win.mozInnerScreenY - win.screenY;
  }
  onResize();
  win.addEventListener('resize', onResize);

  // if (ADJUST_Y === 22) { // B2G desktop on OSX gives QUERY_CARET_RECT back
  // // without window chrome
  //   ADJUST_Y = 0;
  // }
  var LAST_ID;

  /**
   * Handle class, for now its only MIDDLE but we can also make this for
   * LEFT and RIGHT to do selections and copy/paste etc.
   */
  function Handle(handleType) {
    var self = this;

    this._el = null;

    /**
     * Create caret element (should not be done in content window, but yeah)
     * and attach events
     */
    this.init = function() {
      var e = self._el = doc.createElement('div');
      e.classList.add('caret');
      e.classList.add(handleType.toLowerCase());
      doc.body.appendChild(e);
      
      e.addEventListener('touchstart', function(ev) {
        if (ev.touches.length !== 1) return;
        ev.stopPropagation();
      });

      e.addEventListener('touchmove', function(ev) {
        self.onPan(ev);
      });
      e.addEventListener('touchend', function(ev) {
        self.onSwipe(ev);
      });
      self.hide();
    };

    this.show = function() {
    	// hmm is broken for some reason
    	self._el.removeAttribute('data-hidden');
      // debug('show', handleType);
      // delete self._el.dataset.hidden;
    };

    this.hide = function() {
      // debug('hide', handleType);
      self._el.dataset.hidden = true;
    };

    this.setPosition = function(x, y) {
      x -= ADJUST_X;
      y -= ADJUST_Y;

      // debug('setPosition', handleType, x, y);
      self._el.style.left = x + 'px';
      self._el.style.top = y + 'px';
    };

    this.onPan = function(e) {
      if (!e.changedTouches.length) return;

      // When we go back to SelectionHandler make sure to communicate the
      // screen coordinates
      sendContentEvent('TextSelection:Move', {
        handleType: handleType,
        x: e.changedTouches[0].clientX + ADJUST_X,
        y: e.changedTouches[0].clientY + ADJUST_Y
      });
    };

    this.onSwipe = function(e) {
      if (!e.changedTouches.length) return;
      
      sendContentEvent('TextSelection:Move', {
        handleType: handleType,
        x: e.changedTouches[0].clientX + ADJUST_X,
        y: e.changedTouches[0].clientY + ADJUST_Y
      });
    };

    this.init();
  }

  var handles = {
    'MIDDLE': new Handle('MIDDLE')
  };
  
  // Communication layer from Android -> UI
  var onMessageFromJava = function(msg) {
    switch (msg.type) {
      case 'TextSelection:ShowHandles':
        if (!msg.handles) {
          return debug('ShowHandles called without handles');
        }
        msg.handles.forEach(function(n) {
          handles[n].show();
        });
        break;
      case 'TextSelection:HideHandles':
        if (!msg.handles) {
          msg.handles = Object.keys(handles); // hide all
        }
        msg.handles.forEach(function(n) {
          handles[n].hide();
        });
        break;
      case 'TextSelection:PositionHandles':
        if (msg.rtl) {
          debug('!!! Need to implement RTL!');
        }
        msg.positions.forEach(function(pos) {
          var handle = handles[pos.handle];
          if (!handle) return debug('Could not find handle', pos.handle);

          handle.setPosition(pos.left, pos.top);
          pos.hidden ? handle.hide() : handle.show();
        });
        break;
    }
  };

  return {
		onMessageFromJava: onMessageFromJava
  };
}
