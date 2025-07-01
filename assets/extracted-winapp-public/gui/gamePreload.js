"use strict";

const { ipcRenderer, contextBridge } = require("electron");

const sendWhitelist = new Set()
  .add("initialized")
  .add("printImage")
  .add("reloadGame")
  .add("reportError")
  .add("signupCompleted");

const receiveWhitelist = new Set()
  .add("flashVarsReady")
  .add("removed");

  // allow renderer process to safely communicate with main process
contextBridge.exposeInMainWorld(
  "ipc", {
    sendToHost: (channel, ...args) => {
      if (sendWhitelist.has(channel)) {
        ipcRenderer.sendToHost(channel, ...args);
      }
    },
    on: (channel, listener) => {
      if (receiveWhitelist.has(channel)) {
        ipcRenderer.on(channel, listener);
      }
    }
  }
);

ipcRenderer.on("redirect-url", (event, url) => {
});

// YouTube Theater Integration - Inject into webview context
// This ensures Flash can call our functions directly

// CRITICAL: Define global functions FIRST so Flash can call them immediately

// ULTRA-VISIBLE: Confirm script is loading (removed alert for cleaner testing)

// CRITICAL FIX: Electron webview preload scripts run in isolated context
// Flash ExternalInterface.call() needs functions in the main window context
// We need to inject our functions into the main window via executeJavaScript

// ERROR CATCHING: Catch any silent errors
window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('ytTheater')) {
  }
});

// ADDITIONAL: Listen for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.toString().includes('ytTheater')) {
  }
});

// MONITOR: Add periodic function availability check
setInterval(() => {
  if (typeof window.ytTheaterLoadVideo === 'function') {
  } else {
  }
}, 5000);

// Expose YouTube control functions globally for Flash ExternalInterface.call()
window.ytTheaterLoadVideo = function(videoId) {
  
  if (window.ytTheater) {
    window.ytTheater.loadVideo(videoId);
  } else if (window.ytTheaterInstance) {
    window.ytTheaterInstance.loadVideo(videoId);
  } else {
    // Try to create an instance
    if (typeof window.initYouTubeTheater === 'function') {
      window.initYouTubeTheater();
      if (window.ytTheater) {
        window.ytTheater.loadVideo(videoId);
      }
    }
  }
};

window.ytTheaterPlayVideo = function() {
  if (window.ytTheater) {
    window.ytTheater.playVideo();
  } else {
  }
};

window.ytTheaterPauseVideo = function() {
  if (window.ytTheater) {
    window.ytTheater.pauseVideo();
  } else {
  }
};

window.ytTheaterStopVideo = function() {
  if (window.ytTheater) {
    window.ytTheater.stopVideo();
  } else {
  }
};

window.ytTheaterSeekTo = function(time) {
  if (window.ytTheater) {
    window.ytTheater.seekTo(time);
  } else {
  }
};

      window.ytTheaterDestroy = function() {
        if (window.ytTheater) {
          window.ytTheater.destroy();
        } else {
        }
      };
      
      // REAL-TIME POSITION TRACKING: Function to receive position updates from Flash
      window.updateYouTubeIframePosition = function(stageX, stageY, width, height, scaleX, scaleY) {
        var iframe = document.getElementById('yt-theater-screen-fixed');
        if (iframe) {
          try {
            // Find Flash element for coordinate conversion
            var flashElement = document.querySelector('object, embed') || document.body;
            var flashRect = flashElement.getBoundingClientRect();
            
            // Get Flash stage dimensions (these should match what Flash reports)
            var stageWidth = 900;  // Standard Animal Jam stage width
            var stageHeight = 550; // Standard Animal Jam stage height
            
            // Convert Flash stage coordinates to browser coordinates
            // Note: Flash is now sending adjusted coordinates (moved up + smaller)
            var relativeX = stageX / stageWidth;
            var relativeY = stageY / stageHeight; 
            var relativeW = (width * scaleX) / stageWidth;
            var relativeH = (height * scaleY) / stageHeight;
            
            var browserX = flashRect.left + (flashRect.width * relativeX);
            var browserY = flashRect.top + (flashRect.height * relativeY);
            var browserW = flashRect.width * relativeW;
            var browserH = flashRect.height * relativeH;
            
            // Update iframe position smoothly
            iframe.style.left = browserX + 'px';
            iframe.style.top = browserY + 'px';
            iframe.style.width = browserW + 'px';
            iframe.style.height = browserH + 'px';
            
            // Log position updates for debugging the adjustments
          } catch (error) {
          }
        }
      };

// SIMPLE TEST FUNCTION: Basic communication test
window.ytTheaterTest = function(message) {
  return 'SUCCESS: Test function received: ' + message;
};

// CONSOLE TEST: Make our function easily testable

