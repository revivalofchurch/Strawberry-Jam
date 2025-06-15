const { app, BrowserWindow, globalShortcut, shell, ipcMain, protocol, net, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs'); // Changed to import standard fs module
const fsPromises = fs.promises; // Alias for promises API
const crypto = require('crypto');
const { fork, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const os = require('os');
const processManager = require('../utils/ProcessManager');
// const keytar = require('keytar'); // Will be required in constructor

// Suppress Electron security warnings
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// Keytar service name for Leak Checker API Key
let KEYTAR_SERVICE_LEAK_CHECK_API_KEY;
const KEYTAR_ACCOUNT_LEAK_CHECK_API_KEY = 'leak_checker_api_key';
const MIGRATION_FLAG_LEAK_CHECK_API_KEY_V1 = 'leakCheckApiKeyMigratedToKeytar_v1';

const Patcher = require('./renderer/application/patcher');
const { getDataPath, getAssetsPath } = require('../Constants');
const logManager = require('../utils/LogManager');

const isDevelopment = process.env.NODE_ENV === 'development'

// Helper: Only log in development
function devLog(...args) {}
function devWarn(...args) {}
const USER_DATA_PATH = app.getPath('userData');
const STATE_FILE_PATH = path.join(USER_DATA_PATH, 'jam_state.json');

const STRAWBERRY_JAM_CLASSIC_BASE_PATH = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'strawberry-jam-classic')
  : process.platform === 'darwin'
    ? path.join('/', 'Applications', 'Strawberry Jam Classic.app', 'Contents')
    : undefined;

const schema = {
  network: {
    type: 'object',
    properties: {
      smartfoxServer: {
        type: 'string',
        default: 'lb-iss04-classic-prod.animaljam.com'
      },
      secureConnection: {
        type: 'boolean',
        default: true
      }
    },
    default: {}
  },
  ui: {
    type: 'object',
    properties: {
      promptOnExit: {
        type: 'boolean',
        default: true
      },
      hideGamePlugins: {
        type: 'boolean',
        default: false
      },
      performServerCheckOnLaunch: {
        type: 'boolean',
        default: true
      }
    },
    default: {}
  },
  logs: {
    type: 'object',
    properties: {
      consoleLimit: {
        type: 'number',
        default: 1000
      },
      networkLimit: {
        type: 'number',
        default: 1000
      }
    },
    default: {}
  },
  plugins: {
    type: 'object',
    properties: {
      usernameLogger: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', default: '' },
          outputDir: { type: 'string', default: '' },
          autoCheck: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: false },
              threshold: { type: 'number', default: 100 }
            },
            default: {}
          },
          collection: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: true },
              collectNearby: { type: 'boolean', default: true },
              collectBuddies: { type: 'boolean', default: true }
            },
            default: {}
          }
        },
        default: {}
      }
    },
    default: {}
  },
  updates: {
    type: 'object',
    properties: {
      enableAutoUpdates: {
        type: 'boolean',
        default: true
      }
    },
    default: {}
  }
};

const DEFAULT_APP_STATE = {
  leakCheck: {
    inputFilePath: null,
    lastProcessedIndex: -1,
    status: "idle"
  }
};

/**
 * Default window options.
 * @type {Object}
 * @constant
 */
