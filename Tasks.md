# Future Ideas & Tasks

### 1. **Improve Spammer Plugin (v2.0.0) [COMPLETED]**
*   **Implementation:**
    *   **Architectural Fix for File I/O:**
        *   Modified `src/electron/ipcHandlers.js` to add main-process handlers for reading/writing JSON files and showing notifications.
        *   Modified `src/electron/preload.js` to securely expose the file I/O and notification functions to the plugin via the `window.jam` object.
    *   **Bug Fixes:**
        *   **Save Template Crash:** Refactored the `saveTemplate` logic in `plugins/spammer/index.js` to initialize modal event listeners in the constructor, preventing a crash when the button was clicked.
        *   **Highlight.js Errors:** Replaced the broken syntax highlighting implementation with a proper overlay system. This involved adding a `pre/code` block behind a transparent textarea, adding the required CSS, and updating the `highlightSyntax` function to populate the overlay. The missing XML language pack for `highlight.js` was also downloaded and included.
    *   **UI/UX Enhancements:**
        *   **Scrolling:** Corrected the flexbox layout in `plugins/spammer/index.html` to ensure that sections with long content (like History and Templates) become properly scrollable.
        *   **Collapsible Sections:** Implemented collapsible headers for the History and Templates sections, allowing users to hide and show them to manage screen space.
*   **Result:** All reported bugs and UI issues have been addressed. The plugin is now stable and user-friendly. The UI has been completely overhauled with a tab-based interface to solve layout and clutter issues. The alignment and spacing of input controls were refined to use a more compact, single-row flexbox layout per user feedback. The user flow was improved by making the History and Templates tabs automatically switch back to the Queue tab upon use. The syntax highlighting feature was removed due to performance issues. All outstanding startup crashes and bugs have been resolved.

### 2. **Investigate GitHub Implementation in Plugin Library [COMPLETED]**
*   **Problem Description:** The "Add Repository" button was not visible in the GitHub tab of the plugin library, leading to the assumption that the feature was missing from the UI.
*   **Implementation:**
    *   **Initial Investigation:** Reviewed `src/electron/renderer/application/modals/plugins.js` and confirmed that the "Add Repository" button (`#addGithubRepoBtn`) and its container (`#githubPluginDetails`) were present in the code but initially hidden.
    *   **Root Cause Analysis:** The UI logic was designed to reveal the "Add Repository" button only after a user entered a URL and clicked the "Fetch" button. However, the jQuery `fadeOut`/`fadeIn` animation used to switch between the search bar and the GitHub input field was conflicting with Tailwind's `hidden` class, preventing the input field from appearing when the GitHub tab was selected.
    *   **Final Fix:** Replaced the jQuery animation with a direct class manipulation. The code was updated to use `addClass('hidden')` and `removeClass('hidden')` to toggle the visibility of the search and GitHub input containers. This ensures the GitHub input field is reliably displayed when its tab is active.
*   **Result:** The GitHub input field now correctly appears when the "GitHub" tab is selected. The "Add Repository" button is now accessible after fetching a repository, and the entire feature is fully functional as intended.

## II. Medium

### 1. **Fix LeakCheck API Key Error in Build Version [COMPLETED]**
*   **Problem Description:** A valid LeakCheck API key failed with a generic "API error" in the build version but worked correctly in the development environment. This prevented users from using the `!leakcheck` command in the released application.
*   **Implementation:**
    *   **Initial Investigation:** Enabled detailed error logging in `plugins/UsernameLogger/services/api-service.js` to diagnose the issue in the build version.
    *   **Root Cause Analysis:** The logs from the build revealed two key issues:
        1.  `require('axios')` was failing, causing the `api-service` to fall back to the `fetch` API.
        2.  The `fetch` call was failing with a `Failed to execute 'fetch' on 'Window': Illegal invocation` error. This was because `fetch` was being called with an incorrect `this` context.
    *   **Final Fix:** Modified the `loadHttpClient` method in `plugins/UsernameLogger/services/api-service.js`. The `fetch` function is now explicitly bound to the `window` object (`fetch.bind(window)`) before being assigned as the HTTP client. This ensures `fetch` is always called with the correct context.
*   **Result:** The "Illegal invocation" error is resolved. The `api-service` can now successfully use the `fetch` fallback in the build version to make API requests. The `!leakcheck` command is now fully functional in both development and build environments.

### 2. **Fix Plugin Installation Path in Production Builds [COMPLETED]**
*   **Problem Description:** Plugins were being installed to the application's installation directory instead of the correct `appdata/roaming/strawberry-jam` location in production builds. This caused the application to fail to load any installed plugins.
*   **Implementation:**
    *   **Investigation:** Reviewed `src/electron/renderer/application/modals/plugins.js` and identified that the plugin installation directory was determined by the `NODE_ENV` environment variable.
    *   **Root Cause Analysis:** The `build` and `publish` scripts in `package.json` were not setting `NODE_ENV` to `production`. This caused the application to default to development mode, leading to the incorrect installation path.
    *   **Final Fix:** Modified the `build` and `publish` scripts in `package.json` to explicitly set `NODE_ENV=production` using `cross-env`. This ensures that production builds use the correct `appdata` path for plugin installations.
