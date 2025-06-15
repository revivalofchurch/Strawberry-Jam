/**
 * TFD Automator Plugin Logic - Updated for Modern Room Tracking
 */

// Wait for the dispatch object to be ready
function waitForDispatch(callback) {
    if (window.jam && window.jam.dispatch) {
        callback();
    } else {
        console.log('TFD Automator: Waiting for dispatch...');
        setTimeout(() => waitForDispatch(callback), 100);
    }
}

// --- Global Variables ---
let packets = [];
let isAutomating = false;
let isPaused = false;
let currentPacketIndex = 0;
let timeoutId = null;
let currentSpeed = 500; // Default speed in ms
let crystalPacketCounts = { yellow: 0, green: 0, white: 0, blue: 0 };
let currentCrystalProgress = { yellow: 0, green: 0, white: 0, blue: 0 };
let autoStartEnabled = false;
let fullAutomationEnabled = false;
let currentAutomationPhase = 'none'; // Tracks which phase we're in (join, gems, rewards, leave)
let fullAutomationCycles = 0;
let currentUserId = null;
let currentDenId = null;
let isReady = false;
let isBackgroundMode = false;
let statusCheckInterval = null; // For periodic status checking
let adventureRoomId = null;

// Packet template arrays
let joinTfdPackets = [];
let startTfdPackets = [];
let collectRewardsPackets = [];
let leaveTfdPackets = [];

// Fallback room tracking
let lastKnownRoomId = null;
let lastKnownRoomName = null;
let lastKnownUserName = null; // Capture actual username from packets

const IS_DEV = true; // Set to true for debugging

/**
 * Simple packet listener to capture room information as fallback
 */
function simplePacketListener(packetData) {
    try {
        // Accept raw string or wrapper object {raw, message, data}
        const message = typeof packetData === 'string'
            ? packetData
            : (packetData?.raw || packetData?.message || packetData?.data || '');
        if (!message || typeof message !== 'string') {
            if (IS_DEV && packetData) {
                console.log(`TFD: Packet listener called with non-string data:`, typeof packetData, packetData);
            }
            return;
        }
        
        // Debug: Log all packets to see what's coming through
        if (IS_DEV && (message.includes('dj') || message.includes('rj') || message.includes('drc') || message.includes('den') || message.includes('%qjc%') || message.includes('%qw%') || message.includes('%qs%'))) {
            console.log(`TFD: Packet received: ${message.substring(0, 100)}...`);
        }
        
        // Extra diagnostics: host-lobby handshake and quest start responses
        if (IS_DEV) {
            if (message.includes('%qjc%')) {
                console.log('[TFD DEBUG] SERVER qjc reply ▶', message);
            }
            if (message.includes('%qw%')) {
                console.log('[TFD DEBUG] SERVER qw reply ▶', message);
            }
            if (message.includes('%qs%')) {
                console.log('[TFD DEBUG] SERVER qs reply ▶', message);
            }
        }
        
        // Look for room join packets (%xt%rj%)
        if (message.startsWith('%xt%rj%')) {
            const parts = message.split('%');
            if (parts.length >= 6) {
                const numericId = parseInt(parts[3], 10);
                const textualRoom = parts[5];
                if (textualRoom) {
                    lastKnownRoomName = textualRoom;
                }
                if (textualRoom && /^quest_/i.test(textualRoom) && !isNaN(numericId)) {
                    adventureRoomId = numericId;
                    if (IS_DEV) {
                        console.log(`TFD: Captured adventure room id: ${adventureRoomId}`);
                    }
                }
            }
        }
        
        // Look for den join packets (%xt%o%dj%)
        if (message.startsWith('%xt%o%dj%')) {
            const parts = message.split('%');
            if (IS_DEV) {
                console.log(`TFD: dj packet parts:`, parts);
            }
            if (parts.length >= 5) {
                const roomName = parts[4]; // Den name
                if (roomName) {
                    lastKnownRoomName = roomName;
                    if (IS_DEV) {
                        console.log(`TFD: Captured den name from dj packet: ${roomName}`);
                    }
                    
                    // Extract username from den name (e.g., "denladyliya" -> "ladyliya")
                    if (roomName.startsWith('den')) {
                        lastKnownUserName = roomName.substring(3); // Remove "den" prefix
                        if (IS_DEV) {
                            console.log(`TFD: Extracted username from den: ${lastKnownUserName}`);
                        }
                    }
                }
            }
        }
        
        // Look for ANY packet that contains "den" followed by letters - more flexible approach
        if (message.includes('den') && !lastKnownRoomName) {
            const denMatch = message.match(/den([a-zA-Z0-9_]+)/);
            if (denMatch && denMatch[0]) {
                lastKnownRoomName = denMatch[0]; // e.g., "denladyliya"
                lastKnownUserName = denMatch[1]; // e.g., "ladyliya"
                if (IS_DEV) {
                    console.log(`TFD: Captured den via regex: ${lastKnownRoomName}, user: ${lastKnownUserName}`);
                }
            }
        }
        
        // Look for user data in various packet types - UNIVERSAL approach
        if (message.includes('drc')) {
            if (IS_DEV) {
                console.log(`TFD: Processing drc packet for username`);
            }
            // drc packets often contain username: %xt%drc%-1%1%1%USERNAME%
            const parts = message.split('%');
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                // Look for a part that looks like a username (letters/numbers, not commands)
                if (part && part.length > 2 && part.match(/^[a-zA-Z0-9_]+$/) && 
                    !['xt', 'drc', 'o', 'rj', 'dj', 'ds', 'rp', 'au'].includes(part) &&
                    !part.match(/^\d+$/)) { // Not just numbers
                    
                    if (!lastKnownUserName || lastKnownUserName !== part) {
                        lastKnownUserName = part;
                        if (IS_DEV) {
                            console.log(`TFD: Captured username from drc packet: ${lastKnownUserName}`);
                        }
                    }
                    break; // Take the first valid username we find
                }
            }
        }
        
        // Also look in room info packets that might contain the den owner's name
        if (message.includes('Den') && message.includes('%xt%rj%')) {
            const parts = message.split('%');
            // Look for den owner name in room description
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (part && part.includes('Den') && part.includes("'s")) {
                    // Extract username from "username's Den"
                    const match = part.match(/^(.+)'s\s+Den$/i);
                    if (match && match[1]) {
                        const extractedUser = match[1];
                        if (!lastKnownUserName || lastKnownUserName !== extractedUser) {
                            lastKnownUserName = extractedUser;
                            if (IS_DEV) {
                                console.log(`TFD: Captured username from den description: ${lastKnownUserName}`);
                            }
                        }
                        break;
                    }
                }
            }
        }
        
    } catch (error) {
        // Log packet parsing errors in dev mode
        if (IS_DEV) {
            console.log(`TFD: Packet parsing error: ${error.message}`);
        }
    }
}

/**
 * Get current room ID using modern dispatch system with multiple fallbacks
 */