const defaultWindowOptions = {
  title: 'Jam',
  backgroundColor: '#16171f',
  resizable: true,
  useContentSize: true,
  width: 840,
  height: 645,
  frame: false,
    webPreferences: {
    webSecurity: false,
    nativeWindowOpen: true,
    contextIsolation: false,
    enableRemoteModule: true,
    nodeIntegration: true,
    preload: path.resolve(__dirname, 'preload.js'),
    additionalArguments: ['--disable-electron-security-warnings']
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

class Electron {
  constructor () {
    this._window = null
    this._apiProcess = null
    this._store = new Store({ schema });
    this.keytar = require('keytar'); // Initialize keytar as an instance property

    const appNameForKeytar = app.getName();
    KEYTAR_SERVICE_LEAK_CHECK_API_KEY = `${appNameForKeytar}-leak-check-api-key`;

    // Handler registration moved to _onReady for later initialization.
    // global.console.log('[IPC Main CONSTRUCTOR Setup] DIAGNOSTIC: "get-main-log-path" handler registration REMOVED from constructor start.');

    this._migrateLeakCheckApiKeyToKeytar().catch(err => {
      console.error('[Migration] Error during leak check API key migration:', err);
    });

    this._patcher = null;
    this._isQuitting = false;
    this._isClearingCacheAndQuitting = false;
    this._savedWindowState = null;
    this._setupIPC() // Original call to setup other IPC handlers
    this.pluginWindows = new Map();
    this._backgroundPlugins = new Set();
    this.manualCheckInProgress = false; // Flag for manual update checks
  }

  _setupIPC () {
    // Original _setupIPC content starts here, the 'get-main-log-path' handler is now in the constructor
    ipcMain.on('open-directory', (event, filePath) => {
      if (!filePath) {
        return;
      }
      shell.openPath(filePath).catch(err => {
         if (event && event.sender && !event.sender.isDestroyed()) {
            event.sender.send('directory-open-error', { path: filePath, error: err.message });
         }
      });
    })

    ipcMain.on('window-close', () => {
      const shouldPrompt = this._store.get('ui.promptOnExit', true);
      
      if (shouldPrompt && this._window && !this._window.isDestroyed()) {
        this._window.webContents.send('show-exit-confirmation');
      } else {
        this._window.close();
      }
    })
    
    ipcMain.on('exit-confirmation-response', (event, { confirmed, dontAskAgain }) => {
      
      if (dontAskAgain) {
        this._store.set('ui.promptOnExit', false);
      }
      
      if (confirmed) {
        this._window.close();
      }
    })

    ipcMain.on('window-minimize', () => {
      if (this._window) {
        this._window.minimize();
        this._handleAppMinimized();
      }
    })
    
    ipcMain.on('window-toggle-fullscreen', () => {
      if (!this._window) return
      
      if (!this._window.isFullScreen()) {
        const bounds = this._window.getBounds()
        this._savedWindowState = {
          bounds,
          isMaximized: this._window.isMaximized()
        }
      }
      
      this._window.setFullScreen(!this._window.isFullScreen())
      
      this._window.webContents.send('fullscreen-changed', this._window.isFullScreen())
    })

    ipcMain.on('window-toggle-maximize', () => {
      if (!this._window) return
      
      if (this._window.isMaximized()) {
        this._window.unmaximize()
      } else {
        if (!this._savedWindowState) {
          this._savedWindowState = {
            bounds: this._window.getBounds(),
            isMaximized: false
          }
        }
        
        this._window.maximize()
      }
      
      this._window.webContents.send('maximize-changed', this._window.isMaximized())
    })

    ipcMain.on('open-settings', (_, url) => shell.openExternal(url))

    ipcMain.on('open-url', (_, url) => shell.openExternal(url))

    ipcMain.on('plugin-window-minimize', (event) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender)
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.minimize()
      } else {
      }
    })

    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('get-setting', async (event, key) => {
      try {
        if (key === 'plugins.usernameLogger.apiKey') {
          const apiKey = await this.keytar.getPassword(KEYTAR_SERVICE_LEAK_CHECK_API_KEY, KEYTAR_ACCOUNT_LEAK_CHECK_API_KEY);
          return apiKey || '';
        }
        const valueFromStore = this._store.get(key);
        return valueFromStore;
      } catch (error) {
        if (isDevelopment) {
        }
        // Ensure consistent return for the specific key on error, otherwise undefined
        return key === 'plugins.usernameLogger.apiKey' ? '' : undefined;
      }
    });

    ipcMain.handle('set-setting', async (event, key, value) => {
      try {
        if (key === 'plugins.usernameLogger.apiKey') {
          if (typeof value === 'string' && value.trim() !== '') {
            await this.keytar.setPassword(KEYTAR_SERVICE_LEAK_CHECK_API_KEY, KEYTAR_ACCOUNT_LEAK_CHECK_API_KEY, value);
          } else {
            await this.keytar.deletePassword(KEYTAR_SERVICE_LEAK_CHECK_API_KEY, KEYTAR_ACCOUNT_LEAK_CHECK_API_KEY);
          }
          return { success: true };
        }
        this._store.set(key, value);
        return { success: true };
      } catch (error) {
        if (isDevelopment) {
        }
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('select-output-directory', async (event) => {
      if (!this._window) {
        if (isDevelopment) console.error('[Dialog] Cannot show dialog, main window not available.');
        return { canceled: true, error: 'Main window not available' };
      }
      try {
        const result = await dialog.showOpenDialog(this._window, {
          properties: ['openDirectory', 'createDirectory'],
          title: 'Select Leak Check Output Directory'
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { canceled: true };
        } else {
          const selectedPath = result.filePaths[0];
          return { canceled: false, path: selectedPath };
        }
      } catch (error) {
        if (isDevelopment) console.error('[Dialog] Error showing open dialog:', error);
        return { canceled: true, error: error.message };
      }
    });

    ipcMain.handle('save-text-file', async (event, options) => {
      
      if (!this._window) {
        return { success: false, canceled: true };
      }
      
      try {
        const result = await dialog.showSaveDialog(this._window, {
          title: 'Save Report',
          defaultPath: options.suggestedFilename,
          filters: [
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
        
        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true };
        }
        
        await fsPromises.writeFile(result.filePath, options.content, 'utf-8');
        
        return { success: true, filePath: result.filePath };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.on('app-restart', () => {
      app.relaunch();
      app.exit(0);
    });


    // --- Leak Checker IPC (REMOVED) ---


    // --- App State IPC Handlers ---
    ipcMain.handle('get-app-state', (async () => {
        return this.getAppState();
    }).bind(this));

    ipcMain.handle('set-app-state', (async (event, newState) => {
        return this.setAppState(newState);
    }).bind(this));


    // --- Plugin State IPC Bridge ---
    ipcMain.handle('dispatch-get-state', async (event, key) => {
      if (this._isQuitting) {
        if (isDevelopment) console.warn(`[IPC Main] Denying 'dispatch-get-state' for key '${key}' because app is quitting.`);
        return Promise.reject(new Error('Application is shutting down. Cannot get state.'));
      }

      if (!this._window || !this._window.webContents || this._window.webContents.isDestroyed()) {
        if (isDevelopment) console.error(`[IPC Main] Cannot get state for key '${key}': Main window not available.`);
        return Promise.reject(new Error('Main window not available to get state.'));
      }

      const replyChannel = `get-state-reply-${crypto.randomUUID()}`;

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ipcMain.removeListener(replyChannel, listener);
          if (isDevelopment) console.error(`[IPC Main] Timeout waiting for reply on ${replyChannel} for key ${key}`);
          reject(new Error(`Timeout waiting for state response for key: ${key}`));
        }, 2000);

        const listener = (event, value) => {
          clearTimeout(timeout);
          resolve(value);
        };

        ipcMain.once(replyChannel, listener);

        if (this._window && this._window.webContents && !this._window.webContents.isDestroyed()) {
          this._window.webContents.send('main-renderer-get-state-async', { key, replyChannel });
        } else {
          clearTimeout(timeout);
          ipcMain.removeListener(replyChannel, listener);
          if (isDevelopment) console.error(`[IPC Main] Main window webContents destroyed before sending 'main-renderer-get-state-async' for key '${key}'.`);
          reject(new Error('Main window became unavailable before state request could be sent.'));
        }
      });
    });

    // --- Renderer Ready Listener (for Auto-Resume) ---
    ipcMain.once('renderer-ready', (async () => {
    }).bind(this));

    // --- Danger Zone IPC Handlers ---
    ipcMain.handle('danger-zone:clear-cache', async () => {
      const continueClear = await this._confirmNoOtherInstances('clear the cache');
      if (!continueClear) {
        return { success: false, message: 'Cache clearing cancelled by user.' };
      }

      try {
        await session.defaultSession.clearCache();
        await session.defaultSession.clearStorageData({ storages: ['cookies', 'localstorage'] });

        const cachePaths = this._getCachePaths();
        if (!cachePaths || cachePaths.length === 0) {
        } else {
          const helperScriptPath = path.join(__dirname, 'clear-cache-helper.js');

           let resolvedHelperPath;
           if (app.isPackaged) {
             resolvedHelperPath = path.join(process.resourcesPath, 'clear-cache-helper.js');
           } else {
             resolvedHelperPath = helperScriptPath;
           }

           try {
               await fsPromises.access(resolvedHelperPath);

               const child = spawn('node', [resolvedHelperPath, ...cachePaths], {
                 detached: true,
                 stdio: 'ignore'
               });
               processManager.add(child);
               child.on('error', (err) => { });
               child.unref();
           } catch (accessError) {
           }
        }

        app.quit();
        return { success: true, message: 'Internal cache cleared. External cache clearing scheduled. Application will close.' };

      } catch (error) {
        dialog.showMessageBoxSync(this._window, {
          type: 'error',
          title: 'Clear Cache Error',
          message: `Failed to initiate cache clearing: ${error.message}`,
          buttons: ['OK']
        });
        return { success: false, error: error.message };
      }

      this._isClearingCacheAndQuitting = true;
      app.quit();
      return { success: true, message: 'Cache clearing initiated. Application will close.' };

    });

    ipcMain.handle('danger-zone:uninstall', async () => {
      const continueUninstall = await this._confirmNoOtherInstances('uninstall Strawberry Jam');
      if (!continueUninstall) {
        return { success: false, message: 'Uninstall cancelled by user.' };
      }

      try {
        const uninstallerPath = this._getUninstallerPath();
        if (!uninstallerPath) {
          throw new Error('Uninstaller path could not be determined for this OS.');
        }

        await fsPromises.access(uninstallerPath);

        const child = spawn(uninstallerPath, [], {
          detached: true,
          stdio: 'ignore'
        });
        processManager.add(child);
        child.unref();


        app.quit();
        return { success: true };

      } catch (error) {
        const errorMsg = error.code === 'ENOENT' ? 'Uninstaller executable not found.' : error.message;
        dialog.showMessageBoxSync(this._window, {
          type: 'error',
          title: 'Uninstall Error',
          message: `Failed to start uninstaller: ${errorMsg}`,
          buttons: ['OK']
        });
        return { success: false, error: errorMsg };
      }
    });

    ipcMain.on('open-plugin-window', this._handleOpenPluginWindow.bind(this));

    ipcMain.handle('get-os-info', async () => {
      return {
        platform: process.platform,
        release: os.release(),
        arch: process.arch
      };
    });

    ipcMain.handle('get-enabled-plugins', async () => {
      try {
        const plugins = [];
        const pluginsPath = path.join(app.getPath('userData'), 'plugins');
        
        if (fs.existsSync(pluginsPath)) {
          const pluginDirs = fs.readdirSync(pluginsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
          
          for (const dir of pluginDirs) {
            const configPath = path.join(pluginsPath, dir, 'plugin.json');
            
            if (fs.existsSync(configPath)) {
              try {
                const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                
                if (configData.enabled !== false) {
                  plugins.push({
                    name: configData.name || dir,
                    version: configData.version || 'unknown',
                    author: configData.author || 'unknown'
                  });
                }
              } catch (err) {
                try {
                  logManager.error(`Error reading plugin config for ${dir}: ${err.message}`);
                } catch (logErr) {
                }
              }
            }
          }
        }
        
        return plugins;
      } catch (error) {
        try {
          logManager.error('Error getting enabled plugins:', error.message);
        } catch (logErr) {
        }
        return [];
      }
    });

    ipcMain.handle('get-cache-size', async () => {
      const cachePaths = this._getCachePaths();
      const sizes = { total: 0, directories: {} };

      try {
        const calculateDirSize = async (dirPath) => {
          let size = 0;
          
          try {
            await fsPromises.access(dirPath);
          } catch (error) {
            return 0;
          }

          const files = await fsPromises.readdir(dirPath, { withFileTypes: true });
          
          for (const file of files) {
            const filePath = path.join(dirPath, file.name);
            
            if (file.isDirectory()) {
              size += await calculateDirSize(filePath);
            } else {
              try {
                const stats = await fsPromises.stat(filePath);
                size += stats.size;
              } catch (error) {
              }
            }
          }
          
          return size;
        };

        for (const cachePath of cachePaths) {
          try {
            const dirName = path.basename(cachePath);
            const size = await calculateDirSize(cachePath);
            sizes.directories[dirName] = size;
            sizes.total += size;
          } catch (error) {
            sizes.directories[path.basename(cachePath)] = 0;
          }
        }

        return sizes;
      } catch (error) {
        return { total: 0, directories: {} };
      }
    });

    ipcMain.on('direct-close-window', () => {
      if (this._window && !this._window.isDestroyed()) {
        this._window.close();
      }
    });

    // Handler for logs from winapp.asar (game client)
    ipcMain.on('winapp-generate-report', (event, reportData) => {
      if (reportData && reportData.logs) {
        logManager.addGameClientLogs(reportData.logs);
        // Optionally, send a confirmation back if LoginScreen.js were to use invoke
        // event.reply('winapp-report-received', { status: 'success' });
      } else {
      }
    });

    ipcMain.handle('get-username-logger-counts', async (event) => {
      try {
        const pluginWindowEntry = Array.from(this.pluginWindows.entries()).find(([name, win]) => name === 'Username Logger');
        
        if (!pluginWindowEntry) {
          // Return a default/empty state or null, as rejecting might still cause unhandled promise issues higher up if not caught.
          return null;
        }
        const pluginWindow = pluginWindowEntry[1];

        if (!pluginWindow || pluginWindow.isDestroyed() || !pluginWindow.webContents || pluginWindow.webContents.isDestroyed()) {
          return null;
        }

        // Ensure the function is available on the plugin's window object
        const isFunctionAvailable = await pluginWindow.webContents.executeJavaScript('typeof window.getUsernameLoggerCounts === "function"');
        if (!isFunctionAvailable) {
          return null;
        }
        
        const counts = await pluginWindow.webContents.executeJavaScript('window.getUsernameLoggerCounts();');
        return counts;
      } catch (error) {
        // Return null or a default error object instead of rejecting, to prevent unhandled rejections if the caller doesn't catch.
        return null;
      }
    });

    // The 'get-main-log-path' handler was moved to the constructor.
    // The diagnostic global.console.log that was here is also effectively moved.

    ipcMain.on('plugin-settings-updated', (event) => {
      if (this._window && this._window.webContents && !this._window.webContents.isDestroyed()) {
        this._window.webContents.send('broadcast-plugin-settings-updated');
      }
    });

    ipcMain.on('check-for-updates', () => {
      this.manualCheckInProgress = true; // Set flag
      autoUpdater.checkForUpdates().catch(err => {
        if (this._window && this._window.webContents && !this._window.isDestroyed()) {
          // Send error status back to renderer via the new manual-update-check-status channel
          this._window.webContents.send('manual-update-check-status', { status: 'error', message: `Manual update check failed: ${err.message}` });
        }
        this.manualCheckInProgress = false; // Reset flag on error
      });
    });

    ipcMain.on('launch-game-client', () => {
      const exePath = process.platform === 'win32'
        ? path.join(STRAWBERRY_JAM_CLASSIC_BASE_PATH, 'AJ Classic.exe')
        : process.platform === 'darwin'
          ? path.join(STRAWBERRY_JAM_CLASSIC_BASE_PATH, 'MacOS', 'AJ Classic')
          : undefined;

      if (!exePath || !fs.existsSync(exePath)) {
        logManager.error(`[Process] Game client executable not found at: ${exePath}`);
        dialog.showErrorBox('Launch Error', `Could not find the game client executable. Please ensure it is installed correctly at:\n${exePath}`);
        return;
      }

      const dataPath = getDataPath(app);
      const spawnEnv = {
        ...process.env,
        STRAWBERRY_JAM_DATA_PATH: dataPath
      };

      try {
        const gameProcess = spawn(exePath, [], {
          detached: false,
          stdio: 'ignore',
          env: spawnEnv
        });

        processManager.add(gameProcess);

        gameProcess.on('close', (code) => {
          logManager.log(`Game client process exited with code: ${code}`, 'main', logManager.logLevels.INFO);
        });

        gameProcess.on('error', (err) => {
          logManager.error(`[Process] Error with game client process: ${err.message}`);
        });
      } catch (error) {
        logManager.error(`[Process] Failed to spawn game client process: ${error.message}`);
        dialog.showErrorBox('Launch Error', `Failed to start the game client process:\n${error.message}`);
      }
    });
  }

  async _migrateLeakCheckApiKeyToKeytar() {
    if (this._store.get(MIGRATION_FLAG_LEAK_CHECK_API_KEY_V1)) {
      return;
    }

    const oldApiKey = this._store.get('leakCheck.apiKey');

    if (oldApiKey && typeof oldApiKey === 'string' && oldApiKey.trim() !== '') {
      try {
        await this.keytar.setPassword(KEYTAR_SERVICE_LEAK_CHECK_API_KEY, KEYTAR_ACCOUNT_LEAK_CHECK_API_KEY, oldApiKey);
        this._store.set('leakCheck.apiKey', '');
        this._store.set(MIGRATION_FLAG_LEAK_CHECK_API_KEY_V1, true);
      } catch (err) {
        if (isDevelopment) console.error(`[Migration LeakCheck][Keytar] Stack: ${err.stack}`);
      }
    } else {
      this._store.set(MIGRATION_FLAG_LEAK_CHECK_API_KEY_V1, true);
    }
  }

  _handleOpenPluginWindow(event, { url, name, pluginPath }) {
    
    const existingWindow = this.pluginWindows.get(name);
    if (existingWindow && !existingWindow.isDestroyed()) {
      
      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }
      
      existingWindow.focus();
      
      if (this._window && this._window.webContents && !this._window.isDestroyed()) {
        this._window.webContents.send('plugin-window-focused', name);
      }
      
      return;
    }
    
    const isDev = process.env.NODE_ENV === 'development';

    const configPath = path.join(pluginPath, 'plugin.json');
    let runInBackground = false;
    
    try {
      if (fs.existsSync(configPath)) {
        const pluginConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        runInBackground = pluginConfig.runInBackground === true;
        
        if (runInBackground) {
          this._backgroundPlugins.add(name);
        }
      }
    } catch (err) {
    }

    const pluginWindow = new BrowserWindow({
      ...defaultWindowOptions,
      title: name,
      width: 800,
      height: 600,
      frame: false,
      webPreferences: {
        ...defaultWindowOptions.webPreferences,
        devTools: true, 
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: !runInBackground 
      }
    });

    pluginWindow.webContents.on('console-message', (event, level, message) => {
      if (message.includes('%cElectron Security Warning') || 
          message.startsWith('Electron Security Warning')) {
        event.preventDefault();
        return;
      }
      
      if (message.includes('InvisibleToggle:') || 
          message.includes('InvisibleToggle loaded.')) {
        event.preventDefault();
        return;
      }
    });

    pluginWindow.loadURL(url);

    pluginWindow.webContents.on('did-finish-load', () => {
      pluginWindow.focus();

      pluginWindow.webContents.executeJavaScript(`
        (function() {
          if (!window.jQuery) {
            var jQueryScript = document.createElement('script');
            jQueryScript.src = "https://code.jquery.com/jquery-3.6.0.min.js";
            jQueryScript.onload = function() {
              if (process.env.NODE_ENV === 'development') console.log("[Plugin Window] jQuery injected:", typeof window.$);
              
              if (typeof window.$.ui === 'undefined') { 
                var jQueryUIScript = document.createElement('script');
                jQueryUIScript.src = "https://ajax.googleapis.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js";
                jQueryUIScript.onload = function() {
                  if (process.env.NODE_ENV === 'development') console.log("[Plugin Window] jQuery UI injected.");
                };
                document.head.appendChild(jQueryUIScript);
              }
            };
            document.head.appendChild(jQueryScript);
          }
        })();
      `).then(() => {
          pluginWindow.webContents.executeJavaScript(`
            try {
              const { ipcRenderer } = require('electron');
              
              window.jam = window.jam || {};

              const dispatchObj = {
                sendRemoteMessage: function(msg) {
                  ipcRenderer.send('send-remote-message', msg);
                },
                sendConnectionMessage: function(msg) {
                  ipcRenderer.send('send-connection-message', msg);
                },
                getState: function(key) {
                  return ipcRenderer.invoke('dispatch-get-state', key);
                },
                getStateSync: function(key) {
                  return ipcRenderer.sendSync('dispatch-get-state-sync', key);
                },
                runInBackground: ${runInBackground}
              };

              const applicationObj = {
                consoleMessage: function(type, msg) {
                  if (process.env.NODE_ENV === 'development') console.log("[Plugin App Console] " + type + ": " + msg); 
                  ipcRenderer.send('console-message', { type, msg });
                }
              };

              window.jam.dispatch = dispatchObj;
              window.jam.application = applicationObj;

              window.jam.isAppMinimized = false;

              window.dispatchEvent(new CustomEvent('jam-ready'));
            } catch (err) {
              if (process.env.NODE_ENV === 'development') console.error("[Plugin Window] Error setting up window.jam:", err);
            }
          `);
      });
    });

    this.pluginWindows.set(name, pluginWindow);
    if (this._window && this._window.webContents && !this._window.isDestroyed()) {
      this._window.webContents.send('plugin-window-opened', name);
    }

    pluginWindow.on('closed', () => {
      if (!this._isQuitting) {
        if (this._window && !this._window.isDestroyed() && this._window.webContents && !this._window.webContents.isDestroyed()) {
          this._window.webContents.send('plugin-window-closed', name);
        }
      }
      this.pluginWindows.delete(name);
      this._backgroundPlugins.delete(name);
    });

    pluginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    });
  } 

  async getAppState() {
    try {
      await fsPromises.access(STATE_FILE_PATH);
      const data = await fsPromises.readFile(STATE_FILE_PATH, 'utf-8');
      const currentState = JSON.parse(data);
      const mergedState = {
        ...DEFAULT_APP_STATE,
        ...currentState,
        leakCheck: { ...DEFAULT_APP_STATE.leakCheck, ...(currentState.leakCheck || {}) }
      };
      return mergedState;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return JSON.parse(JSON.stringify(DEFAULT_APP_STATE));
      }
      return JSON.parse(JSON.stringify(DEFAULT_APP_STATE));
    }
  }

  async setAppState(newState) {
     try {
       await fsPromises.mkdir(USER_DATA_PATH, { recursive: true });
       await fsPromises.writeFile(STATE_FILE_PATH, JSON.stringify(newState, null, 2), 'utf-8');
       return { success: true };
     } catch (error) {
       return { success: false, error: error.message };
     }
   }

  async _confirmNoOtherInstances(actionDescription) {
    const gotTheLock = app.requestSingleInstanceLock();
    if (gotTheLock) {
      app.releaseSingleInstanceLock();
      return true; 
    } else {
      const choice = await dialog.showMessageBox(this._window, {
        type: 'warning',
        title: 'Multiple Instances Detected',
        message: `It looks like another Strawberry Jam window is open.\n\nPlease close all other Strawberry Jam windows before attempting to ${actionDescription}.`,
        buttons: ['Cancel', 'I have closed other windows'],
        defaultId: 0, 
        cancelId: 0
      });
      return choice.response === 1; 
    }
  }
  _getCachePaths() {
    const cachePaths = [];

    if (process.platform === 'win32') {
      // Clear the full Strawberry Jam app data directory
      const appDataPath = app.getPath('appData');
      cachePaths.push(path.join(appDataPath, 'strawberry-jam'));
      
      // Clear the AJ Classic directory
      cachePaths.push(path.join(appDataPath, 'AJ Classic'));
      
    } else if (process.platform === 'darwin') {
      // macOS paths
      const homeDir = app.getPath('home');
      const libraryPath = path.join(homeDir, 'Library', 'Application Support');
      cachePaths.push(path.join(libraryPath, 'strawberry-jam'));
      cachePaths.push(path.join(libraryPath, 'AJ Classic'));
      
    } else {
    }

    return cachePaths;
  }
  async _clearAppCache() {
    const cachePaths = this._getCachePaths();

    let errors = [];
    for (const cachePath of cachePaths) {
      try {
        await fsPromises.rm(cachePath, { recursive: true, force: true });
      } catch (error) {
        if (error.code === 'ENOENT') {
        } else {
          console.error(`[Cache Clear Method] Failed to delete ${cachePath}:`, error);
          errors.push(`Failed to delete ${path.basename(cachePath)}: ${error.message}`);
        }
      }
    }

    if (errors.length > 0) {
      console.error('[Cache Clear Method] Finished with errors:', errors.join('; '));
    } else {
    }
  }

  _getUninstallerPath() {
    if (process.platform === 'win32') {
      const localAppData = app.getPath('localAppData');
      return path.join(localAppData, 'Programs', 'strawberry-jam', 'Uninstall strawberry-jam.exe');
    } else if (process.platform === 'darwin') {
      return null;
    } else {
        return null;
      }
    }
  
  
    create () {
      const consoleLimit = this._store.get('logs.consoleLimit', 1000);
      const networkLimit = this._store.get('logs.networkLimit', 1000);
  
      logManager.initialize({
        appDataPath: app.getPath('userData'),
        maxMemoryLogs: consoleLimit
      });
  
      const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn
      };
  
      console.log = (message) => logManager.log(message, 'main', logManager.logLevels.INFO);
      console.error = (message) => logManager.log(message, 'main', logManager.logLevels.ERROR);
      console.warn = (message) => logManager.log(message, 'main', logManager.logLevels.WARN);
  
      app.whenReady().then(async () => {
        // Try to clear any problematic cache state early to prevent hangs
      try {
        await session.defaultSession.clearCache().catch(err => {
        });
      } catch (error) {
      }

      protocol.handle('app', (request) => {
        const url = request.url.slice('app://'.length);
        const assetsPath = getAssetsPath(app);
        let filePath;
      
        if (url.startsWith('assets/')) {
          filePath = path.join(assetsPath, url.substring('assets/'.length));
        } else {
          filePath = path.normalize(`${__dirname}/../../${url}`);
        }
      
        return net.fetch(`file://${filePath}`);
      });

      // Call _onReady which will now also register the IPC handler
      this._onReady()
      
      if (this._window) {
        this._window.on('enter-full-screen', () => {
          this._window.webContents.send('fullscreen-changed', true)
        })
        
        this._window.on('leave-full-screen', () => {
          this._window.webContents.send('fullscreen-changed', false)
          
          if (this._savedWindowState) {
            this._window.setBounds(this._savedWindowState.bounds)
            
            if (this._savedWindowState.isMaximized) {
              this._window.maximize()
            }
          }
        })
        
        this._window.on('maximize', () => {
          this._window.webContents.send('maximize-changed', true)
        })
        
        this._window.on('unmaximize', () => {
          this._window.webContents.send('maximize-changed', false)
        })
        
        this._window.on('minimize', () => {
          this._handleAppMinimized();
        })
        
        this._window.on('restore', () => {
          this._handleAppRestored();
        })
        
        this._window.on('focus', () => {
          this._handleAppRestored();
        })
      }
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })


    return this
  }

  _registerShortcut (key, callback) {
    globalShortcut.register(key, callback)
  }

  _createWindow ({ url, frameName }) {
    if (frameName === 'external') {
      shell.openExternal(url)
      return { action: 'deny' }
    }

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        ...defaultWindowOptions,
        autoHideMenuBar: true,
        frame: true,
        webPreferences: {
          ...defaultWindowOptions.webPreferences
        }
      }
    }
  }

  _initAutoUpdater () {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'glvckoma',
      repo: 'Strawberry-Jam'
    });
    const enableAutoUpdates = this._store.get('updates.enableAutoUpdates', true);

    autoUpdater.autoDownload = enableAutoUpdates; // Set based on setting
    autoUpdater.allowDowngrade = true
    autoUpdater.allowPrerelease = false

    if (enableAutoUpdates) {
      const checkInterval = 1000 * 60 * 5;
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
          // Optionally send an IPC message to renderer about this specific error
          if (this._window && this._window.webContents && !this._window.isDestroyed()) {
            this._window.webContents.send('app-update-status', { status: 'error', message: `Scheduled update check failed: ${err.message}` });
          }
        });
      }, 5000);
      setInterval(() => {
        autoUpdater.checkForUpdates().catch(err => {
          if (this._window && this._window.webContents && !this._window.isDestroyed()) {
            this._window.webContents.send('app-update-status', { status: 'error', message: `Scheduled update check failed: ${err.message}` });
          }
        });
      }, checkInterval);
    }

    autoUpdater.on('checking-for-update', () => {
      if (this.manualCheckInProgress && this._window && this._window.webContents && !this._window.isDestroyed()) {
        this._window.webContents.send('manual-update-check-status', { status: 'checking', message: 'Checking for updates...' });
      }
      // Global toast via 'app-update-status' removed
    })

    autoUpdater.on('update-not-available', (info) => {
      if (this.manualCheckInProgress && this._window && this._window.webContents && !this._window.isDestroyed()) {
        this._window.webContents.send('manual-update-check-status', { status: 'no-update', message: 'No new updates available.' });
        this.manualCheckInProgress = false; // Reset flag
      }
      // Global toast via 'app-update-status' removed
    })

    autoUpdater.on('error', (err) => {
      if (this.manualCheckInProgress && this._window && this._window.webContents && !this._window.isDestroyed()) {
        this._window.webContents.send('manual-update-check-status', { status: 'error', message: `Error checking for updates: ${err.message}` });
        this.manualCheckInProgress = false; // Reset flag
      }
      // Global toast via 'app-update-status' removed
    })

    autoUpdater.on('update-available', (info) => {
      const messageText = autoUpdater.autoDownload
        ? 'A new update is available. Downloading now...' // This will only happen if enableAutoUpdates is true
        : 'A new update is available. Click "Update Now" to download.'; // For manual checks or if autoDownload is off
      if (this.manualCheckInProgress && this._window && this._window.webContents && !this._window.isDestroyed()) {
        this._window.webContents.send('manual-update-check-status', { status: 'available', message: messageText, version: info.version });
        // Do not reset manualCheckInProgress here, wait for download or error
      }
      // Global toast via 'app-update-status' removed
    })

    autoUpdater.on('update-downloaded', (info) => {
      if (this.manualCheckInProgress && this._window && this._window.webContents && !this._window.isDestroyed()) {
        this._window.webContents.send('manual-update-check-status', { status: 'downloaded', message: 'Update downloaded. Click "Restart Now" to install.' });
        this.manualCheckInProgress = false; // Reset flag
      }
      // Global toast via 'app-update-status' removed
    })
  }

  messageWindow (type, message = {}) {
    if (this._window && this._window.webContents) {
      this._window.webContents.send(type, message)
    }
  }

  async _onReady () {
    // --- REGISTER IPC HANDLER HERE using ipcMain.on and event.sender.send ---
    ipcMain.on('request-main-log-path', (event) => { // Listening for the request
      const pathToSend = (logManager && logManager.logPath) ? logManager.logPath : "dummy/path/from/_onReady/sender_send_handler";
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('response-main-log-path', pathToSend); // Sending reply on new channel
      } else {
      }
    });
    // --- END IPC HANDLER REGISTRATION ---

    this._patcher = new Patcher(null, getAssetsPath(app));
    const windowOptions = {
      ...defaultWindowOptions,
      icon: path.join(getAssetsPath(app), 'images', 'icon.png')
    };
    
    this._window = new BrowserWindow(windowOptions);
    
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    const newWidth = Math.floor(width * 0.57);  
    const newHeight = Math.floor(height * 0.8);
    
    const x = Math.floor((width - newWidth) / 2);
    const y = Math.floor((height - newHeight) / 2);
    
    this._window.setBounds({
      x,
      y,
      width: newWidth,
      height: newHeight
    });
    
    this._window.webContents.on('console-message', (event, level, message) => {
      if (message.includes('%cElectron Security Warning') || 
          message.startsWith('Electron Security Warning')) {
        event.preventDefault();
        return;
      }
      
      if (message.includes('InvisibleToggle:') || 
          message.includes('InvisibleToggle loaded.')) {
        event.preventDefault();
        return;
      }
    });
    
    const dataPath = getDataPath(app);
    
    // Note: loadFile is already promise-based, no fsPromises needed here.
    await this._window.loadFile(path.join(__dirname, 'renderer', 'index.html'))

    const assetsPath = getAssetsPath(app)
    
    this._window.webContents.send('set-data-path', dataPath)
    this._window.webContents.send('set-assets-path', assetsPath)
    
    this._window.webContents.setWindowOpenHandler((details) => this._createWindow(details))

    this._window.on('closed', () => {
      const mainWindowId = this._window ? this._window.id : -1; // Should be null here, but good for clarity

      let closedCount = 0;
      BrowserWindow.getAllWindows().forEach(win => {
        // Check if it's not the main window (which is already closing/closed)
        // and ensure it's not already destroyed.
        if (win && typeof win.id === 'number' && win.id !== mainWindowId && !win.isDestroyed()) {
          try {
            win.destroy(); // More forceful than close()
            closedCount++;
          } catch (e) {
            console.error(`[Main Window Closed] Error destroying plugin window ${win.getTitle()}:`, e);
          }
        }
      });

      if (this.pluginWindows) {
        this.pluginWindows.clear();
      }
      if (this._backgroundPlugins) {
        this._backgroundPlugins.clear();
      }
      
      this._window = null;
    });

    try {
      const dataPath = getDataPath(app);
      await fsPromises.mkdir(dataPath, { recursive: true });
    } catch (error) {
      dialog.showErrorBox('Startup Error', `Failed to create base data directory. Some features might not work correctly.\n\nError: ${error.message}`);
    }    if (app.isPackaged) {
      const dataPath = getDataPath(app);
      const filesToEnsure = [
        'working_accounts.txt',
        'collected_usernames.txt',
        'processed_usernames.txt',
        'potential_accounts.txt',
        'found_accounts.txt',
        'ajc_accounts.txt'
      ];

      try {
        await fsPromises.mkdir(dataPath, { recursive: true });

        // Create all files in parallel for better performance
        const fileCreationPromises = filesToEnsure.map(async (filename) => {
          const filePath = path.join(dataPath, filename);
          try {
            await fsPromises.access(filePath);
          } catch (accessError) {
            if (accessError.code === 'ENOENT') {
              await fsPromises.writeFile(filePath, '', 'utf-8');
            } else {
            }
          }
        });

        // Wait for all file operations to complete, but with a timeout
        await Promise.all(fileCreationPromises).catch((error) => {
        });
      } catch (error) {
        dialog.showErrorBox('Startup Error', `Failed to create necessary data files in ${dataPath}. Some features might not work correctly.\n\nError: ${error.message}`);
      }    }
    
    // Fork API process with timeout and error handling
    try {
      this._apiProcess = fork(path.join(__dirname, '..', 'api', 'index.js'), [], {
        silent: false // Allow child process to log to console
      });
      processManager.add(this._apiProcess);

      // Set up API process event handlers
      this._apiProcess.on('error', (error) => {
      });

      this._apiProcess.on('exit', (code, signal) => {
        if (code !== 0) {
        }
      });

      // Give API process a moment to start, but don't block the main startup
      setTimeout(() => {
        if (this._apiProcess && !this._apiProcess.killed) {
        }
      }, 1000);
      
    } catch (error) {
      // Continue startup even if API process fails - most functionality doesn't depend on it
    }

    if (isDevelopment) {
      this._registerShortcut('F11', () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow && focusedWindow.webContents) {
          focusedWindow.webContents.toggleDevTools();
        }
      })
    }


    // Always initialize the auto-updater to set feed URL and listeners.
    // _initAutoUpdater internally respects 'updates.enableAutoUpdates' for scheduling automatic checks.
    this._initAutoUpdater();

    // Then, if performServerCheckOnLaunch is true, trigger an initial check.
    const performServerCheckOnLaunch = this._store.get('ui.performServerCheckOnLaunch', true);
    if (performServerCheckOnLaunch) {
      autoUpdater.checkForUpdates().catch(err => {
        // No global toast here. Console log is sufficient for background checks.
      });
    }
  }

  _handleAppMinimized() {
    this.pluginWindows.forEach((window, name) => {
      if (!window.isDestroyed()) {
        try {
          window.webContents.executeJavaScript('window.jam.isAppMinimized = true;');
          
          if (this._backgroundPlugins.has(name)) {
            this._enableBackgroundProcessing(window, name);
          }
        } catch (err) {
        }
      }
    });
    
    this._window.webContents.send('app-minimized');
  }
  
  _enableBackgroundProcessing(window, name) {
    
    try {
      if (window.webContents && !window.webContents.isDestroyed()) {
        window.webContents.backgroundThrottling = false;
      }
      
      window.webContents.executeJavaScript(`
        (function() {
          if (!window._backgroundKeepAliveInterval) {
            window._backgroundKeepAliveInterval = setInterval(() => {
              if (typeof window.jam !== 'undefined' && window.jam.dispatch && window.jam.dispatch.runInBackground) {
                window.dispatchEvent(new CustomEvent('jam-background-tick', {
                  detail: { timestamp: Date.now() }
                }));
                
                if (Date.now() % 10000 < 1000) {
                }
              }
            }, 1000);
            
          }
        })();
      `).catch(err => {
      });
    } catch (err) {
    }
  }

  _handleAppRestored() {
    this.pluginWindows.forEach((window, name) => {
      if (!window.isDestroyed()) {
        try {
          window.webContents.executeJavaScript('window.jam.isAppMinimized = false;');
          
          window.webContents.executeJavaScript(`
            window.dispatchEvent(new CustomEvent('jam-foreground', {
              detail: { timestamp: Date.now() }
            }));
          `).catch(err => {
          });
        } catch (err) {
        }
      }
    });
    
    this._window.webContents.send('app-restored');
  }
}

