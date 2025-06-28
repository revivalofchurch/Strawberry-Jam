// YouTube Theater Integration for Animal Jam
// This handles the JavaScript side of YouTube API integration

// CRITICAL: Define global functions FIRST so Flash can call them immediately
console.log('[YouTube Theater] Script loaded - defining global functions first');

// Expose YouTube control functions globally for Flash ExternalInterface.call()
window.ytTheaterLoadVideo = function(videoId) {
  console.log('[YouTube Theater] Global ytTheaterLoadVideo called with:', videoId);
  console.log('[YouTube Theater] Current ytTheater instance:', !!window.ytTheater);
  console.log('[YouTube Theater] Current ytTheaterInstance:', !!window.ytTheaterInstance);
  
  if (window.ytTheater) {
    console.log('[YouTube Theater] Calling loadVideo on ytTheater instance');
    window.ytTheater.loadVideo(videoId);
  } else if (window.ytTheaterInstance) {
    console.log('[YouTube Theater] Using ytTheaterInstance instead');
    window.ytTheaterInstance.loadVideo(videoId);
  } else {
    console.error('[YouTube Theater] No ytTheater instance available, creating one...');
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
  console.log('[YouTube Theater] Global ytTheaterPlayVideo called');
  if (window.ytTheater) {
    window.ytTheater.playVideo();
  } else {
    console.error('[YouTube Theater] ytTheater instance not available');
  }
};

window.ytTheaterPauseVideo = function() {
  console.log('[YouTube Theater] Global ytTheaterPauseVideo called');
  if (window.ytTheater) {
    window.ytTheater.pauseVideo();
  } else {
    console.error('[YouTube Theater] ytTheater instance not available');
  }
};

window.ytTheaterStopVideo = function() {
  console.log('[YouTube Theater] Global ytTheaterStopVideo called');
  if (window.ytTheater) {
    window.ytTheater.stopVideo();
  } else {
    console.error('[YouTube Theater] ytTheater instance not available');
  }
};

window.ytTheaterSeekTo = function(time) {
  console.log('[YouTube Theater] Global ytTheaterSeekTo called with:', time);
  if (window.ytTheater) {
    window.ytTheater.seekTo(time);
  } else {
    console.error('[YouTube Theater] ytTheater instance not available');
  }
};

window.ytTheaterDestroy = function() {
  console.log('[YouTube Theater] Global ytTheaterDestroy called');
  if (window.ytTheater) {
    window.ytTheater.destroy();
  } else {
    console.error('[YouTube Theater] ytTheater instance not available');
  }
};

// Flash callback functions that Flash will call via ExternalInterface.addCallback
window.onYouTubePlayerReady = function(data) {
  console.log('[YouTube Theater] Flash callback onYouTubePlayerReady called with:', data);
};

window.onYouTubeStateChange = function(state) {
  console.log('[YouTube Theater] Flash callback onYouTubeStateChange called with:', state);
};

window.onYouTubeError = function(error) {
  console.log('[YouTube Theater] Flash callback onYouTubeError called with:', error);
};

window.onYouTubeTimeUpdate = function(time) {
  console.log('[YouTube Theater] Flash callback onYouTubeTimeUpdate called with:', time);
};

console.log('[YouTube Theater] ✅ Global functions defined and ready for Flash calls');

// Global function to initialize YouTube Theater
window.initYouTubeTheater = function() {
  console.log('[YouTube Theater] initYouTubeTheater called from Flash');
  console.log('[YouTube Theater] Current instances:', {
    ytTheater: !!window.ytTheater,
    ytTheaterInstance: !!window.ytTheaterInstance,
    YouTubeTheaterClass: !!window.YouTubeTheater
  });
  
  if (!window.ytTheaterInstance) {
    console.log('[YouTube Theater] Creating new instance...');
    try {
      if (typeof window.YouTubeTheater === 'function') {
        window.ytTheaterInstance = new window.YouTubeTheater();
        console.log('[YouTube Theater] New instance created successfully');
        
        // Make sure ytTheater is available globally for Flash
        window.ytTheater = window.ytTheaterInstance;
        
        console.log('[YouTube Theater] Global references set, ytTheater:', !!window.ytTheater);
      } else {
        console.error('[YouTube Theater] YouTubeTheater class not available');
      }
    } catch (error) {
      console.error('[YouTube Theater] Error creating instance:', error);
      console.error('[YouTube Theater] Error stack:', error.stack);
    }
  } else {
    console.log('[YouTube Theater] Instance already exists, reusing');
    // Make sure ytTheater is available globally for Flash
    window.ytTheater = window.ytTheaterInstance;
  }
  
  // Final verification
  console.log('[YouTube Theater] Initialization complete. Available instances:', {
    ytTheater: !!window.ytTheater,
    ytTheaterInstance: !!window.ytTheaterInstance,
    ytTheaterLoadVideo: typeof window.ytTheaterLoadVideo
  });
};

// Prevent multiple declarations
if (typeof window.YouTubeTheater !== 'undefined') {
  console.log('[YouTube Theater] Class already exists, skipping redeclaration');
} else {

window.YouTubeTheater = class YouTubeTheater {
  constructor() {
    this.player = null;
    this.isInitialized = false;
    this.currentVideoId = null;
    this.containerId = 'youtube-player';
    
    console.log('[YouTube Theater] Constructor called');
    console.log('[YouTube Theater] Environment details:', {
      userAgent: navigator.userAgent,
      documentReadyState: document.readyState,
      windowLocation: window.location.href,
      hasExistingInstance: !!window.ytTheater
    });
    
    // Expose to global scope for Flash ExternalInterface calls
    window.ytTheater = this;
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      console.log('[YouTube Theater] DOM still loading, waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[YouTube Theater] DOMContentLoaded event received');
        this.init();
      });
    } else {
      console.log('[YouTube Theater] DOM already ready, initializing immediately');
      this.init();
    }
  }

  init() {
    console.log('[YouTube Theater] Starting initialization...');
    console.log('[YouTube Theater] Current state:', {
      isInitialized: this.isInitialized,
      hasPlayer: !!this.player,
      currentVideoId: this.currentVideoId,
      windowYT: !!window.YT,
      windowYTPlayer: !!(window.YT && window.YT.Player)
    });
    
    try {
      // Create the YouTube player container
      console.log('[YouTube Theater] Creating player container...');
      this.createPlayerContainer();
      
      // Load YouTube iframe API
      console.log('[YouTube Theater] Loading YouTube API...');
      this.loadYouTubeAPI();
      
      console.log('[YouTube Theater] Initialization steps completed');
    } catch (error) {
      console.error('[YouTube Theater] Error during initialization:', error);
      console.error('[YouTube Theater] Stack trace:', error.stack);
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

    console.log('[YouTube Theater] Player container created');
  }

  loadYouTubeAPI() {
    console.log('[YouTube Theater] loadYouTubeAPI called');
    console.log('[YouTube Theater] Current state:', {
      windowYT: !!window.YT,
      windowYTPlayer: !!(window.YT && window.YT.Player),
      hasExistingScript: !!document.querySelector('script[src*="youtube.com/iframe_api"]')
    });
    
    // Check if YouTube API is already loaded
    if (window.YT && window.YT.Player) {
      console.log('[YouTube Theater] YouTube API already loaded, initializing player');
      this.onYouTubeIframeAPIReady();
      return;
    }

    // Check if script is already loading
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      console.log('[YouTube Theater] YouTube API script already loading, waiting...');
      // Set callback in case it wasn't set before
      window.onYouTubeIframeAPIReady = () => this.onYouTubeIframeAPIReady();
      return;
    }

    console.log('[YouTube Theater] Loading YouTube iframe API script...');
    
    // Load YouTube iframe API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onload = () => {
      console.log('[YouTube Theater] YouTube API script loaded successfully');
    };
    tag.onerror = (error) => {
      console.error('[YouTube Theater] Failed to load YouTube API script:', error);
      this.notifyFlash('onYouTubeError', 'Failed to load YouTube API');
    };

    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
      document.head.appendChild(tag);
    }

    // Set global callback for YouTube API
    window.onYouTubeIframeAPIReady = () => {
      console.log('[YouTube Theater] onYouTubeIframeAPIReady callback triggered');
      this.onYouTubeIframeAPIReady();
    };

    console.log('[YouTube Theater] YouTube API script tag added to DOM');
  }

  onYouTubeIframeAPIReady() {
    console.log('[YouTube Theater] YouTube API ready, creating player...');
    
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
      console.log('[YouTube Theater] Player created successfully');
      
      // Notify Flash that player is ready
      this.notifyFlash('onYouTubePlayerReady', null);
      
    } catch (error) {
      console.error('[YouTube Theater] Error creating player:', error);
      this.notifyFlash('onYouTubeError', 'Error creating player: ' + error.message);
    }
  }

  onPlayerReady(event) {
    console.log('[YouTube Theater] Player ready');
    // Player is ready, but not visible yet
  }

  onPlayerStateChange(event) {
    const state = this.getStateName(event.data);
    console.log('[YouTube Theater] State changed to:', state);
    
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
    console.error('[YouTube Theater] Player error:', errorMsg);
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
    this.stopTimeUpdateInterval(); // Clear any existing interval
    
    this.timeUpdateInterval = setInterval(() => {
      if (this.player && this.player.getCurrentTime) {
        try {
          const currentTime = this.player.getCurrentTime();
          this.notifyFlash('onYouTubeTimeUpdate', currentTime);
        } catch (error) {
          console.error('[YouTube Theater] Error getting current time:', error);
        }
      }
    }, 1000); // Update every second
  }

  stopTimeUpdateInterval() {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  // Methods called by Flash via ExternalInterface.call()
  
  loadVideo(videoId) {
    console.log('[YouTube Theater] Loading video:', videoId);
    console.log('[YouTube Theater] Player state:', {
      isInitialized: this.isInitialized,
      hasPlayer: !!this.player,
      playerState: this.player ? 'exists' : 'null',
      currentVideoId: this.currentVideoId
    });
    
    if (!this.isInitialized || !this.player) {
      console.error('[YouTube Theater] Player not initialized, attempting to initialize...');
      
      // Try to initialize if not already done
      if (!this.isInitialized) {
        console.log('[YouTube Theater] Attempting to initialize YouTube API...');
        this.loadYouTubeAPI();
      }
      
      this.notifyFlash('onYouTubeError', 'Player not initialized');
      return;
    }

    try {
      console.log('[YouTube Theater] Setting current video ID and loading...');
      this.currentVideoId = videoId;
      this.player.loadVideoById(videoId);
      this.showPlayer();
      console.log('[YouTube Theater] Video load command sent successfully:', videoId);
    } catch (error) {
      console.error('[YouTube Theater] Error loading video:', error);
      console.error('[YouTube Theater] Error details:', error.stack);
      this.notifyFlash('onYouTubeError', 'Error loading video: ' + error.message);
    }
  }

  playVideo() {
    console.log('[YouTube Theater] Playing video');
    
    if (!this.player) {
      console.error('[YouTube Theater] Player not available');
      return;
    }

    try {
      this.player.playVideo();
      this.showPlayer();
    } catch (error) {
      console.error('[YouTube Theater] Error playing video:', error);
      this.notifyFlash('onYouTubeError', 'Error playing video: ' + error.message);
    }
  }

  pauseVideo() {
    console.log('[YouTube Theater] Pausing video');
    
    if (!this.player) {
      console.error('[YouTube Theater] Player not available');
      return;
    }

    try {
      this.player.pauseVideo();
    } catch (error) {
      console.error('[YouTube Theater] Error pausing video:', error);
      this.notifyFlash('onYouTubeError', 'Error pausing video: ' + error.message);
    }
  }

  stopVideo() {
    console.log('[YouTube Theater] Stopping video');
    
    if (!this.player) {
      console.error('[YouTube Theater] Player not available');
      return;
    }

    try {
      this.player.stopVideo();
      this.hidePlayer();
    } catch (error) {
      console.error('[YouTube Theater] Error stopping video:', error);
      this.notifyFlash('onYouTubeError', 'Error stopping video: ' + error.message);
    }
  }

  seekTo(time) {
    console.log('[YouTube Theater] Seeking to time:', time);
    
    if (!this.player) {
      console.error('[YouTube Theater] Player not available');
      return;
    }

    try {
      this.player.seekTo(time, true);
    } catch (error) {
      console.error('[YouTube Theater] Error seeking:', error);
      this.notifyFlash('onYouTubeError', 'Error seeking: ' + error.message);
    }
  }

  showPlayer() {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'block';
      console.log('[YouTube Theater] Player shown');
    }
  }

  hidePlayer() {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'none';
      console.log('[YouTube Theater] Player hidden');
    }
  }

  destroy() {
    console.log('[YouTube Theater] Destroying player...');
    
    this.stopTimeUpdateInterval();
    
    if (this.player) {
      try {
        this.player.destroy();
      } catch (error) {
        console.error('[YouTube Theater] Error destroying player:', error);
      }
      this.player = null;
    }

    const container = document.getElementById(this.containerId);
    if (container) {
      container.remove();
    }

    this.isInitialized = false;
    this.currentVideoId = null;
    
    console.log('[YouTube Theater] Player destroyed');
  }

  // Helper method to notify Flash of events
  notifyFlash(eventName, data) {
    console.log('[YouTube Theater] Attempting to notify Flash:', eventName, 'with data:', data);
    
    try {
      // Flash ExternalInterface callbacks are registered globally when Flash calls ExternalInterface.addCallback
      // We need to call the callbacks that Flash registered, not methods on the Flash object
      
      // Check if the callback exists as a global function (this is how ExternalInterface works)
      if (typeof window[eventName] === 'function') {
        console.log('[YouTube Theater] Calling Flash callback via global function:', eventName);
        window[eventName](data);
        console.log('[YouTube Theater] Flash callback completed successfully');
      } else {
        console.warn('[YouTube Theater] Flash callback not found as global function:', eventName);
        
        // Fallback: try to access Flash object directly
        const flashObject = this.getFlashObject();
        if (flashObject && flashObject[eventName]) {
          console.log('[YouTube Theater] Calling Flash callback via Flash object:', eventName);
          flashObject[eventName](data);
          console.log('[YouTube Theater] Flash object callback completed successfully');
        } else {
          console.warn('[YouTube Theater] Flash callback not available anywhere:', eventName);
          console.log('[YouTube Theater] Available global functions:', Object.keys(window).filter(key => typeof window[key] === 'function'));
        }
      }
    } catch (error) {
      console.error('[YouTube Theater] Error notifying Flash:', error);
      console.error('[YouTube Theater] Error stack:', error.stack);
    }
  }

  getFlashObject() {
    // Try to get Flash object by different methods
    let flashObj = null;
    
    // Try getting by object name (common in embedded Flash)
    const objectElements = document.getElementsByTagName('object');
    for (let i = 0; i < objectElements.length; i++) {
      if (objectElements[i].data && objectElements[i].data.includes('.swf')) {
        flashObj = objectElements[i];
        break;
      }
    }
    
    // Try getting by embed tag
    if (!flashObj) {
      const embedElements = document.getElementsByTagName('embed');
      for (let i = 0; i < embedElements.length; i++) {
        if (embedElements[i].src && embedElements[i].src.includes('.swf')) {
          flashObj = embedElements[i];
          break;
        }
      }
    }
    
    return flashObj;
  }
}

} // End of YouTubeTheater class declaration guard

// Auto-initialize when script loads
console.log('[YouTube Theater] Script loaded - auto-initialization...');

// Initialize immediately when the script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[YouTube Theater] DOM loaded, auto-initializing...');
    if (typeof window.initYouTubeTheater === 'function') {
      window.initYouTubeTheater();
    }
  });
} else {
  console.log('[YouTube Theater] DOM already ready, auto-initializing...');
  setTimeout(() => {
    if (typeof window.initYouTubeTheater === 'function') {
      window.initYouTubeTheater();
    }
  }, 100);
}

 