// CRITICAL: Inject functions into main window context for Flash ExternalInterface
// Preload scripts run in isolated context, but Flash needs main window access
function injectIntoMainWindow() {
  try {
    
    // Create script to inject our functions into main window
    const script = document.createElement('script');
    script.textContent = `
      // YouTube Theater functions for Flash ExternalInterface.call()
      
      window.ytTheaterTest = function(message) {
        return 'SUCCESS: Main window received: ' + message;
      };
      
      window.ytTheaterLoadVideo = function(videoId) {
        
        // Simple message passing like the other working functions
        window.postMessage({
          type: 'ytTheaterLoadVideo',
          videoId: videoId
        }, '*');
        
        return 'Main window function called successfully';
      };
      
      window.ytTheaterPlayVideo = function() {
        window.postMessage({ type: 'ytTheaterPlayVideo' }, '*');
        return 'Play command sent';
      };
      
      window.ytTheaterPauseVideo = function() {
        window.postMessage({ type: 'ytTheaterPauseVideo' }, '*');
        return 'Pause command sent';
      };
      
      window.ytTheaterStopVideo = function() {
        window.postMessage({ type: 'ytTheaterStopVideo' }, '*');
        return 'Stop command sent';
      };
      
      window.ytTheaterSeekTo = function(time) {
        window.postMessage({ type: 'ytTheaterSeekTo', time: time }, '*');
        return 'Seek command sent';
      };
      
      window.ytTheaterDestroy = function() {
        window.postMessage({ type: 'ytTheaterDestroy' }, '*');
        return 'Destroy command sent';
      };
      
      // IN-GAME THEATER INTEGRATION FUNCTIONS
      window.checkYouTubeTheaterActive = function() {
        window.postMessage({ type: 'checkYouTubeTheaterActive' }, '*');
        
        // CRITICAL FIX: Check Flash popup data via ExternalInterface
        try {
          
          // First try to check if Flash popup has active data
          const hasFlashActiveVideos = window.checkFlashYouTubeTheaterActive && window.checkFlashYouTubeTheaterActive();
          if (hasFlashActiveVideos) {
            return true;
          }
          
          // Also check Flash via global GuiManager if available
          if (typeof window.gMainFrame !== 'undefined' && window.gMainFrame && window.gMainFrame.guiManager) {
            try {
              const isFlashPopupOpen = window.gMainFrame.guiManager.isYouTubeTheaterPopupOpen && window.gMainFrame.guiManager.isYouTubeTheaterPopupOpen();
              if (isFlashPopupOpen) {
                return true;
              }
            } catch (e) {
            }
          }
        } catch (e) {
        }
        
        // Enhanced: Check localStorage for recent YouTube Theater activity
        try {
          const savedData = localStorage.getItem('youtubeTheaterData');
          if (savedData) {
            const data = JSON.parse(savedData);
            
            // Check if data is recent (within last 10 minutes) and has videos
            const isRecent = data.lastSaved && (Date.now() - data.lastSaved) < (10 * 60 * 1000);
            const hasActiveVideos = data.videoQueue && data.videoQueue.length > 0;
            
            
            // If we have recent saved data with videos, assume YouTube Theater should be active
            if (isRecent && hasActiveVideos) {
              return true;
            }
          }
        } catch (e) {
        }
        return false;
      };
      
      window.initYouTubeTheaterForInGameScreen = function() {
        window.postMessage({ type: 'initYouTubeTheaterForInGameScreen' }, '*');
        
        // CRITICAL: Sync Flash popup data to in-game theater
        try {
          
          // Try to get current video from Flash popup
          if (typeof window.getFlashYouTubeTheaterCurrentVideo === 'function') {
            const flashVideoData = window.getFlashYouTubeTheaterCurrentVideo();
            if (flashVideoData) {
              
              // Store in localStorage for in-game theater to use
              localStorage.setItem('youtubeTheaterData', JSON.stringify({
                videoQueue: [flashVideoData],
                currentVideoIndex: 0,
                isPlaying: true,
                lastSaved: Date.now(),
                source: 'flash-popup'
              }));
              
            }
          }
        } catch (e) {
        }
        
        return 'In-game theater setup initiated';
      };
      
      // RETROACTIVE IN-GAME THEATER TRIGGER
      window.triggerRetroactiveInGameTheater = function() {
        
        try {
          // Check if we have a YouTube Theater instance to set up in-game mode
          if (window.ytTheater && typeof window.ytTheater.setupInGameTheater === 'function') {
            window.ytTheater.setupInGameTheater();
          } else {
            // Create instance if needed
            if (typeof window.initYouTubeTheater === 'function') {
              window.initYouTubeTheater();
              
              // Wait a moment then try to set up in-game theater
              setTimeout(() => {
                if (window.ytTheater && typeof window.ytTheater.setupInGameTheater === 'function') {
                  window.ytTheater.setupInGameTheater();
                } else {
                }
              }, 500);
            }
          }
          
          // Also trigger the standard in-game theater setup
          window.postMessage({ type: 'initYouTubeTheaterForInGameScreen' }, '*');
          
          return 'Retroactive in-game theater triggered successfully';
        } catch (e) {
          return 'Error: ' + e.message;
        }
      };
      
      // NEW: Bridge function to get Flash popup status
      window.checkFlashYouTubeTheaterActive = function() {
        try {
          // Check if Flash popup is open and has videos
          if (typeof window.gMainFrame !== 'undefined' && window.gMainFrame && window.gMainFrame.guiManager) {
            
            // First check if popup is open
            const isOpen = window.gMainFrame.guiManager.isYouTubeTheaterPopupOpen && window.gMainFrame.guiManager.isYouTubeTheaterPopupOpen();
            
            if (isOpen) {
              // Check if the popup has active videos
              try {
                const theaterStatus = window.gMainFrame.guiManager.getYouTubeTheaterStatus();
                
                if (theaterStatus && theaterStatus.hasVideos) {
                  return true;
                }
              } catch (e) {
                return true; // If popup is open, assume it's active
              }
            }
            
            return isOpen;
          }
        } catch (e) {
        }
        return false;
      };
      
      // NEW: Bridge function to get current video from Flash popup
      window.getFlashYouTubeTheaterCurrentVideo = function() {
        try {
          
          // Call the Flash GuiManager bridge function
          if (typeof window.gMainFrame !== 'undefined' && window.gMainFrame && window.gMainFrame.guiManager) {
            const currentVideoData = window.gMainFrame.guiManager.getYouTubeTheaterCurrentVideo();
            return currentVideoData;
          } else {
          }
          return null;
        } catch (e) {
        }
        return null;
      };
      
      // REAL-TIME POSITION TRACKING: Function for Flash to call
      window.updateYouTubeIframePosition = function(stageX, stageY, width, height, scaleX, scaleY) {
        // Flash is now sending adjusted coordinates (moved up + smaller size)
        
        var iframe = document.getElementById('yt-theater-screen-fixed');
        if (iframe) {
          try {
            // Find Flash element for coordinate conversion
            var flashElement = document.querySelector('object, embed') || document.body;
            var flashRect = flashElement.getBoundingClientRect();
            
            // Get Flash stage dimensions
            var stageWidth = 900;
            var stageHeight = 550;
            
            // Convert Flash stage coordinates to browser coordinates
            // Note: stageX, stageY, width, height are already adjusted by Flash
            var relativeX = stageX / stageWidth;
            var relativeY = stageY / stageHeight; 
            var relativeW = (width * (scaleX || 1)) / stageWidth;
            var relativeH = (height * (scaleY || 1)) / stageHeight;
            
            var browserX = flashRect.left + (flashRect.width * relativeX);
            var browserY = flashRect.top + (flashRect.height * relativeY);
            var browserW = flashRect.width * relativeW;
            var browserH = flashRect.height * relativeH;
            
            // Update iframe position
            iframe.style.left = browserX + 'px';
            iframe.style.top = browserY + 'px';
            iframe.style.width = browserW + 'px';
            iframe.style.height = browserH + 'px';
            
          } catch (error) {
          }
        } else {
        }
        
        return 'Position updated successfully';
      };
      
      // MOVIEMANAGER INTEGRATION FUNCTIONS - For true in-theater placement
      window.createTheaterIntegratedIframe = function(videoId, x, y, width, height) {
        
                 // Remove any existing YouTube Theater iframes
         var existingIframes = document.querySelectorAll('[id*="youtube"], [src*="youtube.com/embed"]');
         for (var i = 0; i < existingIframes.length; i++) {
           if (existingIframes[i].remove) {
             existingIframes[i].remove();
           } else if (existingIframes[i].parentNode) {
             existingIframes[i].parentNode.removeChild(existingIframes[i]);
           }
         }
        
                 // CRITICAL FIX: Find Flash object/embed and position iframe relative to it
         var flashElement = document.querySelector('object[type="application/x-shockwave-flash"], embed[type="application/x-shockwave-flash"]') ||
                            document.querySelector('object, embed');
         
         if (!flashElement) {
           return false;
         }
         
         // Get Flash element's position and size
         var flashRect = flashElement.getBoundingClientRect();
         
         // PROPER COORDINATE CONVERSION: 
         // x, y, width, height are Flash stage coordinates from ActionScript
         // We need to convert them to browser coordinates
         
         // These should be percentages of the Flash stage size
         var flashStageWidth = 900;  // Standard Flash stage width
         var flashStageHeight = 550; // Standard Flash stage height
         
         // Convert Flash coordinates to browser coordinates
         var relativeX = x / flashStageWidth;
         var relativeY = y / flashStageHeight; 
         var relativeW = width / flashStageWidth;
         var relativeH = height / flashStageHeight;
         
         var browserX = flashRect.left + (flashRect.width * relativeX);
         var browserY = flashRect.top + (flashRect.height * relativeY);
         var browserW = flashRect.width * relativeW;
         var browserH = flashRect.height * relativeH;
        
        
        // Create iframe positioned exactly where the Flash theater screen is
        var iframe = document.createElement('iframe');
        iframe.id = 'youtube-theater-integrated';
        iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&controls=1&rel=0&modestbranding=1&fs=1&enablejsapi=1';
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; encrypted-media';
        
        // FIXED POSITIONING: Position iframe to match Flash theater screen exactly
        iframe.style.cssText = 
          'position: fixed;' +
          'left: ' + browserX + 'px;' +
          'top: ' + browserY + 'px;' +
          'width: ' + browserW + 'px;' +
          'height: ' + browserH + 'px;' +
          'z-index: 1000;' +
          'border: 2px solid #FFD700;' +
          'border-radius: 8px;' +
          'background: #000;' +
          'box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);' +
          'display: block;' +
          'visibility: visible;' +
          'pointer-events: auto;';
        
        // Add to document body (not Flash container, since it needs to overlay exactly)
        document.body.appendChild(iframe);
        
        
        // Add window resize handler to maintain positioning
        var repositionIframe = function() {
          var newFlashRect = flashElement.getBoundingClientRect();
          var newBrowserX = newFlashRect.left + (newFlashRect.width * relativeX);
          var newBrowserY = newFlashRect.top + (newFlashRect.height * relativeY);
          var newBrowserW = newFlashRect.width * relativeW;
          var newBrowserH = newFlashRect.height * relativeH;
          
          iframe.style.left = newBrowserX + 'px';
          iframe.style.top = newBrowserY + 'px';
          iframe.style.width = newBrowserW + 'px';
          iframe.style.height = newBrowserH + 'px';
        };
        
        window.addEventListener('resize', repositionIframe);
        
        // Store cleanup function
        iframe._cleanup = function() {
          window.removeEventListener('resize', repositionIframe);
        };
        
        return true;
      };
      
      window.removeTheaterIntegratedIframe = function() {
        var iframe = document.getElementById('youtube-theater-integrated');
        if (iframe) {
          if (iframe.remove) {
            iframe.remove();
          } else if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
          return true;
        }
        return false;
      };
      
      // Override any existing iframe creation functions
       var originalCreateElement = document.createElement;
       document.createElement = function(tagName) {
         var element = originalCreateElement.call(document, tagName);
         
         if (tagName.toLowerCase() === 'iframe') {
           
           // Monitor for src changes to detect YouTube iframes
           var originalSetAttribute = element.setAttribute;
           element.setAttribute = function(name, value) {
             originalSetAttribute.call(this, name, value);
             
             if (name === 'src' && value && value.includes('youtube.com/embed')) {
               
               // Schedule repositioning after iframe is added to DOM
               var self = this;
               setTimeout(function() {
                 var flashContainer = findFlashContainer();
                 if (flashContainer && self.parentNode && self.parentNode !== flashContainer) {
                   
                   // Store original positioning
                   var originalStyle = self.style.cssText;
                   
                   // Move to Flash container
                   flashContainer.appendChild(self);
                   
                   // Convert to absolute positioning within Flash container
                   self.style.position = 'absolute';
                   self.style.zIndex = '1000';
                   
                 }
               }, 500);
             }
           };
           
           // Also monitor src property changes
           Object.defineProperty(element, 'src', {
             set: function(value) {
               this.setAttribute('src', value);
             },
             get: function() {
               return this.getAttribute('src');
             }
           });
         }
         
         return element;
       };
      
      // Helper function to find Flash container (duplicate needed in main window context)
      function findFlashContainer() {
        // Try embed tags
        var embeds = document.querySelectorAll('embed[src*=".swf"]');
        if (embeds.length > 0) {
          return embeds[0].parentNode || embeds[0];
        }
        
        // Try object tags
        var objects = document.querySelectorAll('object[data*=".swf"]');
        if (objects.length > 0) {
          return objects[0].parentNode || objects[0];
        }
        
        // Try common IDs
        var commonIds = ['flash-content', 'flash-container', 'game-container'];
        for (var i = 0; i < commonIds.length; i++) {
          var element = document.getElementById(commonIds[i]);
          if (element) return element;
        }
        
        return null;
      }
      
      // CRITICAL: Create the exact function that MovieManager is calling
      // Based on logs, it's calling a function that creates iframes with specific positioning
      window.createYouTubeTheaterIframe = function(videoId, x, y, width, height) {
        
        // Find Flash container
        var flashContainer = findFlashContainer();
        
        // Remove existing YouTube iframes
        var existingIframes = document.querySelectorAll('[src*="youtube.com/embed"]');
        for (var i = 0; i < existingIframes.length; i++) {
          if (existingIframes[i].remove) {
            existingIframes[i].remove();
          } else if (existingIframes[i].parentNode) {
            existingIframes[i].parentNode.removeChild(existingIframes[i]);
          }
        }
        
        // Create new iframe
        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&controls=1&rel=0&modestbranding=1&fs=1';
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        
        if (flashContainer) {
          
          // Position INSIDE Flash container using absolute positioning
          iframe.style.cssText = 
            'position: absolute;' +
            'left: ' + x + 'px;' +
            'top: ' + y + 'px;' +
            'width: ' + width + 'px;' +
            'height: ' + height + 'px;' +
            'z-index: 1000;' +
            'background: #000;' +
            'border: 2px solid #FFD700;' +
            'border-radius: 4px;';
          
          // CRITICAL: Append to Flash container for true integration
          flashContainer.appendChild(iframe);
          
        } else {
          
          // Fallback to document body but still try to position correctly
          iframe.style.cssText = 
            'position: fixed;' +
            'left: ' + x + 'px;' +
            'top: ' + y + 'px;' +
            'width: ' + width + 'px;' +
            'height: ' + height + 'px;' +
            'z-index: 999;' +
            'background: #000;' +
            'border: 2px solid #FFD700;' +
            'border-radius: 4px;';
          
          document.body.appendChild(iframe);
          
        }
        
        
        return true;
      };
      
      // Also override any generic iframe creation function
      window.setupIframe = window.createYouTubeTheaterIframe;
      window.createIframe = window.createYouTubeTheaterIframe;
      window.setupYouTubeIframe = window.createYouTubeTheaterIframe;
      
    `;
    
    // Inject immediately when DOM is available
    if (document.head) {
      document.head.appendChild(script);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild(script);
      });
    }
    
  } catch (error) {
  }
}