// This was the old location of the _setupIPC() internal 'get-main-log-path' handler.
// It's now registered directly in _onReady.

ipcMain.on('packet-event', (event, packetData) => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(win => {
    try {
      if (win && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send('packet-event', packetData);
      }
    } catch (e) {
    }
  });
});

ipcMain.on('plugin-remote-message', (event, msg) => { // Changed channel name here
  const mainWindow = BrowserWindow.getAllWindows().find(win =>
    win.webContents && !win.webContents.isDestroyed() && win.webContents.getURL().includes('renderer/index.html')
  );
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('plugin-remote-message', msg); // Forwarding channel remains the same
  } else {
  }
});

ipcMain.on('send-connection-message', (event, msg) => {
  const mainWindow = BrowserWindow.getAllWindows().find(win =>
    win.webContents.getURL().includes('renderer/index.html')
  );
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('plugin-connection-message', msg);
  }
});

ipcMain.on('console-message', (event, { type, msg }) => {
});

ipcMain.on('dispatch-get-state-sync', (event, key) => {
  const mainWindow = BrowserWindow.getAllWindows().find(win =>
    win.webContents.getURL().includes('renderer/index.html')
  );

  if (!mainWindow || !mainWindow.webContents) {
    event.returnValue = null;
    return;
  }

  if (key === 'room') {
    if (global.cachedRoomState !== undefined) {
      event.returnValue = global.cachedRoomState;
    } else {
      event.returnValue = null;
    }
  } else {
    event.returnValue = null;
  }
});

ipcMain.on('update-room-state', (event, roomState) => {
  global.cachedRoomState = roomState;
});

module.exports = Electron
