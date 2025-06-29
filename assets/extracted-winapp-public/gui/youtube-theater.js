// YouTube Theater Integration for Animal Jam
// This handles the JavaScript side of YouTube API integration

// CRITICAL: Define global functions FIRST so Flash can call them immediately

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

// Flash callback functions that Flash will call via ExternalInterface.addCallback
window.onYouTubePlayerReady = function(data) {
};

window.onYouTubeStateChange = function(state) {
};

window.onYouTubeError = function(error) {
};

window.onYouTubeTimeUpdate = function(time) {
};

// Global function to initialize YouTube Theater
window.initYouTubeTheater = function() {
  
  if (!window.ytTheaterInstance) {
    try {
      if (typeof window.YouTubeTheater === 'function') {
        window.ytTheaterInstance = new window.YouTubeTheater();
        
        // Make sure ytTheater is available globally for Flash
        window.ytTheater = window.ytTheaterInstance;
        
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

// Prevent multiple declarations
if (typeof window.YouTubeTheater !== 'undefined') {
} else {

window.YouTubeTheater = class YouTubeTheater {
  constructor() {
    this.player = null;
    this.isInitialized = false;
    this.currentVideoId = null;
    this.containerId = 'youtube-player';
    
    
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
    
    // Check if YouTube API is already loaded
    if (window.YT && window.YT.Player) {
      this.onYouTubeIframeAPIReady();
      return;
    }

    // Check if script is already loading
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      // Set callback in case it wasn't set before
      window.onYouTubeIframeAPIReady = () => this.onYouTubeIframeAPIReady();
      return;
    }

    
    // Load YouTube iframe API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onload = () => {
    };
    tag.onerror = (error) => {
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
      this.onYouTubeIframeAPIReady();
    };

  }

  onYouTubeIframeAPIReady() {
    
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
    // Player is ready, but not visible yet
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
    this.stopTimeUpdateInterval(); // Clear any existing interval
    
    this.timeUpdateInterval = setInterval(() => {
      if (this.player && this.player.getCurrentTime) {
        try {
          const currentTime = this.player.getCurrentTime();
          this.notifyFlash('onYouTubeTimeUpdate', currentTime);
        } catch (error) {
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
    
    if (!this.isInitialized || !this.player) {
      
      // Try to initialize if not already done
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

  // Helper method to notify Flash of events
  notifyFlash(eventName, data) {
    
    try {
      // Flash ExternalInterface callbacks are registered globally when Flash calls ExternalInterface.addCallback
      // We need to call the callbacks that Flash registered, not methods on the Flash object
      
      // Check if the callback exists as a global function (this is how ExternalInterface works)
      if (typeof window[eventName] === 'function') {
        window[eventName](data);
      } else {
        
        // Fallback: try to access Flash object directly
        const flashObject = this.getFlashObject();
        if (flashObject && flashObject[eventName]) {
          flashObject[eventName](data);
        } else {
        }
      }
    } catch (error) {
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

// Initialize immediately when the script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.initYouTubeTheater === 'function') {
      window.initYouTubeTheater();
    }
  });
} else {
  setTimeout(() => {
    if (typeof window.initYouTubeTheater === 'function') {
      window.initYouTubeTheater();
    }
  }, 100);
}