async function getCurrentRoomId() {
    if (!window.jam || !window.jam.dispatch) {
        if (IS_DEV) console.log(`TFD: [RoomState] No dispatch available, using captured room: ${lastKnownRoomName}`);
        return lastKnownRoomName; // Return captured room name as fallback
    }
    
    // Try multiple methods to get room ID - prioritize textual room name for den detection
    let roomId = null;
    
    // Method 1: Try textual room name first (better for den detection)
    try {
        roomId = await window.jam.dispatch.getState('room');
        if (roomId && IS_DEV) {
            console.log(`TFD: Got textual room: ${roomId}`);
        }
    } catch (e) {
        if (IS_DEV) console.log(`TFD: textual room failed: ${e.message}`);
    }
    
    // Method 2: Fallback to numeric room ID if no textual room
    if (!roomId) {
        try {
            roomId = await window.jam.dispatch.getState('internalRoomId');
            if (roomId && IS_DEV) {
                console.log(`TFD: Got internalRoomId: ${roomId}`);
            }
        } catch (e) {
            if (IS_DEV) console.log(`TFD: internalRoomId failed: ${e.message}`);
        }
    }
    
    // Method 3: Try room state
    if (!roomId && window.jam && window.jam.roomState) {
        try {
            const roomInfo = window.jam.roomState.getCurrentRoom();
            if (roomInfo) {
                roomId = roomInfo.id || roomInfo.name;
                if (roomId && IS_DEV) {
                    console.log(`TFD: Got room from roomState: ${roomId}`);
                }
            }
        } catch (e) {
            if (IS_DEV) console.log(`TFD: roomState failed: ${e.message}`);
        }
    }
    
    // Method 4: Use captured room name as final fallback
    if (!roomId && lastKnownRoomName) {
        roomId = lastKnownRoomName;
        if (IS_DEV) {
            console.log(`TFD: Using captured room name: ${roomId}`);
        }
    }
    
    if (!roomId && IS_DEV) {
        console.log(`TFD: [RoomState] No room available from any source method`);
    }
    
    return roomId;
}

/**
 * Extract username from den room name (e.g., "denladyliya" -> "ladyliya")
 */
function extractUsernameFromDenName(roomName) {
    if (!roomName || typeof roomName !== 'string') return null;
    
    // Check if room name starts with "den"
    if (roomName.startsWith('den') && roomName.length > 3) {
        const username = roomName.substring(3); // Remove "den" prefix
        if (IS_DEV) {
            console.log(`TFD: Extracted username from room name '${roomName}': ${username}`);
        }
        return username;
    }
    
    return null;
}

/**
 * Get current user data using modern dispatch system with fallback
 */
async function getCurrentUser() {
    // First, try to extract username from current room if it's a den
    const roomId = await getCurrentRoomId();
    if (roomId && typeof roomId === 'string') {
        const extractedUsername = extractUsernameFromDenName(roomId);
        if (extractedUsername) {
            return { 
                userId: extractedUsername, 
                username: extractedUsername,
                source: 'extracted_from_den'
            };
        }
    }
    
    if (!window.jam || !window.jam.dispatch) {
        // Return captured username as fallback
        if (lastKnownUserName) {
            return { userId: lastKnownUserName, username: lastKnownUserName };
        }
        return null;
    }
    
    let user = null;
    try {
        user = await window.jam.dispatch.getState('player');
    } catch (e) {
        if (IS_DEV) console.log(`TFD: getState('player') failed: ${e.message}`);
    }
    
    // If we have a captured username that's different from dispatch, prefer the captured one
    if (lastKnownUserName && user) {
        // The dispatch might return numeric ID, but we want the actual username
        if (user.userId !== lastKnownUserName) {
            if (IS_DEV) {
                console.log(`TFD: Using captured username '${lastKnownUserName}' instead of dispatch ID '${user.userId}'`);
            }
            return { 
                userId: lastKnownUserName, 
                username: lastKnownUserName,
                originalUserId: user.userId 
            };
        }
    }
    
    // If no captured username but we have dispatch user, use that
    if (user) {
        return user;
    }
    
    // Final fallback to captured username
    if (lastKnownUserName) {
        return { userId: lastKnownUserName, username: lastKnownUserName };
    }
    
    return null;
}

/**
 * Check if user is in their den
 */
async function isUserInDen() {
    const roomId = await getCurrentRoomId();
    const user = await getCurrentUser();
    
    if (!roomId || !user || !user.userId) {
        if (IS_DEV) console.log(`TFD: isUserInDen check failed - roomId: ${roomId}, user: ${user?.userId}`);
        return false;
    }
    
    // Use the actual username to construct expected den name
    const expectedDenId = 'den' + user.userId;
    
    let isDen = false;
    
    // Method 1: Direct textual match (for textual room names like "denladyliya")
    if (typeof roomId === 'string' && (roomId === expectedDenId || roomId.startsWith(expectedDenId))) {
        isDen = true;
        if (IS_DEV) console.log(`TFD: Den detected via textual match: ${roomId}`);
    }
    
    // Method 2: Compare with captured room name if we have it
    if (!isDen && lastKnownRoomName) {
        if (lastKnownRoomName === expectedDenId || lastKnownRoomName.startsWith(expectedDenId)) {
            isDen = true;
            if (IS_DEV) console.log(`TFD: Den detected via captured room name: ${lastKnownRoomName}`);
        }
    }
     
    // Method 3: Check room state for den indicators
    if (!isDen && window.jam && window.jam.roomState) {
        try {
            const roomInfo = window.jam.roomState.getCurrentRoom();
            if (roomInfo) {
                // Check if room name contains "den"
                if (roomInfo.name && roomInfo.name.toLowerCase().includes('den')) {
                    isDen = true;
                    if (IS_DEV) console.log(`TFD: Den detected via roomState name: ${roomInfo.name}`);
                }
                // Check if room type or category indicates den
                if (roomInfo.type === 'den' || roomInfo.category === 'den') {
                    isDen = true;
                    if (IS_DEV) console.log(`TFD: Den detected via roomState type/category`);
                }
            }
        } catch (e) {
            if (IS_DEV) console.log(`TFD: roomState den check failed: ${e.message}`);
        }
    }
    
    // Method 4: For numeric room IDs, check if we have other indicators
    if (!isDen && typeof roomId === 'number') {
        // Check if the captured room name matches expected den
        if (lastKnownRoomName && lastKnownRoomName === expectedDenId) {
            isDen = true;
            if (IS_DEV) console.log(`TFD: Den detected via numeric room ID with matching captured name`);
        }
    }
    
    if (IS_DEV) {
        console.log(`TFD: Den check - roomId: ${roomId}, expectedDen: ${expectedDenId}, capturedRoom: ${lastKnownRoomName}, isDen: ${isDen}`);
    }
    
    return isDen;
}

/**
 * Periodic status check - modern approach like advertising plugin
 */
async function checkStatusAndUpdateUI() {
    try {
        const user = await getCurrentUser();
        const roomId = await getCurrentRoomId();
        const userInDen = await isUserInDen();
        
        if (IS_DEV) {
            console.log(`TFD: Status check - user: ${user?.userId}, room: ${roomId}, inDen: ${userInDen}, isAutomating: ${isAutomating}`);
        }
        
        // Update current user/room info
        if (user && user.userId) {
            currentUserId = user.userId;
        }
        
        if (roomId) {
            if (userInDen) {
                currentDenId = roomId;
            }
        }
        
        // Update ready state based on current status - removed den requirement
        const wasReady = isReady;
        isReady = !!(user && user.userId && !isAutomating);
        
        // Update UI if ready state changed OR if we're ready and button is still disabled
        const shouldUpdateUI = (wasReady !== isReady) || (isReady && startButton && startButton.disabled);
        
        if (shouldUpdateUI) {
            if (startButton) {
                startButton.disabled = !isReady;
            }
            
            if (isReady) {
                if (userInDen) {
                    updateStatus('Ready', 'Press Start to begin', 'success');
                    logActivity(`Ready: User ${currentUserId} in den ${currentDenId}`);
                } else {
                    updateStatus('Ready', 'Press Start to begin (in adventure)', 'success');
                    logActivity(`Ready: User ${currentUserId} in adventure ${roomId}`);
                }
            } else {
                if (!user || !user.userId) {
                    updateStatus('Waiting', 'Login data not found', 'warning');
                } else if (isAutomating) {
                    // Don't change status if we're automating
                } else {
                    updateStatus('Waiting', 'Checking status...', 'info');
                }
            }
        }
        
        // Initialize packet templates if we have user data but templates aren't ready
        if (user && user.userId && joinTfdPackets.length === 0) {
            await initializePacketTemplates();
        }
        
    } catch (error) {
        console.error('TFD Automator: Error in status check:', error);
        logActivity(`Status check error: ${error.message}`);
    }
}

