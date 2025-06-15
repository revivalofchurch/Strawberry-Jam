# TFD Automator Plugin

**Modernized Universal TFD Automator** - Works for ANY user in ANY den using advanced room tracking technology.

## Recent Updates (2024)

✅ **Completely Modernized** - Now uses the same advanced room tracking system as the advertising plugin  
✅ **Universal Compatibility** - Works for any user in any den without hardcoded values  
✅ **Simplified & Reliable** - Removed complex packet parsing in favor of modern dispatch-based room detection  
✅ **Real-time Status** - Intelligent status checking that automatically detects when you're ready  
✅ **Updated Packet Sequences** - All packet templates now match the actual TFD automation flow  

## Features

*   **Universal User Support**: Automatically works for any user - no configuration needed
*   **Modern Room Tracking**: Uses `dispatch.getState('internalRoomId')` with intelligent fallbacks
*   **Real-time Den Detection**: Automatically detects when you enter your den and enables automation
*   **Accurate Packet Sequences**: All packets match the documented TFD automation flow from `packets.txt`
*   **Dynamic Template Generation**: Packet templates are generated dynamically based on your current user/room
*   **Full Automation Mode**: Complete hands-off automation from den entry to treasure collection
*   **Crystal Progress Tracking**: Visual progress bars for all four crystal types
*   **Background Mode Support**: Continues running when app is minimized
*   **Intelligent Status System**: Real-time status updates without complex packet listeners

## How to Use

### Basic Mode (Gem Collection Only)
1.  **Enter your den** - The plugin will automatically detect this and show "Ready" status
2.  Open the TFD Automator plugin panel in Strawberry Jam
3.  Navigate to TFD adventure manually and start it
4.  Click "Start Automation" to begin gem collection
5.  Plugin will automatically collect all gems and treasures

### Full Automation Mode (Recommended)
1.  **Enter your den** - Plugin shows "Ready" when detected
2.  Toggle on the **"Full Auto"** switch  
3.  Click **"Start"** to begin complete automation
4.  Plugin automatically handles the entire TFD sequence:
    * Joins TFD adventure from your den
    * Starts the adventure session  
    * Collects all gems (Yellow Diamonds, Green Hexagons, Blue Squares, White Triangles)
    * Opens all treasure chests using proper TFD reward packets
    * Exits adventure and returns to den
    * **Repeats continuously** until you stop it

## Modern Architecture

The plugin now uses a **modern, reliable architecture**:

- **Dispatch-based Room Tracking**: Uses `await dispatch.getState('internalRoomId')` like the advertising plugin
- **Periodic Status Checking**: Checks your status every 2 seconds instead of complex packet listening  
- **Dynamic User Detection**: Automatically gets your user ID via `dispatch.getState('player')`
- **Intelligent Den Detection**: Automatically detects when you're in your den (`den{userId}`)
- **Universal Packet Templates**: All packets work for any user in any den

## Packet Sequence Accuracy

All packet sequences have been **verified against actual TFD automation flow**:

- **Join Adventure**: `%xt%o%qjc%{room}%{denId}%23%0%`
- **Start Adventure**: `%xt%o%qs%{room}%{denId}%` + off message
- **Gem Collection**: 1000+ crystal collection packets (`qqm` format) 
- **Treasure Collection**: `qpgift` packets (0,1,-1,-1) + `qpgiftdone`
- **Leave Adventure**: `%xt%o%qx%{room}%`

## Universal Compatibility

This plugin now works for **ANY user** without modification:

✅ **No hardcoded user IDs** - Dynamically detects your user ID  
✅ **No hardcoded den IDs** - Automatically constructs your den ID  
✅ **No hardcoded room IDs** - Uses modern room tracking  
✅ **Works in any den** - Not limited to specific den configurations  
✅ **Automatic template generation** - All packets customized for your session  

## Status Indicators

The plugin provides intelligent status feedback:

- **"Waiting - Login data not found"** - Game not fully loaded yet
- **"Waiting - Please enter your den"** - You're not in your den  
- **"Ready - Press Start to begin"** - Ready for automation
- **"Running..."** - Automation in progress
- **"Paused"** - Automation paused (click Resume)

## Troubleshooting

If you encounter issues:

1. **Make sure you're in your den** - Plugin only works from your own den
2. **Wait for "Ready" status** - Don't start until plugin shows ready
3. **Check activity log** - Look for user ID and den ID detection messages
4. **Try reloading** - If status stuck, reload the plugin
5. **Check connection** - Ensure stable internet connection

The modern architecture is much more reliable than the old system!

## Technical Details

- **Room Tracking**: Modern `dispatch.getState('internalRoomId')` approach
- **Status Updates**: 2-second interval checking instead of packet listeners  
- **Memory Management**: Proper cleanup of intervals and timeouts
- **Error Handling**: Graceful handling of network and state errors
- **Performance**: Optimized for background operation and minimal UI updates
