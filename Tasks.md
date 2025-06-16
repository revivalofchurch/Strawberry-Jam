# Future Ideas & Tasks

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