/**
 * Initialize packet templates with current user/room data
 */
async function initializePacketTemplates() {
    const user = await getCurrentUser();
    const roomId = await getCurrentRoomId();
    
    if (!user || !user.userId) {
        throw new Error('User data not available');
    }
    
    if (!roomId) {
        throw new Error('Room ID not available');
    }
    
    currentUserId = user.userId;
    currentDenId = roomId;
    
    logActivity(`Initializing templates for User ID: ${currentUserId}`);
    logActivity(`Using Room ID: ${currentDenId}`);

    // Get numeric room ID for packet routing
    const numericRoomId = await window.jam.dispatch.getState('internalRoomId');
    
    if (IS_DEV) {
        console.log(`TFD: Template init -> numericRoomId=${numericRoomId}, currentDenId=${currentDenId}, user=${currentUserId}`);
    }
    
    // Host (create) the adventure requires two packets:
    // 1) qjc to create lobby, 2) pubMsg on%11 to switch to ON state
    joinTfdPackets = [
        { type: "aj", content: `%xt%o%qjc%${numericRoomId}%${currentDenId}%23%0%`, delay: "0.8" },
        { type: "connection", content: `<msg t=\"sys\"><body action=\"pubMsg\" r=\"${numericRoomId}\"><txt><![CDATA[on%11]]></txt></body></msg>`, delay: "0.8" }
    ];

    startTfdPackets = [
        { type: "aj", content: `%xt%o%qs%${numericRoomId}%${currentDenId}%`, delay: "1.0" },
        { type: "connection", content: `<msg t=\"sys\"><body action=\"pubMsg\" r=\"${numericRoomId}\"><txt><![CDATA[off%11]]></txt></body></msg>`, delay: "1.0" }
    ];

    // Reward Collection Sequence - Based on packets.txt "Opening chests" section
    // Note: These will use current room ID when sent (will be in TFD adventure)
    collectRewardsPackets = [
        { type: "aj", content: "%xt%o%qpgift%{room}%0%0%0%", delay: "0.8" },
        { type: "aj", content: "%xt%o%qpgift%{room}%1%0%0%", delay: "0.8" },
        { type: "aj", content: "%xt%o%qpgift%{room}%-1%0%1%", delay: "0.8" },
        { type: "aj", content: "%xt%o%qpgift%{room}%-1%0%1%", delay: "0.8" },
        { type: "aj", content: "%xt%o%qpgiftdone%{room}%1%", delay: "1.0" }
    ];

    // Adventure Leave Sequence - Based on packets.txt "Left adventure" section
    // Note: This will use current room ID when sent (will be in TFD adventure)
    leaveTfdPackets = [
        { type: "aj", content: "%xt%o%qx%{room}%", delay: "1.0" }
    ];
}

// --- UI Elements ---
// Controls
let startButton;
let stopButton;
let loadButton;
let pauseButton;
let speedSlider;
let speedValueDisplay;
// Crystal Progress
let progressGreen, progressYellow, progressBlue, progressGrey;
let progressTextGreen, progressTextYellow, progressTextBlue, progressTextGrey;
// Status
let statusIcon;
let statusText1;
let statusText2;
// Full Automation Status
let fullAutoStatus;
let currentPhaseText;
let cycleCountText;
let automationProgress;
// Full automation toggle
let fullAutoButton;
let fullAutoText;
// Activity Log
let activityLog;

// --- Core Functions ---

/**
 * Extracts a readable identifier from the packet content.
 */
function getPacketIdentifier(packetContent) {
    try {
        const parts = packetContent.split('%');
        
        // Crystal packets (1crystal_, 2crystal_, 3crystal_, 4crystal_)
        const crystalPart = parts.find(part => /^[1234]crystal_\d+[ab]$/.test(part));
        if (crystalPart) return crystalPart;
        
        // Pail/water packets
        const pailPart = parts.find(part => /^3pail_\d+[e]$/.test(part));
        if (pailPart) return pailPart;
        
        const waterPart = parts.find(part => /^3water_\d+[ab]$/.test(part));
        if (waterPart) return waterPart;
        
        // Socvol (cactus) packets
        const socvolPart = parts.find(part => /^[45]socvol/.test(part));
        if (socvolPart) return socvolPart;
        
        // TFD Treasure packets
        if (parts.includes('qpgift')) {
            const giftNumIndex = parts.indexOf('qpgift') + 2;
            if (parts.length > giftNumIndex && !isNaN(parseInt(parts[giftNumIndex]))) {
                return `tfd-treasure-${parts[giftNumIndex]}`;
            }
            return 'tfd-treasure';
        }
        
        if (parts.includes('qpgiftdone')) {
            return 'tfd-treasure-done';
        }
        
        // Adventure control packets
        if (parts.includes('qx')) return 'leave-adventure';
        if (parts.includes('qjc')) return 'join-adventure';
        if (parts.includes('qs')) return 'start-adventure';
        
        return 'Unknown Packet';
    } catch (error) {
        console.error('TFD Automator: Error parsing packet identifier:', error);
    return 'Unknown Packet';
    }
}

/**
 * Gets a user-friendly action message for the current packet
 */
function getFriendlyActionName(identifier) {
    // Yellow Diamond
    if (identifier.startsWith('2crystal_')) {
        return 'Grabbing Yellow Diamond';
    }
    // Green Hexagon
    if (identifier.startsWith('1crystal_')) {
        return 'Grabbing Green Hexagon';
    }
    // White Triangle
    if (identifier.startsWith('4socvol')) {
        return 'Activating White Triangle';
    }
    if (identifier.startsWith('4crystal_')) {
        return 'Collecting White Triangle';
    }
    // Blue Square
    if (identifier.startsWith('3pail_')) {
        return 'Getting Water Pail';
    }
    if (identifier.startsWith('3water_')) {
        return 'Watering with Pail';
    }
    if (identifier.startsWith('3crystal_')) {
        return 'Grabbing Blue Square';
    }
    
    // TFD Treasure chests
    if (identifier.startsWith('tfd-treasure-')) {
        if (identifier === 'tfd-treasure-done') {
            return 'Completing Treasure Collection';
        }
        const treasureNum = identifier.split('-')[2];
        return `Opening TFD Treasure Chest ${treasureNum}`;
    }
    
    // Regular Adventure treasure packets
    if (identifier.startsWith('spawn-treasure_')) {
        const treasureNum = identifier.split('_')[1];
        return `Spawning Treasure Chest ${treasureNum}`;
    }
    if (identifier.startsWith('claim-treasure_')) {
        const treasureNum = identifier.split('_')[1];
        return `Claiming Treasure Chest ${treasureNum}`;
    }
    
    // Adventure flow packets
    if (identifier === 'treasure-chest') {
        return 'Collecting Treasure Chest';
    }
    if (identifier === 'leave-adventure') {
        return 'Leaving Adventure';
    }
    if (identifier === 'join-adventure') {
        return 'Joining Adventure';
    }
    if (identifier === 'start-adventure') {
        return 'Starting Adventure';
    }
    
    return `Processing: ${identifier}`;
}

