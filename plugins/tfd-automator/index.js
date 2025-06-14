/**
 * TFD Automator Plugin Logic
 */

// Wait for the dispatch object to be ready
function waitForDispatch(callback) {
    if (window.jam && window.jam.dispatch) {
        callback();
    } else {
        console.log('TFD Automator: Waiting for dispatch...');
        setTimeout(() => waitForDispatch(callback), 100); // Check again shortly
    }
}

// --- Global Variables ---
let packets = [];
let isAutomating = false;
let isPaused = false; // Added pause state
let currentPacketIndex = 0;
let timeoutId = null;
let currentSpeed = 500; // Default speed in ms
let crystalPacketCounts = { yellow: 0, green: 0, white: 0, blue: 0 }; // Store counts per crystal
let currentCrystalProgress = { yellow: 0, green: 0, white: 0, blue: 0 }; // Store current progress
let autoStartEnabled = false; // Auto-start flag
let fullAutomationEnabled = false; // Full automation toggle
let currentAutomationPhase = 'none'; // Tracks which phase we're in (join, gems, rewards, leave)
let fullAutomationCycles = 0; // Number of completed cycles
let currentUserId = null; // Will store the current user's ID
let currentDenId = null; // Will store the current user's den ID
let loggedInUserId = null; // Store the confirmed logged-in user's ID
let isReady = false; // Flag to indicate if plugin is ready (user in den)
let isBackgroundMode = false; // Track if the application is minimized

const THE_FORGOTTEN_DESERT_QUEST_ID = "201"; // Standard Quest ID for The Forgotten Desert

// --- Predefined Packet Sequences - these will be populated dynamically ---
let denEntrySequence = []; // For %xt%o%dj% sequence
let joinTfdPackets = [];   // For Adventure Start sequence (gl, qjc)
let startTfdPackets = [];  // For actions within TFD (qs, qmi, etc.) - To be reviewed later
let collectRewardsPackets = []; // For TFD treasures - To be reviewed later
let leaveTfdPackets = [];  // For Adventure Completion sequence (qx)

/**
 * Initialize the packet templates with dynamic user values
 * ASSUMES currentUserId and currentDenId are correctly set globally
 * before this function is called by the packet listener.
 */