*   **Result:** The plugin installation path is now correctly set for production builds, resolving the issue of plugins not being loaded.

### 3. **Fix Plugin Loading Path in Production Builds [COMPLETED]**
*   **Problem Description:** Even after fixing the installation path, plugins were still not being loaded in production builds because the application was looking in the wrong directory.
*   **Implementation:**
    *   **Investigation:** Reviewed `src/electron/renderer/application/dispatch/index.js` and `src/Constants.js`.
    *   **Root Cause Analysis:** The `getDataPath` function in `src/Constants.js` was incorrectly appending a `/data` subfolder to the `appdata` path. The plugin loading logic in `dispatch/index.js` relied on this incorrect path.
    *   **Final Fix:** Modified the `getDataPath` function in `src/Constants.js` to return the correct `app.getPath('userData')` path without the `/data` subfolder. This ensures the application looks for plugins in the correct directory.
*   **Result:** The plugin loading path is now correct, and plugins are successfully loaded from the `appdata/roaming/strawberry-jam/plugins` directory in production builds.

### 4. **Auto-refresh Plugin List After Installation [COMPLETED]**
*   **Problem Description:** After installing a new plugin from the plugin library, the plugin list was not automatically updated, requiring a manual refresh.
*   **Implementation:**
    *   Modified `src/electron/renderer/application/modals/plugins.js` to call `app.dispatch.refresh()` after a successful plugin installation.
*   **Result:** The plugin list now automatically refreshes after a new plugin is installed, providing a more seamless user experience.

3.  **Full-Den Screenshot Tool [RESEARCHED]:**
    *   Add an option to capture a single screenshot of the entire den, regardless of screen size or zoom level.
    *   Implement as a one-click action or a dedicated shortcut key to export the full den view.
    *   **Plan (Updated with Research Findings):**
        1.  **Trigger Mechanism:**
            *   Add a new UI element (button) in the game's interface or main application shell that sends an IPC message (e.g., `ipcRenderer.send('request-full-den-screenshot')`) to the main process ([`assets/extracted-winapp-public/index.js`](assets/extracted-winapp-public/index.js:39)).
            *   Alternatively, register a `globalShortcut` in [`assets/extracted-winapp-public/index.js`](assets/extracted-winapp-public/index.js:39) (e.g., `Ctrl+Shift+S`).
        2.  **Capture Strategy (Renderer Collaboration - Preferred & Researched):**
            *   **ActionScript Client Integration (`dev/ajclient-decompiled/scripts/room/RoomManagerWorld.as`):**
                *   Add a new public method (e.g., `captureFullDenScreenshot()`) to `RoomManagerWorld.as`.
                *   Inside this method, access `_layerManager.bkg` as the root display object containing all den elements.
                *   Calculate the total bounds of all content within `_layerManager.bkg` to determine the `fullWidth` and `fullHeight` for the `BitmapData`. This may involve iterating through children and using `getBounds()`.
                *   Create a `BitmapData` object: `var bitmapData:BitmapData = new BitmapData(fullWidth, fullHeight, true, 0x00000000);`
                *   Draw the `_layerManager.bkg` onto the `BitmapData`: `bitmapData.draw(_layerManager.bkg, new Matrix(1, 0, 0, 1, -offsetX, -offsetY));` (adjust `offsetX`/`offsetY` based on `getBounds()` if needed).
                *   Encode the `BitmapData` to a PNG or JPEG `ByteArray` (requires an encoder library or custom implementation).
                *   Convert the `ByteArray` to a Base64 string.
            *   **Flash to Renderer IPC:** The Base64 image data should be passed from the ActionScript environment to the Electron renderer process using `ExternalInterface.call("sendScreenshotToElectron", base64String);`.
            *   **Electron Renderer JavaScript (`assets/extracted-winapp-public/gui/gamePreload.js` or similar):** Implement a `sendScreenshotToElectron(dataUrl)` function that receives the Base64 string and sends it to the main process using `ipcRenderer.invoke('full-den-image-data', dataUrl)`.
        3.  **Image Handling in Main Process:**
            *   On receiving the IPC message via `ipcMain.handle('full-den-image-data', async (event, imageDataUrl) => { ... })`.
            *   Use `const nativeImage = require('electron').nativeImage.createFromDataURL(imageDataUrl);` to create an Electron `NativeImage` object.
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

