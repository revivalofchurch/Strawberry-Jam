# Future Ideas & Tasks

## I. Codebase & Performance Enhancements

1.  **Create `modularization-list.md`:**
    *   **Rule:** Before any file modularization, create a `.bak` or copy of the original file. This allows for checking modularized files against the original singular file to ensure functionality.
    *   Find all files within the project (e.g., in `@src` and `@plugins`) that are above 600 lines of code.
    *   List these files in `modularization-list.md`, ordered from the fewest lines to the most lines of code.
    *   For each file, add details of its code/function structure and how the file operates.

2.  **Memory Leak Investigation:**
    *   Check for memory leaks across the `@src` files.
    *   Check for memory leaks across `@extracted-winapp-public` files.

3.  **Backend Logic Optimization:**
    *   Review and improve backend application logic for enhanced performance across the two Electron processes (main and renderer, and any forked processes like the API).

 
2.  **Full-Den Screenshot Tool:**
    *   Add an option to capture a single screenshot of the entire den, regardless of screen size or zoom level.
    *   Implement as a one-click action or a dedicated shortcut key to export the full den view.
    *   **Plan:**
        1.  **Trigger Mechanism:**
            *   Add a new UI element (button) in the game's interface or main application shell that sends an IPC message (e.g., `ipcRenderer.send('request-full-den-screenshot')`) to the main process ([`assets/extracted-winapp-public/index.js`](assets/extracted-winapp-public/index.js:39)).
            *   Alternatively, register a `globalShortcut` in [`assets/extracted-winapp-public/index.js`](assets/extracted-winapp-public/index.js:39) (e.g., `Ctrl+Shift+S`).
        2.  **Capture Strategy (Main Process: [`assets/extracted-winapp-public/index.js`](assets/extracted-winapp-public/index.js:39)):**
            *   **Option A (Preferred for accuracy - Requires Renderer Collaboration):**
                *   The renderer process (game client) generates a full-resolution image of the den (e.g., using a library like `html2canvas` or internal game rendering logic to capture all content, including off-screen parts) and sends it as a data URL via IPC to the main process (e.g., `win.webContents.send('full-den-image-data', dataUrl)` or `ipcRenderer.invoke` for a response).
            *   **Option B (Main Process Capture - May have limitations):**
                *   If the game is in a `<webview>`, get its webContents: `const gameWebContents = webview.getWebContents();`
                *   Use `gameWebContents.capturePage()`. To get the "full den," this might involve:
                    *   Querying the renderer for the den's full scrollWidth/scrollHeight.
                    *   Temporarily resizing the webview to those dimensions (if feasible and not too disruptive), capturing, then reverting. This is complex.
                    *   *Note:* `capturePage()` without arguments captures the visible area.
        3.  **Image Handling in Main Process:**
            *   On receiving the IPC message (e.g., `ipcMain.on('request-full-den-screenshot', async () => { ... })` or handling data from renderer).
            *   If data URL received: `const nativeImage = require('electron').nativeImage.createFromDataURL(imageDataUrl);`
            *   If using `capturePage()`: `const nativeImage = await gameWebContents.capturePage(rect);` (where `rect` might define the full den area if known).
        4.  **Save Dialog and File Output:**
            *   Use `dialog.showSaveDialog()` to prompt the user for a save location:
              ```javascript
              const { filePath, canceled } = await dialog.showSaveDialog(win, {
                title: 'Save Full Den Screenshot',
                defaultPath: `full-den-screenshot-${Date.now()}.png`,
                filters: [{ name: 'Images', extensions: ['png', 'jpg'] }]
              });
              if (!canceled && filePath) {
                const imageBuffer = nativeImage.toPNG(); // or toJPEG()
                try {
                  await fsPromises.writeFile(filePath, imageBuffer); // fsPromises from index.js
                  log('info', `Full den screenshot saved: ${filePath}`);
                  shell.showItemInFolder(filePath); // shell from index.js
                } catch (err) {
                  log('error', `Failed to save full den screenshot: ${err}`);
                  dialog.showErrorBox('Save Error', 'Could not save screenshot.');
                }
              }
              ```
        5.  **Shortcut Management (If applicable):**
            *   Register in `app.whenReady()`.
            *   Unregister in `app.on('will-quit')`.

## II. User Reported Issues & Bug Fixes

1.  **Installation Path & Asset Loading Errors: [COMPLETED]**
    *   **Issue:** Fresh installs attempted to write to `C:\Windows\system32`, causing permission errors. This also led to infinite loading screens as the application could not access its own assets (`winapp.asar`).
    *   **Implementation:**
        *   Modified `electron-builder.json` to ensure a per-user installation and prevent privilege escalation by setting `"perMachine": false` and `"allowElevation": false`. This forces installation into the user's `AppData` folder.
        *   Added a custom NSIS script (`build/installer.nsh`) to the build process to terminate any running `strawberry-jam.exe` processes before installation, preventing file conflicts.
        *   Corrected a case-sensitivity issue in a `require` statement within `src/electron/renderer/application/dispatch/index.js` that caused a "Cannot find module" error in the packaged application.
    *   **Result:** The application now installs to the correct directory, has appropriate permissions to access its assets, and handles existing processes during installation, resolving both the installation and infinite loading issues.