// Listen for messages from main window context
window.addEventListener('message', (event) => {
  if (event.data && event.data.type && event.data.type.startsWith('ytTheater')) {
    
    // Ensure we have a YouTube Theater instance
    if (!window.ytTheater) {
      if (typeof window.initYouTubeTheater === 'function') {
        window.initYouTubeTheater();
      }
      
      // If still no instance, queue the command
      if (!window.ytTheater) {
        return;
      }
    }
    
    // Route commands to our YouTube Theater instance
    switch (event.data.type) {
      case 'ytTheaterLoadVideo':
        window.ytTheater.loadVideo(event.data.videoId);
        break;
      case 'ytTheaterPlayVideo':
        window.ytTheater.playVideo();
        break;
      case 'ytTheaterPauseVideo':
        window.ytTheater.pauseVideo();
        break;
      case 'ytTheaterStopVideo':
        window.ytTheater.stopVideo();
        break;
      case 'ytTheaterSeekTo':
        window.ytTheater.seekTo(event.data.time);
        break;
      case 'ytTheaterDestroy':
        window.ytTheater.destroy();
        break;
      case 'checkYouTubeTheaterActive':
        // Enhanced: Check both localStorage and try to bridge with Flash
        const hasActiveVideos = window.ytTheater && window.ytTheater.hasActiveVideos();
        break;
      case 'initYouTubeTheaterForInGameScreen':
        if (window.ytTheater) {
          window.ytTheater.setupInGameTheater();
        } else {
          window.initYouTubeTheater();
          if (window.ytTheater) {
            window.ytTheater.setupInGameTheater();
          }
        }
        break;
      case 'setupInGameTheater':
        if (window.ytTheater) {
          window.ytTheater.setupInGameTheater();
        }
        break;
      default:
    }
  }
});