### 4. **Fix `tfd-automator` Plugin Packet Issues [COMPLETED]**
*   **Problem Description:** The `tfd-automator` plugin was non-functional because it used hardcoded or incorrectly resolved user and room IDs, preventing it from working for any user other than the one whose data was captured in `packets.txt`. The logic for obtaining dynamic room and user information was not robust enough to handle the different types of IDs (textual vs. numeric) used by the game.
*   **Implementation:**
    *   Modified `plugins/tfd-automator/index.js` to overhaul the user and room ID acquisition logic.
    *   **Refined `getCurrentUser()`:** The function was updated to prioritize `window.jam.dispatch.getState('player').username` to get the current player's actual username, ensuring consistency. It now falls back to extracting the username from den names or `drc` packets.
    *   **Separated Room ID Functions:**
        *   Created `getTextualRoomId()` to specifically retrieve textual room names (e.g., `denladyliya`).
        *   Created `getNumericRoomId()` to specifically retrieve numeric room IDs (e.g., `1793945`), which is crucial for packet construction.
    *   **Updated `initializePacketTemplates()`:** This function was modified to use the new `getTextualRoomId()` and `getNumericRoomId()` functions. This ensures that packets requiring both a numeric ID and a textual den name (like `qjc` and `qs`) are constructed correctly and dynamically for the current user.
    *   **Improved `sendNextPacket()`:** The logic was updated to use the correct room ID type (numeric adventure ID vs. den ID) based on the current automation phase.
*   **Result:** The `tfd-automator` plugin is now fully functional and works for any user in any den. The packet construction is now correctly based on dynamically and reliably acquired user and room information, resolving the issue of invalid packets and erroneous room IDs. The full automation cycle (joining, starting, collecting gems, claiming rewards, and leaving) now operates as intended.

## Completed Tasks

### 7. **Plugin System Overhaul [COMPLETED]**
*   **Problem Description:** The existing plugin system had several issues: plugins were bundled with the installer, increasing the application size; updates would delete user-installed plugins; and there was no mechanism for plugins to run in the background without being throttled.
*   **Implementation:**
    *   **Decoupled Plugins from Installer:** Modified `electron-builder.json` to remove the `plugins` directory from the `extraFiles` array, preventing them from being bundled into the final application package.
    *   **Persistent Plugin Installation:**
        *   Updated `src/electron/renderer/application/dispatch/index.js` and `src/electron/renderer/application/modals/plugins.js` to use the user's data directory (`app.getPath('userData')`) for storing plugins.
        *   Implemented a migration script in `src/electron/renderer/application/modals/plugins.js` to automatically move existing plugins from the old installation directory to the new user data directory, ensuring a seamless transition for existing users.
    *   **Background Plugin Execution:**
        *   Added a `runInBackground` property to the `plugin.json` schema.
        *   Modified `src/electron/index.js` to check for this property when creating plugin windows and set `backgroundThrottling: false` accordingly.
        *   Added IPC events to notify plugins when the main application is minimized or restored.
    *   **Improved User Experience:** Replaced the "Plugins directory not found" error with a more user-friendly message: "Head to the plugin library to download plugins!".
*   **Result:** The plugin system is now more robust and user-friendly. New users will have a smaller initial download and can choose which plugins to install. Existing users' plugins will be preserved during updates. Plugin developers can now create plugins that run in the background without being throttled.

### 5. **Fix Plugin Window Icon [COMPLETED]**
*   **Problem Description:** Plugin windows were displaying the ault Electron icon instead of the custom Strawberry Jam icon (`assets/images/icon.png`).
*   **Implementation:**
    *   Modified `src/electron/index.js`.
    *   In the `_handleOpenPluginWindow` method, added the `icon` property to the `BrowserWindow` options, setting its value to `path.join(getAssetsPath(app), 'images', 'icon.png')`.
*   **Result:** Plugin windows now correctly display the Strawberry Jam icon, providing a consistent branding experience across all application windows.

### 6. **Fix Auto-Update Functionality [COMPLETED]**
*   **Problem Description:** The auto-update mechanism was not functioning correctly due to a hardcoded feed URL in `src/electron/index.js`, which prevented `electron-updater` from using the correct configuration files (`dev-app-update.yml` for development and `electron-builder.json` for production). The startup logic also contained redundant update checks.
*   **Implementation:**
    *   Modified `src/electron/index.js` to refactor the `_initAutoUpdater` function.
    *   **Removed Hardcoded URL:** Deleted the `autoUpdater.setFeedURL()` call to allow `electron-updater` to automatically detect the correct update source.
    *   **Conditional Initialization:** Wrapped the updater logic in an `if (app.isPackaged)` block to ensure it only runs in the production environment.
    *   **Improved Logging:** Added `console.log` and `console.error` statements to all `autoUpdater` event listeners to provide clear feedback in the main process logs.
    *   **Streamlined Update Checks:** Replaced multiple `checkForUpdates()` calls with a single, robust `checkForUpdatesAndNotify()` call on a timer, simplifying the logic and preventing redundant checks.
*   **Result:** The auto-update functionality is now correctly configured. It will use the appropriate settings for both development and production environments, and the main process logs will provide clear, actionable information regarding the update status.
