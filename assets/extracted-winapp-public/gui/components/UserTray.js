"use strict";

(() => {
  customElements.define("ajd-user-tray", class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._expanded = false; // Always start collapsed
      this._expandable = true; // Internal state for arrow visibility

      this.loadExternalFiles();
    }

    async loadExternalFiles() {
      try {
        // Load CSS
        const cssResponse = await fetch('components/UserTray.css');
        const cssText = await cssResponse.text();
        
        // Load HTML
        const htmlResponse = await fetch('components/UserTray.html');
        const htmlText = await htmlResponse.text();
        
        // Apply to shadow DOM
        this.shadowRoot.innerHTML = `<style>${cssText}</style>${htmlText}`;
        
        // Initialize after content is loaded
        this.initializeElements();
        this.attachListeners();
        this._updateVisibility();
      } catch (error) {
        console.error('Failed to load UserTray external files:', error);
        // Fallback to inline content if external files fail
        this.renderFallback();
      }
    }

    renderFallback() {
      // Fallback inline content (simplified version)
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            position: fixed;
            bottom: 4px;
            right: 4px;
            z-index: 10000;
          }
          #tray-container {
            background: rgba(255, 245, 230, 0.95);
            border: 2px solid rgba(232, 61, 82, 0.3);
            border-radius: 8px;
            padding: 8px;
          }
          button {
            background: #e83d52;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin: 2px 0;
            display: block;
          }
        </style>
        <div id="tray-container">
          <button id="fullscreen-button">Fullscreen</button>
          <button id="logout-button">Logout</button>
        </div>
      `;
      
      this.initializeElements();
      this.attachListeners();
    }

    initializeElements() {
      this.trayContainer = this.shadowRoot.getElementById("tray-container");
      this.arrowContainer = this.shadowRoot.getElementById("arrow-container");
      this.arrowIcon = this.shadowRoot.getElementById("arrow-icon-svg");
      this.trayContent = this.shadowRoot.getElementById("tray-content");
      this.fullscreenButton = this.shadowRoot.getElementById("fullscreen-button");
      this.logoutButton = this.shadowRoot.getElementById("logout-button");
    }

    attachListeners() {
      if (this.arrowContainer) {
        this.arrowContainer.addEventListener("click", () => this.toggleExpand());
      }
      
      if (this.fullscreenButton) {
        this.fullscreenButton.addEventListener("click", () => {
          window.ipc.send("systemCommand", { command: "toggleFullScreen" });
        });
      }

      if (this.logoutButton) {
        this.logoutButton.addEventListener("click", () => {
          // Send IPC message to log out from Electron app
          if (window.ipc) {
            window.ipc.send("logout");
          }
          // Also dispatch the custom event for the UI
          this.dispatchEvent(new CustomEvent("logout-requested", { bubbles: true, composed: true }));
        });
      }
    }

    toggleExpand() {
      if (!this._expandable) return; // Don't toggle if not expandable (e.g., maximized)
      this.expanded = !this.expanded;
    }

    get expanded() {
      return this._expanded;
    }

    set expanded(value) {
      const newExpandedState = Boolean(value);
      if (this._expanded === newExpandedState) return;
      this._expanded = newExpandedState;
      this._updateVisibility();
    }

    get expandable() {
      return this._expandable;
    }

    set expandable(value) {
      const newExpandableState = Boolean(value);
      if (this._expandable === newExpandableState) return;
      this._expandable = newExpandableState;
      this._updateVisibility();
    }

    _updateVisibility() {
      if (!this.arrowContainer || !this.trayContent || !this.arrowIcon) return;

      if (this._expandable) {
        this.arrowContainer.classList.remove("hidden");
        if (this._expanded) {
          this.trayContent.classList.add("expanded");
          this.arrowIcon.style.transform = "rotate(180deg)"; // Expanded (pointing right)
        } else {
          this.trayContent.classList.remove("expanded");
          this.arrowIcon.style.transform = "rotate(0deg)"; // Collapsed (pointing left)
        }
      } else {
        // Not expandable (e.g., maximized mode) - arrow is hidden, content is shown
        this.arrowContainer.classList.add("hidden");
        this.trayContent.classList.add("expanded"); 
        // Ensure arrow is in a sensible default state if it were to become visible again
        if (this.arrowIcon) this.arrowIcon.style.transform = "rotate(0deg)";
      }
    }

    // Public methods for GameScreen to control appearance
    show() {
      this.style.display = 'flex';
    }

    hide() {
      this.style.display = 'none';
    }

    setAppearance(mode) {
      if (mode === 'maximized' || mode === 'fullscreen') {
        this.expandable = false; // This will hide arrow, show content via _updateVisibility
        this.expanded = true;    // Ensure content is marked as expanded
      } else { // 'windowed'
        this.expandable = true;
        this.expanded = false;   // Always start collapsed when windowed
      }
    }

    async localize() {
      // Placeholder for localization if needed in the future
    }

    updateTheme(theme) {
      if (!theme) return;
      this.style.setProperty('--theme-primary', theme.primary);
      this.style.setProperty('--theme-secondary', theme.secondary);
      this.style.setProperty('--theme-hover-border', theme.hoverBorder);
      this.style.setProperty('--theme-shadow', theme.shadow);
      this.style.setProperty('--theme-box-background', theme.boxBackground);
      this.style.setProperty('--theme-settings-hover', theme.settingsHover);
    }
  });

  // Global UserTray manager
  window.UserTrayManager = {
    instance: null,
    
    create(theme) {
      if (this.instance) {
        this.destroy();
      }
      
      this.instance = document.createElement('ajd-user-tray');
      if (theme) {
        this.instance.updateTheme(theme);
      }
      document.body.appendChild(this.instance);
      
      return this.instance;
    },
    
    destroy() {
      if (this.instance && this.instance.parentNode) {
        this.instance.parentNode.removeChild(this.instance);
        this.instance = null;
      }
    },
    
    show() {
      if (this.instance) {
        this.instance.show();
      }
    },
    
    hide() {
      if (this.instance) {
        this.instance.hide();
      }
    },
    
    setAppearance(mode) {
      if (this.instance) {
        this.instance.setAppearance(mode);
      }
    }
  };
})();
