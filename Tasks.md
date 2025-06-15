# Future Ideas & Tasks

## I. Easy

1.  **Default Sidebar to Open on Startup (Main `src` Client): [COMPLETED]**
    *   **Implementation:**
        *   Modified `src/electron/renderer/index.html` to change the default state of the sidebar.
        *   The `div#sidebar` element's class was changed from `-translate-x-full` to `translate-x-0`, making it visible on load.
        *   The `div#mainContent` element's class was updated to include `ml-64` to position it correctly next to the open sidebar.
        *   The menu icon `i#menuIcon` was changed from `fa-bars` to `fa-bars-staggered` to reflect the open state.
    *   **Result:**
        *   The application now starts with the sidebar in an open state by default. The existing toggle functionality remains intact.

2.  **Investigate Fullscreen Behavior for `gamescreen.js`: [COMPLETED]**
    *   **Problem Description:** Fullscreen mode is reportedly not correctly engaging for `gamescreen.js` located within `'assets/extracted-winapp-public/'`. The game screen does not expand to utilize the full display area when fullscreen is activated.
    *   **Investigation Plan:**
        1.  **Verify File Location:** Confirm the exact path and existence of `gamescreen.js` within `assets/extracted-winapp-public/` or its subdirectories (e.g., `gui/`). Note: The provided folder listing for `assets/extracted-winapp-public/` does not explicitly show `gamescreen.js` at the top level.
        2.  **Examine Fullscreen Logic:** Review the Electron main process code (`assets/extracted-winapp-public/index.js`) for how fullscreen is initiated and managed (e.g., `win.setFullScreen()`, event listeners like `enter-full-screen`, `leave-full-screen`).
        3.  **Inspect Renderer-Side Code:** If `gamescreen.js` is found (likely in `gui/`), analyze its role in handling fullscreen transitions or resizing content. Check for any CSS or JavaScript that might interfere with proper scaling.
        4.  **Webview/Game Client Interaction:** Determine how the game client (Flash or HTML, likely within a `<webview>` or `<iframe>` in `gui/index.html`) is instructed to go fullscreen or how it responds to the main window's fullscreen state.
        5.  **Test and Observe:** Trigger fullscreen mode through all available methods (e.g., F11, application menus, programmatic calls if any) and observe the behavior of the game screen. Document discrepancies.
        6.  **Log Relevant Events:** Add logging for window events (`'enter-full-screen'`, `'leave-full-screen'`, `'resize'`) and any IPC messages related to screen state to trace the flow.

## II. Medium

3.  **Full-Den Screenshot Tool:**
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