/**
 * Sends the next packet in the sequence.
 */
async function sendNextPacket() {
    if (!isAutomating || isPaused) {
        return;
    }

    // Ensure packets are loaded
    if (!packets || packets.length === 0) {
        logActivity("Error: No TFD packets loaded. Cannot send.");
        updateStatus("Error", "No packets loaded", "error");
        handleStop();
        return;
    }

    // Check if we've completed the sequence
    if (currentPacketIndex >= packets.length) {
        if (fullAutomationEnabled) {
            handlePhaseCompletion();
        } else {
            logActivity('Packet sequence completed');
            handleStop();
        }
        return;
    }

    const packetInfo = packets[currentPacketIndex];
    if (!packetInfo || !packetInfo.content) {
        logActivity(`Error: Packet at index ${currentPacketIndex} is invalid.`);
        currentPacketIndex++;
        setTimeout(sendNextPacket, currentSpeed);
        return;
    }

    try {
        // Get current room using modern dispatch system
        let roomId;
        const NEED_ADVENTURE_ID = ['gems', 'rewards', 'leave'].includes(currentAutomationPhase);

        if (NEED_ADVENTURE_ID && adventureRoomId) {
            roomId = adventureRoomId;
        } else {
            // Prefer numeric internalRoomId when available
            try {
                roomId = await window.jam.dispatch.getState('internalRoomId');
            } catch {}

            if (!roomId) {
                roomId = await getCurrentRoomId();
            }
        }

        if (!roomId) {
            logActivity("Error: Cannot get room ID. Pausing automation.");
            handlePauseResume();
            updateStatus("Error", "Room ID not found. Paused.", "error");
            return;
        }

        // Relaxed phase validation – only ensure we are in some room. Strict
        // room-phase checks previously caused pauses if server lagged.

        // Replace {room} placeholder and send packet, log result
        const packetContent = packetInfo.content.replace(/{room}/g, roomId);
        if (IS_DEV) {
            console.log(`[TFD DEBUG] (${currentAutomationPhase}) Packet #${currentPacketIndex+1}/${packets.length} → ${packetContent}`);
        }
        const packetIdentifier = getPacketIdentifier(packetContent);

        // Send the packet
        if (packetInfo.type === 'aj') {
            // Send AJ packet using the correct method
            window.jam.dispatch.sendRemoteMessage(packetContent);
        } else if (packetInfo.type === 'connection') {
            // Send connection packet using the correct method
            window.jam.dispatch.sendRemoteMessage(packetContent);
        }

            if (!shouldSkipUIUpdates()) {
            logActivity(`Sent: ${getFriendlyActionName(packetIdentifier)} (${currentPacketIndex + 1}/${packets.length})`);
        }

        // Update crystal progress
        const crystalType = getCrystalType(packetIdentifier);
        if (crystalType) {
            currentCrystalProgress[crystalType]++;
            updateCrystalProgressUI();
        }

        currentPacketIndex++;

        // Schedule next packet
        const delay = parseFloat(packetInfo.delay) * 1000 * (currentSpeed / 500);
        timeoutId = setTimeout(sendNextPacket, delay);

    } catch (error) {
        logActivity(`Error in sendNextPacket: ${error.message}`);
        if (IS_DEV) console.error("[TFD Automator] sendNextPacket error:", error);
        handlePauseResume();
        updateStatus("Error", "Runtime error. Paused.", "error");
    }
}

/**
 * Classifies which crystal type a packet is targeting.
 * @param {string} identifier The packet identifier from getPacketIdentifier
 * @returns {'yellow'|'green'|'white'|'blue'|null} The crystal type or null if not a crystal.
 */
function getCrystalType(identifier) {
    // Yellow Diamond Gems (2crystal_)
    if (identifier.startsWith('2crystal_')) {
        return 'yellow';
    }
    
    // Green Hexagon Gems (1crystal_)
    if (identifier.startsWith('1crystal_')) {
        return 'green';
    }
    
    // White Triangle Gems (4socvol or 4crystal_)
    if (identifier.startsWith('4socvol') || identifier.startsWith('4crystal_')) {
        return 'white';
    }
    
    // Blue Square Gems (3pail_, 3water_, 3crystal_)
    if (identifier.startsWith('3pail_') || 
        identifier.startsWith('3water_') || 
        identifier.startsWith('3crystal_')) {
        return 'blue';
    }
    
    return null;
}

/**
 * Updates the progress display for a specific crystal type.
 * @param {string} type The crystal type ('green', 'yellow', 'blue', 'grey')
 * @param {number} current Current progress
 * @param {number} total Total packets for this crystal
 */
function updateCrystalProgress(type, current, total) {
    if (type && total > 0) {
        currentCrystalProgress[type] = current / total;
        updateCrystalProgressUI();
    }
}

/**
 * Updates the status display and icon.
 * @param {string} message Primary status message
 * @param {string} [submessage] Secondary status message
 * @param {'success'|'error'|'loading'|'warning'} [type='success'] Status type
 */
function updateStatus(message, submessage = '', type = 'success') {
    if (shouldSkipUIUpdates()) return;
    
    try {
        // Original status update code
        if (statusText1) statusText1.innerText = message;
        if (statusText2) statusText2.innerText = submessage;
        
        if (statusIcon) {
            // Clear previous classes
            statusIcon.className = 'header-status-icon fas';
            
            // Set icon based on type
            switch (type) {
                case 'success':
                    statusIcon.classList.add('fa-check-circle', 'text-highlight-green');
                    break;
                case 'warning':
                    statusIcon.classList.add('fa-exclamation-triangle', 'text-warning-amber');
                    break;
                case 'error':
                    statusIcon.classList.add('fa-times-circle', 'text-error-red');
                    break;
                case 'info':
                default:
                    statusIcon.classList.add('fa-info-circle', 'text-highlight-blue');
                    break;
            }
        }
    } catch (error) {
        console.error('TFD Automator: Error updating status:', error);
    }
}

/**
 * Handles starting the automation sequence.
 */