function initializePacketTemplates() {
    // User ID and den check are now done in handleJoinRoom before calling this

    logActivity(`Initializing templates for User ID: ${currentUserId}`);
    logActivity(`Using Den ID: ${currentDenId}`);

    // Now initialize the packet templates with these values

    // Den Entry Sequence (as per things-to-address.md and dev/packets.md I.A)
    // This sequence is defined but not currently used by startAutomationPhase.
    // The {userIdentifier} is currentUserId. {denId} in the example is the username.
    denEntrySequence = [
        { type: "aj", content: `%xt%o%dj%${currentUserId}%1%-1%`, delay: "1.0" }
    ];

    // Adventure Start Sequence (replaces the old joinTfdPackets)
    // As per things-to-address.md I.E.25-29 and dev/packets.md I.B
    // {roomId} here refers to THE_FORGOTTEN_DESERT_QUEST_ID
    // {userIdentifier} is currentUserId
    joinTfdPackets = [
        { type: "aj", content: `%xt%o%gl%${THE_FORGOTTEN_DESERT_QUEST_ID}%201%`, delay: "1.0" },
        { type: "aj", content: `%xt%o%qjc%${THE_FORGOTTEN_DESERT_QUEST_ID}%${currentUserId}%23%0%`, delay: "1.0" }
    ];

    // startTfdPackets: For actions *within* TFD. To be reviewed based on full packet research.
    // Keeping existing definition for now.
    startTfdPackets = [
        { type: "aj", content: `%xt%o%qs%{room}%${currentDenId}%`, delay: "1.0" }, // Parameter {currentDenId} here is likely incorrect for qs, needs review.
        { type: "connection", content: "<msg t=\"sys\"><body action=\"pubMsg\" r=\"{room}\"><txt><![CDATA[off%11]]></txt></body></msg>", delay: "1.0" },
        { type: "aj", content: "%xt%o%qmi%{room}%", delay: "1.0" },
        { type: "aj", content: "%xt%o%au%{room}%1%111%5544%14%0%", delay: "1.0" },
        { type: "aj", content: "%xt%o%gl%{room}%47%", delay: "0.5" }, // These gl packets are for sub-locations within TFD
        { type: "aj", content: "%xt%o%gl%{room}%66%", delay: "0.5" },
        { type: "aj", content: "%xt%o%gl%{room}%158%", delay: "0.5" },
        { type: "aj", content: "%xt%o%gl%{room}%170%", delay: "0.5" },
        { type: "aj", content: "%xt%o%gl%{room}%333%", delay: "0.5" }
    ];

    // collectRewardsPackets: For TFD treasures. Keeping existing definition for now.
    collectRewardsPackets = [
        { type: "aj", content: "%xt%o%qpgift%{room}%0%0%0%", delay: "0.8" },
        { type: "aj", content: "%xt%o%qpgift%{room}%1%0%0%", delay: "0.8" },
        { type: "aj", content: "%xt%o%qpgift%{room}%2%0%0%", delay: "0.8" },
        { type: "aj", content: "%xt%o%qpgift%{room}%3%0%0%", delay: "0.8" },
        { type: "aj", content: "%xt%o%qpgiftdone%{room}%1%", delay: "1.0" }
    ];

    // Adventure Completion Sequence (replaces the old leaveTfdPackets)
    // As per things-to-address.md I.E.30-33 and dev/packets.md I.C
    // {roomId} will be the current TFD adventure instance ID.
    // dev/packets.md suggests client sends only one param for qx.
    leaveTfdPackets = [
        { type: "aj", content: `%xt%o%qx%{room}%`, delay: "1.0" }
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
let fullAutoButton; // Renamed from fullAutoToggle to match HTML id
let fullAutoText;
// Activity Log
let activityLog;

// --- Core Functions ---

/**
 * Extracts a readable identifier from the packet content.
 * Example: "%xt%o%qat%{room}%1crystal_05a%0%" -> "crystal_05a"
 * @param {string} packetContent The raw packet string.
 * @returns {string} A readable identifier or 'Unknown Packet'.
 */
function getPacketIdentifier(packetContent) {
    try {
        const parts = packetContent.split('%');
        
        // Look for specific packet types in order:
        
        // Crystal packets (1crystal_, 2crystal_, 3crystal_, 4crystal_)
        const crystalPart = parts.find(part => /^[1234]crystal_\d+[ab]$/.test(part));
        if (crystalPart) return crystalPart;
        
        // Pail/water packets
        const pailPart = parts.find(part => /^3pail_\d+[e]$/.test(part));
        if (pailPart) return pailPart;
        
        const waterPart = parts.find(part => /^3water_\d+[ab]$/.test(part));
        if (waterPart) return waterPart;
        
        // Socvol (cactus) packets
        const socvolPart = parts.find(part => /^4socvol/.test(part));
        if (socvolPart) return socvolPart;
        
        // TFD Treasure packets
        if (parts.includes('qpgift')) {
            // Extract gift number if available
            const giftNumIndex = parts.indexOf('qpgift') + 2;
            if (parts.length > giftNumIndex && !isNaN(parseInt(parts[giftNumIndex]))) {
                return `tfd-treasure-${parts[giftNumIndex]}`;
            }
            return 'tfd-treasure';
        }
        
        if (parts.includes('qpgiftdone')) {
            return 'tfd-treasure-done';
        }
        
        // Treasure packets (adventure plugin style)
        const treasurePart = parts.find(part => /^treasure_\d+$/.test(part));
        if (treasurePart) {
            // Check if this is a spawn or claim packet
            if (parts.includes('qat')) {
                return `spawn-${treasurePart}`;
            } else if (parts.includes('qatt')) {
                return `claim-${treasurePart}`;
            }
            return treasurePart;
        }
        
        // Check for common packet types by command
        if (parts.includes('qx')) {
            return 'leave-adventure';
        }
        
        if (parts.includes('qjc')) {
            return 'join-adventure';
        }
        
        if (parts.includes('qs')) {
            return 'start-adventure';
        }
        
    } catch (error) {
        console.error('TFD Automator: Error parsing packet identifier:', error);
    }
    return 'Unknown Packet';
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
    if (!isAutomating || isPaused || !isReady) {
        if (IS_DEV) {
            if (!isAutomating) logActivity("sendNextPacket: Not automating.");
            if (isPaused) logActivity("sendNextPacket: Automation paused.");
            if (!isReady) logActivity("sendNextPacket: Not ready (not in den or templates not init).");
        }
        return;
    }

    // Ensure packets are loaded
    if (!packets || packets.length === 0) {
        logActivity("Error: No TFD packets loaded. Cannot send.");
        updateStatus("Error", "No packets loaded", "error");
        handleStop(); // Stop automation if no packets
        return;
    }

    // Ensure currentPacketIndex is valid
    if (currentPacketIndex < 0 || currentPacketIndex >= packets.length) {
        logActivity(`Error: Invalid packet index: ${currentPacketIndex}. Resetting.`);
        currentPacketIndex = 0; // Reset to first packet
        // Potentially stop or pause automation here depending on desired behavior
    }

    const packetInfo = packets[currentPacketIndex];
    if (!packetInfo || !packetInfo.content) {
        logActivity(`Error: Packet at index ${currentPacketIndex} is invalid or has no content.`);
        // Skip this packet and try the next one, or stop
        currentPacketIndex = (currentPacketIndex + 1) % packets.length;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(sendNextPacket, currentSpeed); 
        return;
    }

    try {
        const roomId = await window.jam.dispatch.getState('room');

        if (!roomId) {
            logActivity("Error: Cannot get room ID. Ensure you are in a room. Pausing automation.");
            handlePauseResume(); // Pause automation
            updateStatus("Error", "Room ID not found. Paused.", "error");
            return;
        }
        if (IS_DEV) logActivity(`[TFD] Got room '${roomId}' from dispatch.getState`);

        // --- Room State Validation based on Automation Phase ---
        if (fullAutomationEnabled && window.jam && window.jam.roomUtils) {
            const isUserInDen = roomId === currentDenId;
            const isUserInAdventure = window.jam.roomUtils.isAdventureRoom(roomId);

            let expectedRoomType = null; // 'den', 'adventure', or null if any is fine for the phase
            let phaseErrorMessage = '';

            switch (currentAutomationPhase) {
                case 'start':
                case 'gems':
                case 'rewards':
                    expectedRoomType = 'adventure';
                    if (!isUserInAdventure) {
                        phaseErrorMessage = `Expected to be in an adventure for '${currentAutomationPhase}' phase, but in room ${roomId}.`;
                    }
                    break;
                case 'leave':
                    expectedRoomType = 'adventure';
                    if (!isUserInAdventure) {
                        phaseErrorMessage = `Expected to be in an adventure for 'leave' phase, but in room ${roomId}.`;
                    }
                    break;
                case 'join':
                    // 'join' phase starts in den and transitions. The initial 'isReady' (in den) check covers the start.
                    // Packets in this phase handle the actual room changes.
                    // No specific room type check here as it's a transitional phase.
                    break;
                case 'none': // Should not happen if automation is running correctly
                    logActivity(`Warning: Full automation active but phase is 'none'. Current room: ${roomId}`);
                    break;
            }

            if (phaseErrorMessage) {
                logActivity(`Room State Error: ${phaseErrorMessage}`);
                updateStatus("Room Error", `Incorrect room for ${currentAutomationPhase}. Paused.`, "error");
                handlePauseResume(); // Pause automation
                return;
            }
        }
        // --- End Room State Validation ---

        // Replace {room} placeholder
        const packetContent = packetInfo.content.replace(/{room}/g, roomId);
        const packetIdentifier = getPacketIdentifier(packetContent); // Get identifier for logging

        // Send the packet using the dispatch system
        if (window.jam && window.jam.dispatch && typeof window.jam.dispatch.sendRemoteMessage === 'function') {
            window.jam.dispatch.sendRemoteMessage(packetContent);
            if (!shouldSkipUIUpdates()) {
                logActivity(`Sent: ${getFriendlyActionName(packetIdentifier)} (Room: ${roomId})`);
            } else if (IS_DEV) {
                // Minimal log for background mode if needed
                 if (Math.random() < 0.05) logActivity(`(BG) Sent: ${packetIdentifier}`);
            }
        } else {
            logActivity("Error: Dispatch system not available to send packet.");
            updateStatus("Error", "Dispatch not ready", "error");
            handleStop(); // Stop if dispatch is not working
            return;
        }

        // Update crystal progress if it's a crystal packet
        const crystalType = getCrystalType(packetIdentifier);
        if (crystalType) {
            currentCrystalProgress[crystalType]++;
            updateCrystalProgressUI(); // Update UI if not in background
        }

        // Move to the next packet
        currentPacketIndex = (currentPacketIndex + 1) % packets.length;

        // Schedule the next packet send
        if (timeoutId) clearTimeout(timeoutId); // Clear existing timeout

        let actualDelay = currentSpeed;
        // When currentSpeed is 500ms, it signifies using individual packet delays.
        // The value 500 is used as a sentinel based on the speedSlider's default and handleStart logic.
        if (currentSpeed === 500 && packetInfo.delay) {
            const parsedDelay = parseFloat(packetInfo.delay);
            if (!isNaN(parsedDelay) && parsedDelay >= 0) { // Allow 0 delay
                actualDelay = parsedDelay * 1000;
                if (IS_DEV && actualDelay !== currentSpeed) {
                    // Log only if the actualDelay is different from the default currentSpeed, to avoid spam for 0.5s delays
                    // logActivity(`Using packet-specific delay: ${actualDelay}ms for ${packetIdentifier}`);
                }
            } else {
                logActivity(`Warning: Invalid or missing delay for packet ${packetIdentifier} ('${packetInfo.delay}'). Using default speed ${currentSpeed}ms.`);
                // actualDelay remains currentSpeed (500ms in this branch)
            }
        }
        // If currentSpeed is not 500, actualDelay is already set to currentSpeed (the fixed value from slider).
        
        timeoutId = setTimeout(sendNextPacket, actualDelay);

    } catch (error) {
        logActivity(`Error in sendNextPacket: ${error.message}`);
        if (IS_DEV) console.error("[TFD Automator] sendNextPacket error details:", error);
        handlePauseResume(); // Pause on error
        updateStatus("Error", `Runtime error. Paused.`, "error");
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
function handleStart() {
    // Add check if the plugin is ready (user confirmed in den)
    if (!isReady) {
        updateStatus('Error', 'Must be in den to start', 'error');
        logActivity('Cannot start: User not confirmed in den.');
        return;
    }
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
                                     // Room validation in sendNextPacket will check if in adventure.
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
    if (!fullAutomationEnabled || isPaused || !isReady) return; // Also check isReady
    
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
    if (!fullAutomationEnabled || !isReady) return; // Also check isReady
    
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
        if (fullAutomationEnabled && !isPaused && isReady) {
            startAutomationPhase(nextPhase);
        } else {
            logActivity(`Full automation next phase (${nextPhase}) aborted due to state change (enabled: ${fullAutomationEnabled}, paused: ${isPaused}, ready: ${isReady})`);
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
 * Processes the room join packet to confirm user ID and den location.
 */
async function handleJoinRoom(packetData) {
    try {
        const message = packetData?.message || packetData?.data; // Handle potential different structures
        
        // Use room utils if available for better parsing
        if (window.jam && window.jam.roomUtils) {
            const roomData = window.jam.roomUtils.parseRoomPacket(message);
            
            if (roomData && roomData.type === 'room_join_response') {
                if (roomData.status === '1') { // Successfully joined room
                    let actualRoomId = roomData.roomId; // Get room ID from parsed packet initially

                    
                    if (!actualRoomId && IS_DEV) { // If still no room ID
                        logActivity(`handleJoinRoom: Could not determine actualRoomId even after roomState check.`);
                        // Fallback to parts[4] will happen later if this path is taken.
                    }
 
                    // Attempt to get the logged-in user ID using standardized utilities
                    if (!loggedInUserId && window.jam && window.jam.dispatch) {
                        const player = await dispatch.getState('player');
                        loggedInUserId = player?.userId;
                    }
                    
                    if (!loggedInUserId) {
                        logActivity("Listener Error: Could not get logged-in User ID yet.");
                        updateStatus('Waiting', 'Login data not found yet', 'warning');
                        isReady = false;
                        startButton.disabled = true;
                        return;
                    }
                    
                    const expectedDenId = 'den' + loggedInUserId;
                    
                    // Check if the joined room is the user's den
                    if (actualRoomId && actualRoomId.startsWith(expectedDenId)) {
                        logActivity(`Confirmed user ${loggedInUserId} entered den ${actualRoomId}. Ready.`);
                        currentUserId = loggedInUserId; // Set global ID for templates
                        currentDenId = actualRoomId;   // Set global den ID
                        initializePacketTemplates();   // Initialize templates now
                        updateStatus('Ready', 'In den. Ready to start.', 'success');
                        isReady = true;
                        if (startButton) startButton.disabled = false;  // Enable start button
                    } else {
                        // User joined a different room that is NOT their den
                        logActivity(`User in room: ${actualRoomId}. This is not the den. Waiting for den entry.`);
                        updateStatus('Waiting', 'Please enter your den', 'warning');
                        isReady = false;
                        // currentUserId and currentDenId should only be nullified if we are certain they are invalid.
                        // If they were set from a previous den entry, they might still be needed if user quickly returns.
                        // However, for starting automation, isReady=false is the key.
                        if (startButton) startButton.disabled = true;
                    }
                } else {
                    // Failed to join room (status !== '1')
                     logActivity(`Failed to join room ${roomData.roomId} (status: ${roomData.status}). Waiting for den entry.`);
                     updateStatus('Error Joining Room', 'Please enter your den', 'error');
                     isReady = false;
                     if (startButton) startButton.disabled = true;
                }
                return; // Handled by roomUtils
            }
        }
        
        // Fall back to original parsing if room utils not available or packet was not j#jr
        // This part will also execute if roomUtils.parseRoomPacket didn't return a valid room_join_response
        if (!message || typeof message !== 'string' || !message.startsWith('%xt%j#jr%')) {
            if (IS_DEV && message && typeof message === 'string' && !message.startsWith('%xt%j#jr%')) {
                // Log if it's a message but not j#jr, to ensure we're not missing other relevant packets for room state.
                // logActivity(`handleJoinRoom: Received non-j#jr packet: ${message.substring(0, 50)}`);
            }
            return;
        }
        
        // If we reached here, it means roomUtils parsing might have failed or wasn't applicable,
        // and we are dealing with a raw j#jr packet.

        // Attempt to get the logged-in user ID if we haven't already
        if (!loggedInUserId && window.jam && window.jam.dispatch) {
            const player = await dispatch.getState('player');
            loggedInUserId = player?.userId;
        }

        if (!loggedInUserId) {
            logActivity("Listener Error: Could not get logged-in User ID yet (fallback path).");
            updateStatus('Waiting', 'Login data not found yet', 'warning');
            isReady = false;
            if (startButton) startButton.disabled = true;
            return;
        }

        const parts = message.split('%');
        let actualRoomId = parts[4]; // Room ID from raw packet


        if (!actualRoomId) {
            logActivity(`Listener Error: Could not parse/confirm room ID from j#jr (fallback): ${message}`);
            updateStatus('Error', 'Room ID parse failed. Paused.', 'error');
            isReady = false;
            if(startButton) startButton.disabled = true;
            return;
        }

        const expectedDenId = 'den' + loggedInUserId;

        // Check if the joined room is the user's den
        if (actualRoomId === expectedDenId) {
            // Now, confirm the user ID is present in the player list
            // Player data string is complex, typically starts after room ID
            const playerDataString = parts.slice(5).join('%');
            // Player data format: id:name:type:colors:x:y:frame:flags%...
            const players = playerDataString.split('%');
            let userFoundInDen = false;
            for (const player of players) {
                const playerData = player.split(':');
                const playerId = playerData[0]; // Assuming ID is the first part
                if (playerId === loggedInUserId) {
                    userFoundInDen = true;
                    break;
                }
            }

            if (userFoundInDen) {
                logActivity(`Confirmed user ${loggedInUserId} entered den ${actualRoomId}. Ready.`);
                currentUserId = loggedInUserId; // Set global ID for templates
                currentDenId = actualRoomId;   // Set global den ID
                initializePacketTemplates();   // Initialize templates now
                updateStatus('Ready', 'In den. Ready to start.', 'success');
                isReady = true;
                if (startButton) startButton.disabled = false;  // Enable start button
            } else {
                logActivity(`Listener Warn: Joined den ${actualRoomId}, but user ${loggedInUserId} not found in player list.`);
                 updateStatus('Error', 'User data mismatch in den', 'error');
                 isReady = false;
                 if (startButton) startButton.disabled = true;
            }
        } else {
            // User joined a different room that is NOT their den
            logActivity(`User in room: ${actualRoomId}. This is not the den. Waiting for den entry.`);
            updateStatus('Waiting', 'Please enter your den', 'warning');
            isReady = false;
            if (startButton) startButton.disabled = true;
        }
    } catch (error) {
        console.error("TFD Automator: Error processing room join packet:", error);
        logActivity(`Listener Error: Failed processing room join - ${error.message}`);
        updateStatus('Error', 'Packet processing failed', 'error');
        isReady = false;
        if (startButton) startButton.disabled = true;
    }
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
            if (!isReady && loggedInUserId && currentDenId) { // Was stopped (or left den), needs den re-entry
                updateStatus('Stopped', 'Please enter your den', 'warning');
            } else if (!loggedInUserId) { // Not logged in or user ID lost
                 updateStatus('Waiting', 'Login data not found', 'warning');
            } else if (packets.length === 0 && !fullAutomationEnabled) { // Ready but no packets loaded for single mode
                updateStatus('Ready', 'Load TFD sequence', 'info');
            } else if (isReady) { // Properly ready to start (in den, user ID known)
                 updateStatus('Ready', 'Press Start to begin', 'success');
            } else { // Default/fallback if other states don't match (e.g. just initialized, no den entry yet)
                updateStatus('Initialized', 'Waiting for den entry', 'info');
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

    // Listen for room join packets to confirm user ID and den state
    // This is crucial for initializing packet templates correctly.
    if (window.jam && typeof window.jam.onPacket === 'function') {
        try {
            // Corrected: window.jam.onPacket in preload.js expects only a single callback.
            // The handleJoinRoom function itself will filter for 'j#jr' packets.
            // The listener ID 'TFD-Automator-RJ' is not used by the current preload script's onPacket.
            window.jam.onPacket(handleJoinRoom);
            if (IS_DEV) console.log("[TFD Automator] Attached generic packet listener (will filter for j#jr in handleJoinRoom).");
            logActivity("Attached packet listener for room joins.");
        } catch (err) {
            if (IS_DEV) console.error("[TFD Automator] Error attaching rj listener:", err);
            logActivity("Error: Could not attach room join listener.");
        }
    } else {
        if (IS_DEV) console.warn("[TFD Automator] window.jam.onPacket not available for rj.");
        logActivity("Warning: Packet listener system not available.");
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