4.  **Fix `tfd-automator` Plugin Packet Issues:**
    *   **Problem Description:** The `tfd-automator` plugin is currently non-functional due to issues with network packet transmission. It is reportedly sending invalid packets, utilizing incorrect packet structures, and/or using erroneous room IDs. This prevents the plugin from interacting correctly with the game server.
    *   **Investigation & Resolution Plan:**
        1.  **Packet Analysis & Documentation Review:**
            *   **Examine `plugins/tfd-automator/tfd-packets.json` and `packets.txt`:** Thoroughly review these files to understand the expected packet structures, types, and relevant data fields for The Forgotten Desert (TFD) feature.
            *   **Cross-reference with Game Client (if possible):** If there's a way to observe legitimate TFD packet exchanges from the game client (e.g., through developer tools or existing logs), compare these with the structures defined in the JSON/TXT files and those generated by the plugin.
        2.  **`tfd-automator` Code Review (`plugins/tfd-automator/index.js`):**
            *   **Packet Construction Logic:** Identify and meticulously review the functions or code blocks responsible for creating and serializing packets. Pay close attention to how data (room IDs, item IDs, coordinates, actions) is encoded into the packet format.
            *   **Room ID Management:** Investigate how the plugin determines and uses Room IDs. Verify if it's correctly tracking the player's current room or the target room for TFD actions.
            *   **State Management:** Analyze how the plugin manages its state related to TFD progression, and how this state influences packet generation.
            *   **Error Handling:** Check if there's any error handling related to packet sending or server responses that might provide clues.
        3.  **Debugging & Logging Implementation:**
            *   **Enhanced Logging:** Modify `plugins/tfd-automator/index.js` to implement detailed logging of all outgoing packets. Log the raw packet data (e.g., as a hex string or byte array) just before it's sent.
            *   **Contextual Logging:** Log relevant contextual information alongside packets, such as the intended action, current game state (as perceived by the plugin), and any parameters used for packet creation.
        4.  **Packet Validation & Correction:**
            *   **Compare Logged Packets:** Compare the logged packets from the plugin with the known-correct structures identified in step 1.
            *   **Identify Discrepancies:** Pinpoint specific areas where the plugin's packets deviate (e.g., incorrect opcodes, field lengths, data types, byte order, room IDs).
            *   **Iterative Refinement:**
                *   Correct the packet construction logic in `plugins/tfd-automator/index.js` based on the identified discrepancies.
                *   Test each correction by attempting the relevant TFD actions in-game and observing the new logged packets and server responses (if any).
                *   Focus on one type of packet or one part of the structure at a time to isolate fixes.
        5.  **Testing & Verification:**
            *   **Targeted Tests:** Test specific TFD actions that were previously failing (e.g., entering TFD, collecting items, moving between TFD rooms).
            *   **Full Workflow Test:** Once individual packet issues seem resolved, test the entire TFD automation workflow supported by the plugin.
            *   **Monitor for Side Effects:** Ensure that fixes do not introduce new issues or break other functionalities.

## III. Hard

5.  **Create `modularization-list.md`:**
    *   **Rule:** Before any file modularization, create a `.bak` or copy of the original file. This allows for checking modularized files against the original singular file to ensure functionality.
    *   Find all files within the project (e.g., in `@src` and `@plugins`) that are above 600 lines of code.
    *   List these files in `modularization-list.md`, ordered from the fewest lines to the most lines of code.
    *   For each file, add details of its code/function structure and how the file operates.

6.  **Memory Leak Investigation:**
    *   Check for memory leaks across the `@src` files.
    *   Check for memory leaks across `@extracted-winapp-public` files.

7.  **Backend Logic Optimization:**
    *   Review and improve backend application logic for enhanced performance across the two Electron processes (main and renderer, and any forked processes like the API).

## IV. Plugin Enhancements & Management

8.  **Enhance and Revise Plugin Info Modals:**
    *   **Task:** Review and update the informational modals for each plugin to ensure content is current and accurate.
    *   **Reasoning:** Some plugin information is outdated and needs revision.
    *   **Investigation Plan:**
        1.  List all plugins that currently have informational modals.
        2.  For each plugin, review the content of its info modal.
        3.  Identify outdated information, broken links, or unclear instructions.
        4.  Determine the correct and current information for each plugin.
        5.  Plan the necessary changes to the modal content (text, HTML structure if needed).
        6.  Locate the source files where these modals are defined (likely within each plugin's directory or a shared modal management system).

9.  **Investigate Plugin Update Mechanism:**
    *   **Task:** Research and document how plugin updates are currently handled and explore improvements for user experience.
    *   **Questions to Address:**
        *   Is there an existing mechanism for plugins to auto-update?
        *   How are users notified of new plugin versions?
        *   What is the process for users to install updated versions of plugins?
        *   Is the current update process (if one exists) intuitive?
    *   **Investigation Plan:**
        1.  Review `src/` and `plugins/` directories for any code related to plugin version checking, downloading, or updating.
        2.  Examine `plugin.json` files for version fields, update URLs, or other relevant metadata.
        3.  Analyze the "Plugin Library" feature (if it handles updates) or any other plugin management UIs.
        4.  Document the current state of plugin updates.
        5.  Identify pain points or areas for improvement in the update process.