async function handleStart() {
    try {
        // Initialize packet templates with current user/room data
        await initializePacketTemplates();
        
    if (packets.length === 0 && !fullAutomationEnabled) {
        updateStatus('Error: No packets loaded', 'Please load TFD first', 'error');
        logActivity('Cannot start: No packets loaded');
        return;
    }

    isAutomating = true;
    isPaused = false;
    
    // If full automation is enabled, start with the join phase
    if (fullAutomationEnabled) {
        logActivity("Full Automation ON: Starting complete sequence.");
        currentAutomationPhase = 'none'; // Will be set to 'join' by startAutomationPhase
        startAutomationPhase('join');
        return;
    }
    
    // Otherwise (Full Automation OFF), proceed with manual gem collection mode
    logActivity("Full Automation OFF: Starting manual gem collection sequence.");
    currentAutomationPhase = 'gems'; // Assume user is in TFD for gem collection
    currentPacketIndex = 0;
    
    // Reset crystal progress for the manual gem run
    Object.keys(currentCrystalProgress).forEach(type => {
        currentCrystalProgress[type] = 0;
        updateCrystalProgress(type, 0, crystalPacketCounts[type]);
    });

    // Update UI
    startButton.disabled = true;
    stopButton.disabled = false;
    pauseButton.disabled = false;
    loadButton.disabled = true;
    speedSlider.disabled = true;

    // Show initial status with timing info
    const usePacketDelays = currentSpeed === 500;
    const timingInfo = usePacketDelays ? 
        'Using original packet delays' : 
        `Using fixed speed: ${currentSpeed}ms`;
    
    updateStatus('Running...', timingInfo, 'loading');
    logActivity(`Starting automation sequence (${timingInfo})`);
    
    sendNextPacket();
    } catch (error) {
        logActivity(`Error starting automation: ${error.message}`);
        updateStatus('Error', 'Failed to start automation', 'error');
        console.error('TFD Automator: Start error:', error);
    }
}

/**
 * Handles stopping the automation sequence.
 */
function handleStop() {
    isAutomating = false;
    isPaused = false;
    isReady = false; // Reset ready state on stop
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }

    // Update UI
    startButton.disabled = true; // Disable start until user re-enters den
    stopButton.disabled = true;
    pauseButton.disabled = true;
    loadButton.disabled = false;
    speedSlider.disabled = false;
    pauseButton.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';

    // Reset status to indicate need to enter den
    updateStatus('Stopped', 'Please enter your den', 'warning');
    logActivity('Automation stopped by user. Please re-enter den to enable start.');

    // Reset full automation status if needed
    if (fullAutomationEnabled) {
        currentAutomationPhase = 'none';
        updateFullAutomationStatus();
    }
}

/**
 * Handles pausing/resuming the automation sequence.
 */
function handlePauseResume() {
    // Ensure plugin is ready before allowing resume
    if (!isReady && !isPaused) return;
    if (isPaused) {
        // Resume
        isPaused = false;
        pauseButton.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';
        
        // Show timing mode in status
        const usePacketDelays = currentSpeed === 500;
        const timingInfo = usePacketDelays ? 
            'Using original packet delays' : 
            `Using fixed speed: ${currentSpeed}ms`;
        
        updateStatus('Running...', timingInfo, 'loading');
        logActivity(`Automation resumed (${timingInfo})`);
        
        // Clear any existing timeout
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        
        // Send next packet immediately instead of waiting for remaining delay
        sendNextPacket();
    } else {
        // Pause
        isPaused = true;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        pauseButton.innerHTML = '<i class="fas fa-play mr-2"></i>Resume';
        updateStatus('Paused', 'Click Resume to continue', 'warning');
        logActivity('Automation paused');
    }
}

/**
 * Handles loading/reloading the TFD packet sequence.
 */
