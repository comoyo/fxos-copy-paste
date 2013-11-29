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

let POSITION_HANDLE_TIMING = 100;

XPCOMUtils.defineLazyModuleGetter(this, "Rect",
                                "resource://gre/modules/Geometry.jsm");

function SelectionHandlerGlue() {
   // i dont see to have rights to access this here, lets skip
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
  	selectionGlue(content.document.defaultView, content.document, addEv, removeEv);
  };
  
  // call when we have a content window
  this.attachContentWindow = function(contentWindow) {
  	if (this._contentWindow) {
  		return;
  	}
  	
  	dump('Attach _contentWindow! ' + contentWindow.location + '\n');
  	
  	this._contentWindow = contentWindow;
  	
		var renderQueue = [];
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
		
		/**
		* This code should be in b2g/chrome/content/shell.js
		*/
		contentWindow.addEventListener('mozContentEvent', function(evt) {
			dump('SelectionHandlerGlue has content event "' + evt.detail.type + '"\n');
			var detail = evt.detail;
			dump('Detail info ' + detail.type + ' ' + detail.id + ' ' + JSON.stringify(detail.data) + '\n');

			switch(detail.type) {
				case 'selection':
					dump('mozContentEvent has ID ' + detail.id + ' and module has ' + UUID + '\n');

					if (detail.id !== UUID)
						return;

					renderQueue.push(detail);
					break;
			}
		});
  };
}

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

var sendMessageToJava = function(msg) {
  // sendAsyncMessage("Forms:Selection", {
  //   msg: JSON.stringify(msg),
  //   id: UUID
  // });
	
  let browser = Services.wm.getMostRecentWindow("navigator:browser");
  browser.shell.sendChromeEvent({
    type: "selection",
    msg: JSON.stringify(msg),
    id: UUID
  });
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

    if (!element.disabled &&
        ((element instanceof Ci.nsIDOMHTMLInputElement && element.mozIsTextField(false)) ||
        (element instanceof Ci.nsIDOMHTMLTextAreaElement))) {
      
      glue.attachContentWindow(element.ownerDocument.defaultView);
      
      element.ownerDocument.defaultView.setTimeout(function() {
        SelectionHandler.attachCaret(element);
      }, POSITION_HANDLE_TIMING); // make sure the browser sets selection first
    }
  });
  
  // === Other glueeee

  // Longtap handler
  // (function longtapHandler() {
  //   var eventName = 'longtap';
  //   var timeout = 400;
  //   var touchTimeout; // when did touch start start?
  //   var startX, startY, target;
    
  //   // shit thats important: longtap
  //   addEv(doc.body, 'touchstart', function(e) {
  //     if (e.touches.length > 1) return;
  //     if (e.touches[0].target.ownerDocument !== doc) return;
      
  //     target = e.touches[0].target;
      
  //     // is target contenteditable or an input field we continue
  //     // if (!(target.isContentEditable ||
  //     //     target.designMode == "on" ||
  //     //     target instanceof HTMLInputElement ||
  //     //     target instanceof HTMLTextAreaElement)) {
  //     //   return;
  //     // }
      
  //     touchTimeout = win.setTimeout(function() {
  //       eventbus.emit(eventName, { target: target, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
  //     }, timeout);
  //     startX = e.touches[0].pageX;
  //     startY = e.touches[0].pageY;
  //   });
    
  //   addEv(doc.body, 'touchmove', function(e) {
  //     if (!touchTimeout) return;
      
  //     if (Math.abs(e.touches[0].pageX - startX) > 10 ||
  //         Math.abs(e.touches[0].pageY - startY) > 10 ||
  //         e.touches[0].target !== target) {
  //       win.clearTimeout(touchTimeout);
  //     }
  //   });
    
  //   addEv(doc.body, 'touchend', function() {
  //     win.clearTimeout(touchTimeout);
  //   });
  // })();
  
  // Normal tap handler
  function createTapHandler(onTap) {
    var target;
    var startX, startY;
    var now;

    addEventListener("touchstart", function(e) {
      if (!TAP_ENABLED) return;
      if (e.touches.length > 1) return;
      if (e.touches[0].target.ownerDocument !== content.document) return;
      dump('document info '  + (content.document && content.document.location) + '\n');
      
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

let glue = new SelectionHandlerGlue();
glue.init();