// Inject functions immediately
injectIntoMainWindow();

// Flash callback functions that Flash will call via ExternalInterface.addCallback
window.onYouTubePlayerReady = function(data) {
};

window.onYouTubeStateChange = function(state) {
};

window.onYouTubeError = function(error) {
};

window.onYouTubeTimeUpdate = function(time) {
};

// MULTIPLE EXPOSURE: Ensure functions are available in all possible ways
if (typeof window !== 'undefined') {
  // Direct window assignment (already done above)
}

if (typeof global !== 'undefined') {
  // Node.js global (probably not needed but just in case)
  global.ytTheaterLoadVideo = window.ytTheaterLoadVideo;
}

// Try to make functions available on document as well (some Flash implementations check here)
if (typeof document !== 'undefined') {
  document.ytTheaterLoadVideo = window.ytTheaterLoadVideo;
}

// CATCHALL: Log any attempts to access undefined functions
const originalGetProperty = Object.getOwnPropertyDescriptor;
if (originalGetProperty) {
  try {
    // This will help us catch if Flash is looking for functions in the wrong place
    const windowProxy = new Proxy(window, {
      get(target, prop) {
        if (typeof prop === 'string' && prop.includes('ytTheater')) {
        }
        return target[prop];
      }
    });
  } catch (e) {
  }
}