async function handleLoadTFD() {
    try {
        updateStatus('Loading...', 'Fetching packet data', 'loading');
        logActivity('Loading TFD packet sequence...');
        
        const response = await fetch('tfd-packets.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        packets = await response.json();
        
        // Count packets per crystal type
        crystalPacketCounts = { yellow: 0, green: 0, white: 0, blue: 0 };
        packets.forEach(packet => {
            const identifier = getPacketIdentifier(packet.content);
            const type = getCrystalType(identifier);
            if (type) {
                crystalPacketCounts[type]++;
            }
        });
        
        // Log final counts
        Object.entries(crystalPacketCounts).forEach(([type, count]) => {
            logActivity(`Total ${type} crystal packets: ${count}`);
        });

        // Update UI with counts
        Object.keys(crystalPacketCounts).forEach(type => {
            updateCrystalProgress(type, 0, crystalPacketCounts[type]);
        });

        updateStatus('Ready', `Loaded ${packets.length} packets`, 'success');
        logActivity(`Successfully loaded ${packets.length} packets`);
        startButton.disabled = true;
        
    } catch (error) {
        console.error('TFD Automator: Failed to load packets:', error);
        updateStatus('Error', 'Failed to load packets', 'error');
        logActivity(`Error loading packets: ${error.message}`);
        packets = [];
        startButton.disabled = true;
    }
}

/**
 * Adds a timestamped message to the activity log.
 * @param {string} message The message to log.
 */
function logActivity(message) {
    // Always log to console regardless of UI state
    console.log(`TFD Automator: ${message}`);
    
    try {
        // Check if we should skip UI updates (background mode)
        if (shouldSkipUIUpdates()) return;
        
        // Ensure activityLog exists before trying to use it
        if (!activityLog) {
            // Try to get the activity log element if not already set
            activityLog = document.getElementById('activityLog');
            if (!activityLog) {
                console.warn("TFD Automator: Cannot access activity log element");
                return;
            }
        }
        
        // Create and append log entry
        const div = document.createElement('div');
        div.className = 'activity-item';
        
        // Add timestamp and message with proper escaping for HTML
        const timestamp = new Date().toLocaleTimeString();
        const safeMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        div.innerHTML = `<span class="text-gray-400">${timestamp}</span> ${safeMessage}`;
        
        // Prepend to log so newest items appear at top
        if (activityLog.prepend) {
            activityLog.prepend(div);
        } else {
            // Fallback if prepend is not supported
            activityLog.insertBefore(div, activityLog.firstChild);
        }
        
        // Limit the number of log entries to avoid performance issues
        while (activityLog.children.length > 100) {
            activityLog.removeChild(activityLog.lastChild);
        }
    } catch (error) {
        console.error("TFD Automator: Error updating activity log:", error);
    }
}

/**
 * Updates the full automation status UI
 */
function updateFullAutomationStatus() {
    // Skip updates if in background mode or elements don't exist
    if (shouldSkipUIUpdates()) return;
    
    // Safety checks for all UI elements
    if (fullAutoStatus) {
        fullAutoStatus.className = fullAutomationEnabled ? 
            'text-highlight-green' : 'text-gray-400';
        fullAutoStatus.innerText = fullAutomationEnabled ? 'Enabled' : 'Disabled';
    }
    
    if (currentPhaseText) {
        currentPhaseText.innerText = currentAutomationPhase === 'none' ? 
            'None' : currentAutomationPhase.charAt(0).toUpperCase() + currentAutomationPhase.slice(1);
    }
    
    if (cycleCountText) {
        cycleCountText.innerText = fullAutomationCycles.toString();
    }
    
    // Update progress bar if phases are happening
    if (automationProgress) {
        let progressValue = 0;
        
        switch (currentAutomationPhase) {
            case 'join':
                progressValue = 25;
                break;
            case 'gems':
                progressValue = 50;
                break;
            case 'rewards':
                progressValue = 75;
                break;
            case 'leave':
                progressValue = 90;
                break;
            case 'none':
            default:
                progressValue = fullAutomationEnabled ? 5 : 0;
                break;
        }
        
        automationProgress.style.width = `${progressValue}%`;
    }
    
    // Update the toggle button's visual state (active class is handled by handleFullAutomationToggle)
    // The CSS for .jam-button-toggle and .jam-button-toggle.active handles the visual change.
    // No direct style manipulation needed here for the button itself if 'active' class is sufficient.
    // if (fullAutoButton) { ... } // Removed redundant style changes for fullAutoButton

    if (fullAutoText) {
        fullAutoText.innerText = fullAutomationEnabled ? 'On' : 'Off';
    }
    
    // Show/hide phase indicator
    if (currentPhaseIndicator) {
        if (fullAutomationEnabled && currentAutomationPhase !== 'none') {
            currentPhaseIndicator.classList.remove('hidden');
        } else {
            currentPhaseIndicator.classList.add('hidden');
        }
    }
}

/**
 * Handles enabling/disabling full automation
 */
function handleFullAutomationToggle() {
    // Check if necessary UI elements exist
    // fullAutoButton is assigned in initialize()
    const hasUIElements = fullAutoButton && fullAutoText;
    
    if (!hasUIElements) {
        console.error('TFD Automator: UI elements for full automation (fullAutoButton or fullAutoText) not found');
        if (activityLog) { // Check if activityLog itself exists
            logActivity('Error: UI elements for full automation (button/text) not found');
        }
    }
    
    fullAutomationEnabled = !fullAutomationEnabled;

    if (fullAutomationEnabled) {
        logActivity('Full automation mode enabled - Enter den to begin');
        fullAutomationCycles = 0;
        
        // Update UI safely with null checks
        if (fullAutoButton) { // Check fullAutoButton
            fullAutoButton.classList.add('active'); // 'active' class toggles visual state
            // The text content of the button itself doesn't need to change here if it's just an icon/label
        }
        
        // fullAutoText is part of the status bar, not the button itself
        // This text is updated in updateFullAutomationStatus

        updateFullAutomationStatus(); // This will update fullAutoText and other related UI
        
        // Keep start button disabled until den confirmed
        if (startButton) {
            startButton.disabled = true;
        }
    } else {
        logActivity('Full automation mode disabled');
        handleStop(); // Stop current automation and reset state
        
        // Update UI safely with null checks
        if (fullAutoButton) { // Check fullAutoButton
            fullAutoButton.classList.remove('active');
        }
        
        // fullAutoText is part of the status bar, not the button itself
        // This text is updated in updateFullAutomationStatus

        updateFullAutomationStatus(); // This will update fullAutoText and other related UI
    }
}

/**
 * Starts a new phase of the full automation process
 * @param {string} phase - The phase to start ('join', 'start', 'gems', 'rewards', 'leave')
 */
function startAutomationPhase(phase) {
    if (!fullAutomationEnabled || isPaused) return; // Remove isReady check for full automation
    
    currentAutomationPhase = phase;
    let phasePackets = [];
    
    switch(phase) {
        case 'join': 
            logActivity(`Starting automation cycle #${fullAutomationCycles + 1} - Joining TFD`);
            updateStatus('Joining TFD', 'Opening adventure map', 'loading');
            phasePackets = joinTfdPackets;
            break;
        case 'start':
            logActivity(`Starting TFD adventure`);
            updateStatus('Starting Adventure', 'Initializing TFD session', 'loading');
            phasePackets = startTfdPackets;
            break;
        case 'gems':
            logActivity(`Collecting gems in TFD`);
            updateStatus('Collecting Gems', 'Starting gem collection', 'loading');
            
            // Load gem packets directly instead of using handleLoadTFD
            try {
                const loadGemPackets = async () => {
                    try {
                        const response = await fetch('tfd-packets.json');
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        
                        const gemPackets = await response.json();
                        
                        // Count packets per crystal type
                        crystalPacketCounts = { yellow: 0, green: 0, white: 0, blue: 0 };
                        gemPackets.forEach(packet => {
                            const identifier = getPacketIdentifier(packet.content);
                            const type = getCrystalType(identifier);
                            if (type) {
                                crystalPacketCounts[type]++;
                            }
                        });
                        
                        // Reset crystal progress
                        Object.keys(currentCrystalProgress).forEach(type => {
                            currentCrystalProgress[type] = 0;
                            updateCrystalProgress(type, 0, crystalPacketCounts[type]);
                        });
                        
                        // Start gem collection with loaded packets
                        packets = gemPackets;
                        currentPacketIndex = 0;
                        isAutomating = true;
                        
                        // UI updates
                        startButton.disabled = true;
                        stopButton.disabled = false;
                        pauseButton.disabled = false;
                        loadButton.disabled = true;
                        speedSlider.disabled = true;
                        
                        // Update full automation status
                        updateFullAutomationStatus();
                        
                        // Start sending packets
                        sendNextPacket();
                        
                    } catch (error) {
                        console.error('TFD Automator: Failed to load gem packets:', error);
                        logActivity(`Error loading gem packets: ${error.message}`);
                        
                        // Move to next phase if we can't load gems
                        handlePhaseCompletion();
                    }
                };
                
                loadGemPackets();
                return; // Return early as we're handling this asynchronously
            } catch (error) {
                logActivity(`Error in gems phase: ${error.message}`);
                handlePhaseCompletion();
                return;
            }
        case 'rewards':
            logActivity(`Collecting rewards/treasure chests`);
            updateStatus('Collecting Rewards', 'Opening treasure chests', 'loading');
            phasePackets = collectRewardsPackets;
            break;
        case 'leave':
            logActivity(`Leaving TFD adventure`);
            updateStatus('Leaving Adventure', 'Exiting to Jamaa Township', 'loading');
            phasePackets = leaveTfdPackets;
            break;
        default:
            logActivity(`Unknown phase: ${phase}`);
            return;
    }
    
    // Set packets and start automation
    packets = phasePackets;
    currentPacketIndex = 0;
    isAutomating = true;
    
    // UI updates
    startButton.disabled = true;
    stopButton.disabled = false;
    pauseButton.disabled = false;
    loadButton.disabled = true;
    speedSlider.disabled = true;
    
    // Update full automation status
    updateFullAutomationStatus();
    
    // Start sending packets
    sendNextPacket();
}

/**
 * Handle the completion of a phase in the full automation process
 */
function handlePhaseCompletion() {
    if (!fullAutomationEnabled) return; // Remove isReady check for full automation
    
    // Determine the next phase based on the current one
    let nextPhase;
    switch(currentAutomationPhase) {
        case 'join':
            nextPhase = 'start';
            break;
        case 'start':
            nextPhase = 'gems';
            break;
        case 'gems':
            nextPhase = 'rewards';
            break;
        case 'rewards':
            nextPhase = 'leave';
            break;
        case 'leave':
            // Completed a full cycle
            fullAutomationCycles++;
            logActivity(`Completed full automation cycle #${fullAutomationCycles}`);
            updateFullAutomationStatus(); // Update cycle count
            nextPhase = 'join';
            break;
        default:
            nextPhase = 'join'; // Default to starting over
            break;
    }
    
    // Update status to indicate transition
    if (nextPhase === 'join' && currentAutomationPhase === 'leave') { // End of a full cycle
        updateStatus('Cycle Complete', `Starting new cycle shortly... (Cycle ${fullAutomationCycles + 1})`, 'success');
    } else {
        updateStatus('Phase Complete', `Advancing to ${nextPhase} phase...`, 'loading');
    }
    
    // Short delay before starting next phase
    setTimeout(() => {
        // Re-check flags before starting next phase
        if (fullAutomationEnabled && !isPaused) {
            startAutomationPhase(nextPhase);
        } else {
            logActivity(`Full automation next phase (${nextPhase}) aborted due to state change (enabled: ${fullAutomationEnabled}, paused: ${isPaused})`);
            // If automation was stopped or paused during the delay, ensure status reflects this.
            if (!isAutomating) {
                 handleStop(); // This will set appropriate status
            } else if (isPaused) {
                 updateStatus('Paused', 'Click Resume to continue', 'warning');
            }
        }
    }, 2000); // 2 second pause between phases
}

/**
 * Check if we're in background mode and should minimize UI updates
 * @returns {boolean} True if UI updates should be skipped
 */
function shouldSkipUIUpdates() {
    return isBackgroundMode;
}

/**
 * Handles background mode transition
 * @param {boolean} background Whether we're entering background mode
 */
function handleBackgroundModeChange(background) {
    isBackgroundMode = background;
    
    if (background) {
        // Entering background mode - log this event
        logActivity('Entering background mode - UI updates minimized');
        console.log('TFD Automator: Running in background mode');
    } else {
        // Returning to foreground - refresh all UI elements
        logActivity('Returning to foreground mode - refreshing UI');
        console.log('TFD Automator: Returning to foreground mode');
        
        // Force refresh UI elements with current state
        updateCrystalProgressUI();
        updateFullAutomationStatus();
        updatePauseResumeButtonState();
        
        // Refresh status text based on current state
        if (isAutomating) {
            if (isPaused) {
                updateStatus('Automating Paused', 'Click Resume to continue', 'warning');
            } else {
                updateStatus('Automating In Progress', currentAutomationPhase !== 'none' ? 
                    `Current phase: ${currentAutomationPhase}` : 'Processing packets...', 'success');
            }
        } else {
            // If not automating, reflect the true current state
            if (!isReady && currentUserId && currentDenId) { // Was stopped (or left den), needs den re-entry
                updateStatus('Stopped', 'Please enter your den', 'warning');
            } else if (!currentUserId) { // Not logged in or user ID lost
                 updateStatus('Waiting', 'Login data not found', 'warning');
            } else if (packets.length === 0 && !fullAutomationEnabled) { // Ready but no packets loaded for single mode
                updateStatus('Ready', 'Load TFD sequence', 'info');
            } else if (isReady) { // Properly ready to start (in den, user ID known)
                 updateStatus('Ready', 'Press Start to begin', 'success');
            } else { // Default/fallback if other states don't match (e.g. just initialized, no den entry yet)
                updateStatus('Waiting', 'Please enter your den', 'warning');
            }
        }
    }
}

/**
 * Updates the crystal progress UI elements if they exist and we're not in background mode
 */
function updateCrystalProgressUI() {
    if (shouldSkipUIUpdates()) return;
    
    try {
        // Update progress bars and text if they exist
        if (progressGreen) progressGreen.style.width = `${(currentCrystalProgress.green || 0) * 100}%`;
        if (progressYellow) progressYellow.style.width = `${(currentCrystalProgress.yellow || 0) * 100}%`;
        if (progressBlue) progressBlue.style.width = `${(currentCrystalProgress.blue || 0) * 100}%`;
        if (progressGrey) progressGrey.style.width = `${(currentCrystalProgress.white || 0) * 100}%`;
        
        // Update text percentages
        if (progressTextGreen) progressTextGreen.innerText = `${Math.round((currentCrystalProgress.green || 0) * 100)}%`;
        if (progressTextYellow) progressTextYellow.innerText = `${Math.round((currentCrystalProgress.yellow || 0) * 100)}%`;
        if (progressTextBlue) progressTextBlue.innerText = `${Math.round((currentCrystalProgress.blue || 0) * 100)}%`;
        if (progressTextGrey) progressTextGrey.innerText = `${Math.round((currentCrystalProgress.white || 0) * 100)}%`;
        
        // Update data attributes for hover tooltips
        if (progressGreen) progressGreen.setAttribute('data-percent', `${Math.round((currentCrystalProgress.green || 0) * 100)}%`);
        if (progressYellow) progressYellow.setAttribute('data-percent', `${Math.round((currentCrystalProgress.yellow || 0) * 100)}%`);
        if (progressBlue) progressBlue.setAttribute('data-percent', `${Math.round((currentCrystalProgress.blue || 0) * 100)}%`);
        if (progressGrey) progressGrey.setAttribute('data-percent', `${Math.round((currentCrystalProgress.white || 0) * 100)}%`);
    } catch (error) {
        console.error('TFD Automator: Error updating crystal progress UI:', error);
    }
}

/**
 * Update the pause/resume button state
 */
function updatePauseResumeButtonState() {
    if (shouldSkipUIUpdates() || !pauseButton) return;
    
    if (isPaused) {
        pauseButton.innerHTML = '<i class="fas fa-play"></i> Resume';
        pauseButton.classList.remove('bg-warning-amber/20', 'hover:bg-warning-amber/30', 'text-warning-amber');
        pauseButton.classList.add('bg-highlight-green/20', 'hover:bg-highlight-green/30', 'text-highlight-green');
    } else {
        pauseButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
        pauseButton.classList.remove('bg-highlight-green/20', 'hover:bg-highlight-green/30', 'text-highlight-green');
        pauseButton.classList.add('bg-warning-amber/20', 'hover:bg-warning-amber/30', 'text-warning-amber');
    }
}

/**
 * Initializes the plugin UI and logic.
 */
async function initialize() {
    if (IS_DEV) console.log("TFD Automator: Initializing...");
    logActivity("TFD Automator: Initializing...");

    // Helper to safely get elements
    const safeGetElement = (id, description) => {
        const element = document.getElementById(id);
        if (!element) {
            if (IS_DEV) console.warn(`TFD Automator: UI element not found: ${id} (${description})`);
            logActivity(`Warning: UI element missing - ${description}`);
        }
        return element;
    };

    // Cache UI elements
    // autoStartCheck removed as element is not in HTML
    startButton = safeGetElement('startButton', 'Start button'); // Corrected ID
    stopButton = safeGetElement('stopButton', 'Stop button'); // Corrected ID
    loadButton = safeGetElement('loadButton', 'Load TFD button'); // Corrected ID
    pauseButton = safeGetElement('pauseButton', 'Pause button'); // Corrected ID
    speedSlider = safeGetElement('speedSlider', 'Speed slider'); // Corrected ID
    speedValueDisplay = safeGetElement('speedValue', 'Speed value display'); // Corrected ID

    progressGreen = safeGetElement('progressGreen', 'Green crystal progress bar'); // Corrected ID
    progressYellow = safeGetElement('progressYellow', 'Yellow crystal progress bar'); // Corrected ID
    progressBlue = safeGetElement('progressBlue', 'Blue crystal progress bar'); // Corrected ID
    progressGrey = safeGetElement('progressGrey', 'Grey/White crystal progress bar'); // Corrected ID

    progressTextGreen = safeGetElement('progressTextGreen', 'Green crystal progress text'); // Corrected ID
    progressTextYellow = safeGetElement('progressTextYellow', 'Yellow crystal progress text'); // Corrected ID
    progressTextBlue = safeGetElement('progressTextBlue', 'Blue crystal progress text'); // Corrected ID
    progressTextGrey = safeGetElement('progressTextGrey', 'Grey/White crystal progress text'); // Corrected ID

    statusIcon = safeGetElement('statusIcon', 'Status icon'); // Corrected ID
    statusText1 = safeGetElement('statusText1', 'Primary status text'); // Corrected ID
    statusText2 = safeGetElement('statusText2', 'Secondary status text'); // Corrected ID

    fullAutoButton = safeGetElement('fullAutoButton', 'Full automation button'); // Corrected ID and variable name
    fullAutoText = safeGetElement('fullAutoText', 'Full automation text (status bar)'); // Corrected ID
    fullAutoStatus = safeGetElement('fullAutoStatus', 'Full automation status display (progress section)'); // Corrected ID
    currentPhaseText = safeGetElement('currentPhaseText', 'Current automation phase text'); // Corrected ID
    cycleCountText = safeGetElement('cycleCountText', 'Automation cycle count text'); // Corrected ID
    automationProgress = safeGetElement('automationProgress', 'Automation progress bar'); // Corrected ID
    
    activityLog = safeGetElement('activityLog', 'Activity log'); // Corrected ID

    // Event listeners for controls
    if (startButton) startButton.addEventListener('click', handleStart);
    if (stopButton) stopButton.addEventListener('click', handleStop);
    if (loadButton) loadButton.addEventListener('click', handleLoadTFD);
    if (pauseButton) pauseButton.addEventListener('click', handlePauseResume);
    // The fullAutoButton has an onclick="handleFullAutomationToggle()" in the HTML,
    // so no additional event listener is needed here for 'click'.
    // A 'change' event is not appropriate for a button.

    if (speedSlider) {
        speedSlider.addEventListener('input', () => {
            currentSpeed = parseInt(speedSlider.value);
            if (speedValueDisplay) speedValueDisplay.textContent = `${currentSpeed}ms`;
            logActivity(`Speed changed to ${currentSpeed}ms`);
        });
        // Initialize display
        currentSpeed = parseInt(speedSlider.value);
        if (speedValueDisplay) speedValueDisplay.textContent = `${currentSpeed}ms`;
    }

    // --- Check for missing critical UI elements ---
    const elementChecks = [
        { variable: startButton, name: 'Start button' },
        { variable: stopButton, name: 'Stop button' },
        { variable: loadButton, name: 'Load TFD button' },
        { variable: pauseButton, name: 'Pause button' },
        { variable: speedSlider, name: 'Speed slider' },
        { variable: speedValueDisplay, name: 'Speed value display' },
        { variable: progressGreen, name: 'Green crystal progress bar' },
        { variable: progressYellow, name: 'Yellow crystal progress bar' },
        { variable: progressBlue, name: 'Blue crystal progress bar' },
        { variable: progressGrey, name: 'Grey/White crystal progress bar' },
        { variable: progressTextGreen, name: 'Green crystal progress text' },
        { variable: progressTextYellow, name: 'Yellow crystal progress text' },
        { variable: progressTextBlue, name: 'Blue crystal progress text' },
        { variable: progressTextGrey, name: 'Grey/White crystal progress text' },
        { variable: statusIcon, name: 'Status icon' },
        { variable: statusText1, name: 'Primary status text' },
        { variable: fullAutoButton, name: 'Full automation button' },
        { variable: fullAutoText, name: 'Full automation text (status bar)' },
        { variable: fullAutoStatus, name: 'Full automation status display (progress section)' },
        { variable: currentPhaseText, name: 'Current automation phase text' },
        { variable: cycleCountText, name: 'Automation cycle count text' },
        { variable: automationProgress, name: 'Automation progress bar' },
        { variable: activityLog, name: 'Activity log' }
    ];

    const missingElementNames = [];
    for (const check of elementChecks) {
        if (!check.variable) {
            missingElementNames.push(check.name);
            // safeGetElement already logs an individual warning
        }
    }

    if (missingElementNames.length > 0) {
        const errorMsgDetails = `Missing UI elements: ${missingElementNames.join(', ')}.`;
        logActivity(`CRITICAL UI ERROR: ${errorMsgDetails} Plugin functionality will be impaired.`);
        // Try to update status, but statusIcon/statusText1 might be among the missing.
        // updateStatus itself has null checks for its target elements.
        updateStatus('UI Load Error', `Missing: ${missingElementNames.slice(0,2).join(', ')}` + (missingElementNames.length > 2 ? '...' : ''), 'error');
        
        // Disable any buttons that might exist to prevent partial functionality
        if (startButton) startButton.disabled = true;
        if (stopButton) stopButton.disabled = true;
        if (loadButton) loadButton.disabled = true;
        if (pauseButton) pauseButton.disabled = true;
        if (fullAutoButton) fullAutoButton.disabled = true;

        if (IS_DEV) console.error("TFD Automator: Initialization failed due to missing critical UI elements.");
        logActivity("TFD Automator: Initialization aborted. Please check plugin HTML or report this issue.");
        return; // Halt further initialization
    }
    // --- End UI element check ---

    // Start periodic status checking - modern approach like advertising plugin
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    // Check status every 2 seconds
    statusCheckInterval = setInterval(checkStatusAndUpdateUI, 2000);
    
    // Do an initial status check
    await checkStatusAndUpdateUI();
    
    logActivity("Started modern status checking system.");

    // Attach simple packet listener as fallback for room detection
    if (window.jam && typeof window.jam.onPacket === 'function') {
        try {
            window.jam.onPacket(simplePacketListener);
            logActivity("Attached fallback packet listener for room detection.");
        } catch (err) {
            logActivity("Warning: Could not attach fallback packet listener.");
        }
    }

    // Background mode detection
    if (window.jam && typeof window.jam.isAppMinimized === 'function') {
      isBackgroundMode = window.jam.isAppMinimized();
      if (IS_DEV) logActivity(`[TFD] Initial background mode: ${isBackgroundMode}`);
      // Listen for changes
      window.addEventListener('jam-background-tick', () => handleBackgroundModeChange(true));
      window.addEventListener('jam-foreground', () => handleBackgroundModeChange(false));
    } else {
        if (IS_DEV) logActivity("[TFD] Background mode detection not available.");
    }

    // Load default crystal packet counts - This function call was erroneous and is removed.
    // The logic for counting crystal packets is within handleLoadTFD.
    logActivity("TFD Automator: Loading TFD packet sequence (this will also count crystal packets)...");
    await handleLoadTFD(); // Corrected: Call handleLoadTFD directly

    // Initial UI setup - only if all elements were found
    if (startButton) startButton.disabled = true; // Explicitly disable start button initially
    if (stopButton) stopButton.disabled = true;
    if (pauseButton) pauseButton.disabled = true;

    updateStatus("Initialized", "Waiting for den entry", "info"); // Changed sub-message
    updatePauseResumeButtonState(); // Set initial button state
    updateFullAutomationStatus(); // Update full automation UI
    updateCrystalProgressUI(); // Initialize progress bars
    

    if (IS_DEV) console.log("TFD Automator: Initialization complete.");
    logActivity("TFD Automator: Initialization complete. Waiting for den entry.");
}

// Initialize the plugin once the dispatch object is ready
waitForDispatch(async () => {
    await initialize();
});

// Clean up intervals when page unloads
window.addEventListener('beforeunload', () => {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }
});

// ---- Monkey-patch sendRemoteMessage once for deep diagnostics ----
if (!window.__tfdRemotePatched && window.jam && window.jam.dispatch) {
    window.__tfdRemotePatched = true;
    const originalSend = window.jam.dispatch.sendRemoteMessage;
    window.jam.dispatch.sendRemoteMessage = function(msg) {
        if (IS_DEV) {
            console.log(`[TFD DEBUG] sendRemoteMessage → ${msg.substring(0,120)}...`);
        }
        return originalSend.call(this, msg);
    };
}
