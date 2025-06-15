# Future Ideas & Tasks

## II. Medium

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

### 4. **Fix `tfd-automator` Plugin Packet Issues [RESEARCHED]**
    *   **Problem Description:** The `tfd-automator` plugin is currently non-functional due to issues with network packet transmission. It is reportedly sending invalid packets, utilizing incorrect packet structures, and/or using erroneous room IDs. This prevents the plugin from interacting correctly with the game server.
    *   **Investigation & Resolution Plan (Updated with Research Findings):**
        1.  **Packet Analysis & Documentation Review:**
            *   **Examine `plugins/tfd-automator/tfd-packets.json` and `packets.txt`:** Thoroughly review these files to understand the expected packet structures, types, and relevant data fields for The Forgotten Desert (TFD) feature. `packets.txt` is likely a definition or log of network packets, crucial for understanding the protocol.
            *   **Cross-reference with Game Client (using Proxy Tools):** Utilize network proxy tools (e.g., Charles Proxy, Fiddler, Wireshark) to intercept and analyze legitimate TFD packet exchanges from the live game client. This is critical for comparing actual traffic with defined structures and plugin-generated packets. Pay attention to the underlying protocol (likely custom binary or AMF over RTMP).
        2.  **`tfd-automator` Code Review (`plugins/tfd-automator/index.js`):**
            *   **Packet Construction Logic:** Identify and meticulously review the functions or code blocks responsible for creating and serializing packets. Pay close attention to how data (room IDs, item IDs, coordinates, actions) is encoded into the packet format.
            *   **Room ID Management:** Investigate how the plugin determines and uses Room IDs. Verify if it's correctly tracking the player's current room or the target room for TFD actions.
            *   **State Management:** Analyze how the plugin manages its state related to TFD progression, and how this state influences packet generation.
            *   **Error Handling:** Check if there's any error handling related to packet sending or server responses that might provide clues.
        3.  **Debugging & Logging Implementation:**
            *   **Enhanced Logging:** Modify `plugins/tfd-automator/index.js` to implement detailed logging of all outgoing packets. Log the raw packet data (e.g., as a hex string or byte array) just before it's sent. This will be visible in Electron's DevTools console.
            *   **Contextual Logging:** Log relevant contextual information alongside packets, such as the intended action, current game state (as perceived by the plugin), and any parameters used for packet creation.
        4.  **Packet Validation & Correction:**
            *   **Compare Logged Packets:** Compare the logged packets from the plugin with the known-correct structures identified in step 1 (from `packets.txt`, `tfd-packets.json`, and proxy captures).
            *   **Identify Discrepancies:** Pinpoint specific areas where the plugin's packets deviate (e.g., incorrect opcodes, field lengths, data types, byte order, room IDs).
            *   **Iterative Refinement:**
                *   Correct the packet construction logic in `plugins/tfd-automator/index.js` based on the identified discrepancies.
                *   Test each correction by attempting the relevant TFD actions in-game and observing the new logged packets and server responses (if any).
                *   Focus on one type of packet or one part of the structure at a time to isolate fixes.
        5.  **Testing & Verification:**
            *   **Targeted Tests:** Test specific TFD actions that were previously failing (e.g., entering TFD, collecting items, moving between TFD rooms).
            *   **Full Workflow Test:** Once individual packet issues seem resolved, test the entire TFD automation workflow supported by the plugin.
            *   **Monitor for Side Effects:** Ensure that fixes do not introduce new issues or break other functionalities.

## Completed Tasks

### 5. **Fix Plugin Window Icon [COMPLETED]**
*   **Problem Description:** Plugin windows were displaying the default Electron icon instead of the custom Strawberry Jam icon (`assets/images/icon.png`).
*   **Implementation:**
    *   Modified `src/electron/index.js`.
    *   In the `_handleOpenPluginWindow` method, added the `icon` property to the `BrowserWindow` options, setting its value to `path.join(getAssetsPath(app), 'images', 'icon.png')`.
*   **Result:** Plugin windows now correctly display the Strawberry Jam icon, providing a consistent branding experience across all application windows.