2.  **Lingering Processes on Exit: [COMPLETED]**
    *   **Issue:** After closing the application, the main `strawberry-jam.exe` process and its children would not terminate. Log analysis revealed that the `ProcessManager`'s `killAll` method, bound to the `app.on('will-quit')` event, was calling `app.quit()` after killing child processes. This second `app.quit()` call would re-trigger the same `will-quit` event, creating an infinite loop that prevented the application from ever fully shutting down.
    *   **Implementation:**
        *   A state flag, `this.isQuitting`, was added to the `ProcessManager` class in `src/utils/ProcessManager.js`.
        *   This flag is set to `true` the first time the `killAll` method is executed.
        *   A check was added at the beginning of `killAll` to immediately `return` if `this.isQuitting` is already `true`, thus breaking the infinite loop.
    *   **Result:** This change ensures the shutdown sequence runs only once, allowing the application to terminate all child processes and then quit cleanly. This definitively resolves the lingering process issue.

3.  **Username Logger Not Activating on Startup: [COMPLETED]**
    *   **Issue:** The Username Logger plugin did not start logging automatically on application launch. It only began working after the user opened the settings and clicked "Save", because the initial settings values were not being defaulted correctly.
    *   **Implementation:**
        *   Modified `plugins/UsernameLogger/index.js` within the `onSettingsUpdated` method.
        *   The calls to `this.application.settings.get()` for `plugins.usernameLogger.collection.enabled`, `plugins.usernameLogger.collection.collectNearby`, and `plugins.usernameLogger.collection.collectBuddies` were updated to provide a default value of `true`.
        *   For example: `this.application.settings.get('plugins.usernameLogger.collection.enabled', true);`
    *   **Result:** This change makes the plugin more resilient. It now correctly defaults to an "on" state at startup if the settings have not been explicitly saved as `false` by the user, resolving the activation issue.

4.  **UsernameLogger File Location: [COMPLETED]**
    *   **Issue:** `UsernameLogger` saved its log files and configuration in multiple locations, including the root `data` folder and custom directories, leading to a disorganized file structure.
    *   **Implementation:**
        *   **Centralized Path:** All plugin logic was refactored to use a single, dedicated storage directory: `.../strawberry-jam/UsernameLogger/`. This was achieved by modifying `index.js` to establish this path and passing it to all relevant services and handlers.
        *   **One-Time Migration Service:** A robust, one-time migration service (`migration-service.js`) was created. On first run after the update, it automatically moves all existing log files and the `config.json` from their old locations to the new centralized directory.
        *   **Cleanup:** The migration service now safely deletes the deprecated `working_accounts.txt` file and removes the old `data` and `data/UsernameLogger` directories if they become empty after the migration.
        *   **Corrected Initialization:** The plugin's startup sequence in `index.js` was corrected to load the configuration *before* running the migration, ensuring the migration only runs once by properly checking a `migrationV2Completed` flag.
    *   **Result:** The plugin's data is now fully self-contained within its own folder. The migration is seamless for existing users, and the file system is left clean. The repeated migration bug on every startup has been fixed.

5.  **LeakCheck API Key Validation: [COMPLETED]**
    *   **Issue:** Users reported issues with the LeakCheck API key being marked as invalid even when it was correct and recently saved in settings.
    *   **Implementation:**
        *   The root cause was identified as potential leading/trailing whitespace in the API key string, likely introduced during user input. The application was storing and using the key with this whitespace, causing the LeakCheck API to reject it.
        *   The fix was implemented in `plugins/UsernameLogger/services/api-service.js`.
        *   The `getApiKey()` method was modified to always use `.trim()` on the API key after retrieving it from storage. This ensures any extraneous whitespace is removed before the key is used for validation or API calls. If trimming results in an empty string, it is correctly treated as a null (missing) key.
        *   The `setApiKey()` method was also updated to `.trim()` the key before saving it to the application's settings. This prevents whitespace from being stored in the first place, ensuring data cleanliness.
    *   **Result:** The plugin now correctly handles API keys with accidental whitespace. Both setting and getting the key are robust against this common user input error, which resolves the invalid key issue and makes the validation process reliable.

6.  **Cache Access Errors on Startup: [COMPLETED]**
    *   **Issue:** The application logged cache access errors on startup.
    *   **Implementation:** This issue was a direct symptom of the "Lingering Processes on Exit" problem. The lingering processes from a previous session held locks on the cache files, causing access errors on the next launch.
    *   **Result:** By fixing the shutdown loop in the `ProcessManager`, the lingering process issue was resolved. As a result, cache files are no longer locked by orphaned processes, and the cache access errors have been eliminated.