// TEST: Immediately verify our functions are accessible

// TEST: Try calling one of our functions to make sure it works
try {
  window.ytTheaterLoadVideo('test123');
} catch (error) {
}

// Global function to initialize YouTube Theater
window.initYouTubeTheater = function() {
  
  if (!window.ytTheaterInstance) {
    try {
      if (typeof window.YouTubeTheater === 'function') {
        window.ytTheaterInstance = new window.YouTubeTheater();
        
        // Make sure ytTheater is available globally for Flash
        window.ytTheater = window.ytTheaterInstance;
        
        // BRIDGE: Also try to expose to main window context
        try {
          // Inject the instance into main window for direct access
          const bridgeScript = document.createElement('script');
          bridgeScript.textContent = `
            window.ytTheaterInstance = window.ytTheater;
            window.ytTheater = window.ytTheater;
          `;
          if (document.head) {
            document.head.appendChild(bridgeScript);
          }
        } catch (error) {
        }
        
      } else {
      }
    } catch (error) {
    }
  } else {
    // Make sure ytTheater is available globally for Flash
    window.ytTheater = window.ytTheaterInstance;
  }
  
  // Final verification
};

// Define YouTubeTheater class directly in webview context
if (typeof window.YouTubeTheater === 'undefined') {
  window.YouTubeTheater = class YouTubeTheater {
    constructor() {
      this.player = null;
      this.isInitialized = false;
      this.currentVideoId = null;
      this.containerId = 'youtube-player';
      
      // Strategy attempt flags to prevent multiple attempts
      this.strategy2Attempted = false;
      this.strategy3Attempted = false;
      
      
      // Expose to global scope for Flash ExternalInterface calls
      window.ytTheater = this;
      
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.init();
        });
      } else {
        this.init();
      }
    }

    init() {
      
      try {
        // Create the YouTube player container
        this.createPlayerContainer();
        
        // Load YouTube iframe API
        this.loadYouTubeAPI();
        
      } catch (error) {
      }
    }

    createPlayerContainer() {
      // Remove existing container if it exists
      const existingContainer = document.getElementById(this.containerId);
      if (existingContainer) {
        existingContainer.remove();
      }

      // Create player container
      const container = document.createElement('div');
      container.id = this.containerId;
      container.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 640px;
        height: 360px;
        z-index: 9999;
        background: #000;
        border: 3px solid #4CAF50;
        border-radius: 10px;
        box-shadow: 0 0 20px rgba(0,0,0,0.8);
        display: none;
      `;

      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '✖';
      closeBtn.style.cssText = `
        position: absolute;
        top: -15px;
        right: -15px;
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 50%;
        background: #E53E3E;
        color: white;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        z-index: 10000;
      `;
      closeBtn.onclick = () => this.hidePlayer();

      container.appendChild(closeBtn);
      document.body.appendChild(container);

    }

    loadYouTubeAPI() {
      
      // ENHANCED DEBUGGING: Check webview environment capabilities
      this.testExternalScriptAccess();
      
      // CRITICAL FIX: Set up callback FIRST before any other checks
      window.onYouTubeIframeAPIReady = () => {
        this.onYouTubeIframeAPIReady();
      };
      
      // Check if YouTube API is already loaded and ready
      if (window.YT && window.YT.Player) {
        this.onYouTubeIframeAPIReady();
        return;
      }

      // Check if script exists but hasn't called callback yet
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (existingScript) {
        
        // ENHANCED: Try to force YT object detection
        this.attemptYTDetection();
        
        // Give it time to load, then force if needed
        setTimeout(() => {
          if (window.YT && window.YT.Player && !this.isInitialized) {
            this.onYouTubeIframeAPIReady();
          } else if (!window.YT) {
            existingScript.remove();
            this.loadYouTubeAPI(); // Recursively try again
          }
        }, 3000);
        return;
      }

      
      // ENHANCED: Try multiple loading strategies
      this.tryLoadingStrategy1() || this.tryLoadingStrategy2() || this.tryLoadingStrategy3();
    }

    testExternalScriptAccess() {
      try {
        // Test if we can create and load external scripts
        const testScript = document.createElement('script');
        testScript.src = 'data:text/javascript,window.ytTheaterScriptTest=true;';
        document.head.appendChild(testScript);
        
        setTimeout(() => {
          const canAccess = !!window.ytTheaterScriptTest;
          if (testScript.parentNode) testScript.parentNode.removeChild(testScript);
          delete window.ytTheaterScriptTest;
        }, 100);
        
        return true;
      } catch (error) {
        return false;
      }
    }

    attemptYTDetection() {
      // Try to detect if YT object exists but callback wasn't called
      let attempts = 0;
      const detectInterval = setInterval(() => {
        attempts++;
        
        if (window.YT && window.YT.Player) {
          clearInterval(detectInterval);
          this.onYouTubeIframeAPIReady();
        } else if (attempts >= 10) {
          clearInterval(detectInterval);
          this.tryLoadingStrategy2();
        }
      }, 500);
    }

    tryLoadingStrategy1() {
      try {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.defer = false;
        
        tag.onload = () => {
          this.attemptYTDetection();
          setTimeout(() => {
            if (window.YT && window.YT.Player && !this.isInitialized) {
              this.onYouTubeIframeAPIReady();
            }
          }, 2000);
        };
        
        tag.onerror = (error) => {
          this.notifyFlash('onYouTubeError', 'Strategy 1 failed to load YouTube API');
        };

        // Insert script
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }

        return true;
      } catch (error) {
        return false;
      }
    }

    tryLoadingStrategy2() {
      
      // Prevent multiple Strategy 2 attempts
      if (this.strategy2Attempted) {
        this.tryLoadingStrategy3();
        return false;
      }
      this.strategy2Attempted = true;
      
      try {
        fetch('https://www.youtube.com/iframe_api')
          .then(response => {
            if (response.ok) {
              return response.text();
            }
            throw new Error(`HTTP ${response.status}`);
          })
          .then(scriptContent => {
            
            // Evaluate the script content
            try {
              eval(scriptContent);
              
              // Give it a moment to create YT object, then check
              setTimeout(() => {
                if (window.YT && window.YT.Player) {
                  this.onYouTubeIframeAPIReady();
                } else {
                  this.tryLoadingStrategy3();
                }
              }, 1000);
            } catch (evalError) {
              this.tryLoadingStrategy3();
            }
          })
          .catch(error => {
            this.tryLoadingStrategy3();
          });
        
        return true;
      } catch (error) {
        this.tryLoadingStrategy3();
        return false;
      }
    }

    tryLoadingStrategy3() {
      
      // Prevent multiple Strategy 3 attempts
      if (this.strategy3Attempted) {
        this.notifyFlash('onYouTubeError', 'All loading strategies failed');
        return false;
      }
      this.strategy3Attempted = true;
      
      try {
        // Force clear any existing broken YT object
        if (window.YT && !window.YT.Player) {
          delete window.YT;
        }
        
        // Create a minimal YT-like object for basic functionality
        if (!window.YT || !window.YT.Player) {
          
          window.YT = {
            PlayerState: {
              UNSTARTED: -1,
              ENDED: 0,
              PLAYING: 1,
              PAUSED: 2,
              BUFFERING: 3,
              CUED: 5
            },
            Player: function(containerId, config) {
              this.containerId = containerId;
              this.config = config;
              this.playerState = -1;
              this.currentVideoId = null;
              
              // Create an iframe-based player
              const container = document.getElementById(containerId);
              if (container) {
                container.innerHTML = `
                  <iframe 
                    width="100%" 
                    height="100%" 
                    src="about:blank"
                    frameborder="0" 
                    allowfullscreen
                    id="${containerId}_iframe"
                    style="background: #000; border: 2px solid #4CAF50;"
                  ></iframe>
                  <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white; padding: 5px; border-radius: 3px; font-size: 12px; z-index: 1000;">
                    🎬 YouTube Theater (Custom Player)
                  </div>
                `;
                
                this.iframe = container.querySelector('iframe');
              }
              
              // Simulate ready event
              setTimeout(() => {
                if (config.events && config.events.onReady) {
                  config.events.onReady({ target: this });
                }
              }, 100);
              
              // Player methods
              this.loadVideoById = (videoId) => {
                this.currentVideoId = videoId;
                if (this.iframe) {
                  this.iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0&modestbranding=1&fs=1`;
                  this.playerState = 1; // PLAYING
                  if (this.config.events && this.config.events.onStateChange) {
                    this.config.events.onStateChange({ data: this.playerState, target: this });
                  }
                }
              };
              
              this.playVideo = () => {
                if (this.currentVideoId && this.iframe) {
                  this.iframe.src = `https://www.youtube.com/embed/${this.currentVideoId}?autoplay=1&controls=1&rel=0&modestbranding=1&fs=1`;
                }
                this.playerState = 1;
                if (this.config.events && this.config.events.onStateChange) {
                  this.config.events.onStateChange({ data: this.playerState, target: this });
                }
              };
              
              this.pauseVideo = () => {
                // Note: Can't actually pause embedded iframe, but we can simulate
                this.playerState = 2;
                if (this.config.events && this.config.events.onStateChange) {
                  this.config.events.onStateChange({ data: this.playerState, target: this });
                }
              };
              
              this.stopVideo = () => {
                if (this.iframe) {
                  this.iframe.src = 'about:blank';
                }
                this.playerState = 0;
                if (this.config.events && this.config.events.onStateChange) {
                  this.config.events.onStateChange({ data: this.playerState, target: this });
                }
              };
              
              this.seekTo = (seconds) => {
                // Basic seek functionality - reload with time parameter
                if (this.currentVideoId && this.iframe) {
                  this.iframe.src = `https://www.youtube.com/embed/${this.currentVideoId}?autoplay=1&controls=1&rel=0&modestbranding=1&start=${Math.floor(seconds)}&fs=1`;
                }
              };
              
              this.getCurrentTime = () => {
                // Return approximate time (would need postMessage communication for real time)
                return 0;
              };
              
              this.destroy = () => {
                if (this.iframe && this.iframe.parentNode) {
                  this.iframe.parentNode.removeChild(this.iframe);
                }
              };
              
              return this;
            }
          };
          
          
          // Trigger the ready callback
          setTimeout(() => {
            this.onYouTubeIframeAPIReady();
          }, 200);
        } else {
          setTimeout(() => {
            this.onYouTubeIframeAPIReady();
          }, 100);
        }
        
        return true;
      } catch (error) {
        this.notifyFlash('onYouTubeError', 'All loading strategies failed: ' + error.message);
        return false;
      }
    }

    onYouTubeIframeAPIReady() {
      
      // Prevent multiple initializations
      if (this.isInitialized) {
        return;
      }
      
      // Verify container exists
      const container = document.getElementById(this.containerId);
      if (!container) {
        this.createPlayerContainer();
      }
      
      try {
        this.player = new YT.Player(this.containerId, {
          height: '360',
          width: '640',
          videoId: '', // Will be set when loading videos
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            fs: 1,
            cc_load_policy: 0,
            iv_load_policy: 3,
            autohide: 0
          },
          events: {
            onReady: (event) => this.onPlayerReady(event),
            onStateChange: (event) => this.onPlayerStateChange(event),
            onError: (event) => this.onPlayerError(event)
          }
        });

        this.isInitialized = true;
        
        // Notify Flash that player is ready
        this.notifyFlash('onYouTubePlayerReady', null);
        
      } catch (error) {
        this.notifyFlash('onYouTubeError', 'Error creating player: ' + error.message);
      }
    }

    onPlayerReady(event) {
    }

    onPlayerStateChange(event) {
      const state = this.getStateName(event.data);
      
      // Notify Flash of state changes
      this.notifyFlash('onYouTubeStateChange', state);
      
      // Send time updates during playback
      if (event.data === YT.PlayerState.PLAYING) {
        this.startTimeUpdateInterval();
      } else {
        this.stopTimeUpdateInterval();
      }
    }

    onPlayerError(event) {
      const errorMsg = this.getErrorMessage(event.data);
      this.notifyFlash('onYouTubeError', errorMsg);
    }

    getStateName(state) {
      switch (state) {
        case YT.PlayerState.UNSTARTED: return 'unstarted';
        case YT.PlayerState.ENDED: return 'ended';
        case YT.PlayerState.PLAYING: return 'playing';
        case YT.PlayerState.PAUSED: return 'paused';
        case YT.PlayerState.BUFFERING: return 'buffering';
        case YT.PlayerState.CUED: return 'cued';
        default: return 'unknown';
      }
    }

    getErrorMessage(errorCode) {
      switch (errorCode) {
        case 2: return 'Invalid video ID';
        case 5: return 'HTML5 player error';
        case 100: return 'Video not found or private';
        case 101: return 'Video not available in embedded players';
        case 150: return 'Video not available in embedded players';
        default: return 'Unknown error: ' + errorCode;
      }
    }

    startTimeUpdateInterval() {
      this.stopTimeUpdateInterval();
      
      this.timeUpdateInterval = setInterval(() => {
        if (this.player && this.player.getCurrentTime) {
          try {
            const currentTime = this.player.getCurrentTime();
            this.notifyFlash('onYouTubeTimeUpdate', currentTime);
          } catch (error) {
          }
        }
      }, 1000);
    }

    stopTimeUpdateInterval() {
      if (this.timeUpdateInterval) {
        clearInterval(this.timeUpdateInterval);
        this.timeUpdateInterval = null;
      }
    }

    loadVideo(videoId) {
      
      if (!this.isInitialized || !this.player) {
        
        if (!this.isInitialized) {
          this.loadYouTubeAPI();
        }
        
        this.notifyFlash('onYouTubeError', 'Player not initialized');
        return;
      }

      try {
        this.currentVideoId = videoId;
        this.player.loadVideoById(videoId);
        this.showPlayer();
      } catch (error) {
        this.notifyFlash('onYouTubeError', 'Error loading video: ' + error.message);
      }
    }

    playVideo() {
      
      if (!this.player) {
        return;
      }

      try {
        this.player.playVideo();
        this.showPlayer();
      } catch (error) {
        this.notifyFlash('onYouTubeError', 'Error playing video: ' + error.message);
      }
    }

    pauseVideo() {
      
      if (!this.player) {
        return;
      }

      try {
        this.player.pauseVideo();
      } catch (error) {
        this.notifyFlash('onYouTubeError', 'Error pausing video: ' + error.message);
      }
    }

    stopVideo() {
      
      if (!this.player) {
        return;
      }

      try {
        this.player.stopVideo();
        this.hidePlayer();
      } catch (error) {
        this.notifyFlash('onYouTubeError', 'Error stopping video: ' + error.message);
      }
    }

    seekTo(time) {
      
      if (!this.player) {
        return;
      }

      try {
        this.player.seekTo(time, true);
      } catch (error) {
        this.notifyFlash('onYouTubeError', 'Error seeking: ' + error.message);
      }
    }

    showPlayer() {
      const container = document.getElementById(this.containerId);
      if (container) {
        container.style.display = 'block';
      }
    }

    hidePlayer() {
      const container = document.getElementById(this.containerId);
      if (container) {
        container.style.display = 'none';
      }
    }

    destroy() {
      
      this.stopTimeUpdateInterval();
      
      if (this.player) {
        try {
          this.player.destroy();
        } catch (error) {
        }
        this.player = null;
      }

      const container = document.getElementById(this.containerId);
      if (container) {
        container.remove();
      }

      this.isInitialized = false;
      this.currentVideoId = null;
      
    }

    // IN-GAME THEATER INTEGRATION METHODS
    
    hasActiveVideos() {
      
      // Check if we have a currently playing video
      if (this.currentVideoId) {
        return true;
      }
      
      // Check local storage for persistent data
      try {
        const savedData = localStorage.getItem('youtubeTheaterData');
        if (savedData) {
          const data = JSON.parse(savedData);
          const hasActiveVideos = data.videoQueue && data.videoQueue.length > 0 && data.isPlaying;
          return hasActiveVideos;
        }
      } catch (e) {
      }
      
      return false;
    }
    
    setupInGameTheater() {
      
      try {
        // CRITICAL: Try to get current video from Flash popup first
        let flashVideoId = null;
        try {
          
          // Try multiple methods to get Flash video data
          if (typeof window.getFlashYouTubeTheaterCurrentVideo === 'function') {
            const flashVideoData = window.getFlashYouTubeTheaterCurrentVideo();
            if (flashVideoData && flashVideoData.url) {
              flashVideoId = this.extractVideoId(flashVideoData.url);
            }
          }
          
          // Alternative: Try to communicate with Flash popup directly
          if (!flashVideoId && typeof window.gMainFrame !== 'undefined' && window.gMainFrame.guiManager) {
            try {
              // This will be implemented in Flash side
            } catch (e) {
            }
          }
        } catch (e) {
        }
        
        // CRITICAL FIX: Find Flash container and position iframe INSIDE it, not as overlay
        const flashContainer = this.findFlashContainer();
        const container = document.getElementById(this.containerId);
        if (container && flashContainer) {
          
          // Get Flash container bounds
          const flashRect = flashContainer.getBoundingClientRect();
          
          // Position iframe INSIDE Flash container using absolute positioning
          container.style.cssText = 
            'position: absolute;' +
            'top: 20%;' +
            'left: 15%;' +
            'width: 70%;' +
            'height: 65%;' +
            'z-index: 1000;' +
            'background: #000;' +
            'border: 2px solid #FFD700;' +
            'border-radius: 8px;' +
            'display: block;';
          
          // CRITICAL: Append to Flash container, not body
          if (container.parentNode !== flashContainer) {
            flashContainer.appendChild(container);
          }
          
          // Add integration indicator (smaller, less intrusive)
          let indicator = container.querySelector('.in-game-indicator');
          if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'in-game-indicator';
            indicator.innerHTML = '🎬 Integrated Theater';
            indicator.style.cssText = 
              'position: absolute;' +
              'top: -25px;' +
              'right: 0;' +
              'background: rgba(255,215,0,0.9);' +
              'color: #000;' +
              'padding: 2px 8px;' +
              'border-radius: 4px;' +
              'font-size: 11px;' +
              'font-weight: bold;' +
              'z-index: 1001;';
            container.appendChild(indicator);
          }
          
        } else if (container) {
          
          // Fallback: Position relative to viewport but try to integrate better
          container.style.cssText = 
            'position: absolute;' +
            'top: 30%;' +
            'left: 20%;' +
            'width: 60%;' +
            'height: 50%;' +
            'z-index: 1000;' +
            'background: #000;' +
            'border: 2px solid #FFD700;' +
            'border-radius: 8px;' +
            'display: block;';
          
        }
        
        // Load video: Priority to Flash popup video, then saved video
        if (flashVideoId) {
          this.loadVideo(flashVideoId);
        } else if (this.hasActiveVideos()) {
          this.loadSavedVideo();
        } else {
        }
        
      } catch (error) {
      }
    }
    
    loadSavedVideo() {
      try {
        const savedData = localStorage.getItem('youtubeTheaterData');
        if (savedData) {
          const data = JSON.parse(savedData);
          if (data.videoQueue && data.videoQueue.length > 0 && data.currentVideoIndex >= 0) {
            const currentVideo = data.videoQueue[data.currentVideoIndex];
            if (currentVideo && currentVideo.url) {
              const videoId = this.extractVideoId(currentVideo.url);
              if (videoId) {
                this.loadVideo(videoId);
              }
            }
          }
        }
      } catch (e) {
      }
    }
    
    extractVideoId(url) {
      // Extract YouTube video ID from URL
      if (url.includes('youtube.com/watch?v=')) {
        const match = url.match(/v=([^&]+)/);
        return match ? match[1] : null;
      } else if (url.includes('youtu.be/')) {
        const match = url.match(/youtu\.be\/([^?]+)/);
        return match ? match[1] : null;
      }
      return null;
    }
    
    findFlashContainer() {
      
      // Try multiple methods to find the Flash container
      let flashContainer = null;
      
      // Method 1: Look for embed/object tags with .swf
      const embeds = document.querySelectorAll('embed[src*=".swf"]');
      if (embeds.length > 0) {
        flashContainer = embeds[0].parentNode;
      }
      
      // Method 2: Look for object tags with Flash content
      if (!flashContainer) {
        const objects = document.querySelectorAll('object[data*=".swf"]');
        if (objects.length > 0) {
          flashContainer = objects[0].parentNode;
        }
      }
      
      // Method 3: Look for common Flash container IDs/classes
      if (!flashContainer) {
        const commonIds = ['flash-content', 'flash-container', 'game-container', 'swf-container'];
        for (const id of commonIds) {
          const element = document.getElementById(id);
          if (element) {
            flashContainer = element;
            break;
          }
        }
      }
      
      // Method 4: Look for elements with Flash-related classes
      if (!flashContainer) {
        const flashElements = document.querySelectorAll('.flash, .swf, .game');
        if (flashElements.length > 0) {
          flashContainer = flashElements[0];
        }
      }
      
      // Method 5: Find the largest container that might contain Flash
      if (!flashContainer) {
        const containers = document.querySelectorAll('div');
        let largestContainer = null;
        let largestArea = 0;
        
        for (const container of containers) {
          const rect = container.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > largestArea && rect.width > 500 && rect.height > 400) {
            largestArea = area;
            largestContainer = container;
          }
        }
        
        if (largestContainer) {
          flashContainer = largestContainer;
        }
      }
      
      if (flashContainer) {
      } else {
      }
      
      return flashContainer;
    }

    notifyFlash(eventName, data) {
      
      try {
        if (typeof window[eventName] === 'function') {
          window[eventName](data);
        } else {
        }
      } catch (error) {
      }
    }
  };
}

// Auto-initialize when ready
document.addEventListener('DOMContentLoaded', () => {
  
  // Initialize immediately since class is already defined
  if (typeof window.initYouTubeTheater === 'function') {
    window.initYouTubeTheater();
  }
});
