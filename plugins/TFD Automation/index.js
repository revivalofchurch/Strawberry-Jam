const { dispatch, application } = jam;
const TFD_packets = require('./TFD_packets.json');

// Constants
const QUEST_ID = '23'; // Hardcoded for The Forgotten Desert

// UI Elements
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const resetStatsButton = document.getElementById('resetStatsButton');
const statusMessage = document.getElementById('statusMessage');
const statusIcon = document.getElementById('statusIcon');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const successCount = document.getElementById('successCount');
const failureCount = document.getElementById('failureCount');
const totalRuns = document.getElementById('totalRuns');

// Settings Elements
const autoRetryCheckbox = document.getElementById('autoRetryCheckbox');
const soundNotificationCheckbox = document.getElementById('soundNotificationCheckbox');
const maxRetries = document.getElementById('maxRetries');
const loopMode = document.getElementById('loopMode');

// Modal Elements
const educationalModal = document.getElementById('educationalModal');
const closeModal = document.getElementById('closeModal');
const startAutomationFromModal = document.getElementById('startAutomationFromModal');
const infoButton = document.getElementById('infoButton');

// Item Filter Elements
const itemWhitelist = document.getElementById('itemWhitelist');
const saveWhitelistButton = document.getElementById('saveWhitelistButton');
const clearWhitelistButton = document.getElementById('clearWhitelistButton');
const openClothingJson = document.getElementById('openClothingJson');
const openDenItemsJson = document.getElementById('openDenItemsJson');
const enableFilteringCheckbox = document.getElementById('enableFilteringCheckbox');
const filterStatusText = document.getElementById('filterStatusText');

// Received Items Log Elements
const itemLog = document.getElementById('itemLog');
const clearLogButton = document.getElementById('clearLogButton');

// State Variables
let clothingItems = {};
let denItems = {};
let isAutomationRunning = false;
let currentTimeout = null;
let currentRoom = null; // Textual room name
let currentInternalRoomId = null; // Numerical instance ID
let playerSfsUserId = null;
let currentStep = 0;
let totalSteps = 0;
let stats = {
    successful: 0,
    failed: 0,
    total: 0
};
let retryCount = 0;
let questStartTime = null; // Track when quest started
let currentLoopCount = 0;
let totalLoopsToRun = 1;
let isLooping = false;
let knownDenInvIds = new Set();
let isFirstDiPacket = true;
let hasCapturedInitialDenState = false; // New state for den inventory
const QUEST_DURATION_MS = 17 * 60 * 1000; // 17 minutes in milliseconds
const MIN_WAIT_TIME_MS = 4 * 60 * 1000; // Must wait at least 4 minutes (17:00 - 13:00)

// Room ID management functions (based on phantoms plugin)
const refreshRoom = async () => {
    const textualRoom = await dispatch.getState('room');
    const internalRoomState = await dispatch.getState('internalRoomId');

    currentRoom = textualRoom; // Can be null

    if (internalRoomState) {
        const parsedId = parseInt(internalRoomState, 10);
        if (!isNaN(parsedId)) {
            currentInternalRoomId = parsedId;
        } else {
            console.warn(`[TFD Automation] internalRoomId '${internalRoomState}' from state could not be parsed to a number.`);
            currentInternalRoomId = null;
        }
    } else {
        currentInternalRoomId = null;
    }

    if (!currentRoom && !currentInternalRoomId) {
        console.warn('[TFD Automation] No room ID is currently available from dispatch state.');
        if (isAutomationRunning) {
            updateStatus('Error: Lost room connection. Please enter a room and restart.', 'error');
        }
    }
};

// Get the best available room ID (prioritize numerical)
const getRoomIdToUse = () => {
    const roomId = currentInternalRoomId || currentRoom;
    if (!roomId) {
        console.warn('[TFD Automation] getRoomIdToUse() called but no room ID is available');
    }
    return roomId;
};

// Check if room is available and notify user if not
const validateRoomAvailability = async () => {
    await refreshRoom();
    if (!getRoomIdToUse()) {
        updateStatus('Error: No room available. Please enter a room first.', 'error');
        return false;
    }
    return true;
};

// Load stats from localStorage
function loadStats() {
    const savedStats = localStorage.getItem('tfd_automation_stats');
    if (savedStats) {
        stats = JSON.parse(savedStats);
        updateStatsDisplay();
    }
}

// Save stats to localStorage
function saveStats() {
    localStorage.setItem('tfd_automation_stats', JSON.stringify(stats));
}

// Update stats display
function updateStatsDisplay() {
    if (successCount) successCount.textContent = stats.successful;
    if (failureCount) failureCount.textContent = stats.failed;
    if (totalRuns) totalRuns.textContent = stats.total;
}

// Play notification sound
function playNotificationSound(type = 'success') {
    if (!soundNotificationCheckbox || !soundNotificationCheckbox.checked) return;
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        if (type === 'success') {
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
        } else if (type === 'error') {
            oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime + 0.2);
        }
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        console.warn('[TFD Automation] Could not play notification sound:', e);
    }
}

// Helper function to update UI status and log messages
function updateStatus(message, type = 'info', step = null) {
    if (statusMessage) statusMessage.textContent = message;
    console.log(`[TFD Automation] Status: ${message}`);
    
    // Update status icon
    if (statusIcon) {
        let iconClass = 'fas fa-circle text-gray-400';
        let iconText = 'Idle';
        
        switch (type) {
            case 'success':
                iconClass = 'fas fa-check-circle text-green-400 pulse-animation';
                iconText = 'Success';
                break;
            case 'error':
                iconClass = 'fas fa-exclamation-circle text-red-400 pulse-animation';
                iconText = 'Error';
                break;
            case 'warning':
                iconClass = 'fas fa-exclamation-triangle text-yellow-400 pulse-animation';
                iconText = 'Warning';
                break;
            case 'info':
                if (isAutomationRunning) {
                    iconClass = 'fas fa-spinner fa-spin text-blue-400';
                    iconText = 'Running';
                } else {
                    iconClass = 'fas fa-circle text-gray-400';
                    iconText = 'Idle';
                }
                break;
        }
        
        statusIcon.innerHTML = `<i class="${iconClass}"></i> ${iconText}`;
    }
    
    // Update progress if step is provided
    if (step !== null && totalSteps > 0) {
        currentStep = step;
        const progress = Math.round((currentStep / totalSteps) * 100);
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${progress}%`;
    }
    
    if (application && application.consoleMessage) {
        application.consoleMessage({
            message: `TFD Automation: ${message}`,
            type: type
        });
    }
}

// Function to get player SFS User ID dynamically
async function getPlayerSfsUserId() {
    try {
        const userId = await dispatch.getState('userId');
        if (userId) {
            console.log(`[TFD Automation] Dynamically retrieved playerSfsUserId: ${userId}`);
            return userId;
        }
    } catch (e) {
        console.error('[TFD Automation] Error getting dynamic userId, falling back to placeholder.', e);
    }
    const placeholderId = 1119652; // Fallback placeholder
    updateStatus(`Warning: Could not get dynamic player ID. Using placeholder: ${placeholderId}`, 'warning');
    return placeholderId;
}

// Function to get randomized delay for gem packets
function getRandomizedDelay(baseDelay, isGemPacket = false) {
    if (isGemPacket) {
        // Randomize between 500-1000ms for gem packets to avoid bot detection
        return Math.floor(Math.random() * (1000 - 500 + 1)) + 500;
    }
    return baseDelay;
}

// Function to check connection status
async function isConnected() {
    try {
        return await dispatch.getState('connected');
    } catch (e) {
        return false; // Assume disconnected on error
    }
}

// Function to send a single packet with delay and critical connection check
async function sendPacket(packet, isRaw = false, isGemPacket = false) {
    if (!isAutomationRunning) return; // Exit if automation was stopped

    if (!(await isConnected())) {
        stopAutomation();
        throw new Error('Connection lost. Automation stopped.');
    }

    // Refresh room info before sending each packet
    await refreshRoom();
    
    let content = isRaw ? packet : packet.content;
    const type = isRaw ? 'aj' : packet.type; // Assume 'aj' for raw packets
    const baseDelay = isRaw ? 0 : parseFloat(packet.delay) * 1000; // No delay for raw sends unless specified
    const delay = getRandomizedDelay(baseDelay, isGemPacket);

    // Replace placeholders if they exist
    if (content.includes('{room}')) {
        const roomId = getRoomIdToUse();
        if (!roomId) {
            throw new Error('No room ID available for packet sending');
        }
        content = content.replaceAll('{room}', roomId);
    }
    if (content.includes('{playerSfsUserId}')) {
        content = content.replaceAll('{playerSfsUserId}', playerSfsUserId);
    }

    console.log(`[TFD Automation] Preparing to send packet.`);
    console.log(`[TFD Automation]  - Type: ${type}`);
    console.log(`[TFD Automation]  - Content: ${content}`);
    console.log(`[TFD Automation]  - Delay: ${delay}ms`);

    try {
        await dispatch.sendRemoteMessage(content);
        console.log(`[TFD Automation] Packet sent successfully.`);
    } catch (error) {
        // This is the critical change: if sendRemoteMessage fails, it will throw.
        // We re-throw a more specific error to be caught by the main try/catch block.
        throw new Error('Connection lost. Socket not writable.');
    }

    if (delay > 0) {
        // Introduce delay after sending the packet
        return new Promise(resolve => {
            currentTimeout = setTimeout(resolve, delay); // Store timeout ID
        });
    }
}

async function sendPacketWithRetry(packet, isRaw = false, isGemPacket = false, retryCount = 0) {
    const maxRetries = 3;
    try {
        await sendPacket(packet, isRaw, isGemPacket);
    } catch (error) {
        if (retryCount < maxRetries) {
            const delay = 5000 * (retryCount + 1);
            updateStatus(`Connection error. Retrying in ${delay / 1000}s... (${retryCount + 1}/${maxRetries})`, 'warning');
            await new Promise(resolve => setTimeout(resolve, delay));
            await sendPacketWithRetry(packet, isRaw, isGemPacket, retryCount + 1);
        } else {
            throw new Error(`Failed to send packet after ${maxRetries} retries. Stopping automation.`);
        }
    }
}

// Main function to start the automation sequence
async function startAutomation() {
    // Check room availability before starting
    if (!(await validateRoomAvailability())) {
        return; // Don't start if no room is available
    }

    // Initialize loop settings
    const loopValue = loopMode ? loopMode.value : '1';
    if (loopValue === 'infinite') {
        totalLoopsToRun = Infinity;
        isLooping = true;
    } else {
        totalLoopsToRun = parseInt(loopValue);
        isLooping = totalLoopsToRun > 1;
    }
    currentLoopCount = 0;

    updateStatus(`Starting TFD automation${isLooping ? ` (${totalLoopsToRun === Infinity ? '∞' : totalLoopsToRun} runs)` : ''}...`, 'info');
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
    isAutomationRunning = true;
    
    await runSingleAutomation();
}

// Function to run a single automation cycle
async function runSingleAutomation() {
    currentStep = 0;
    totalSteps = 5 + TFD_packets.packets.length; // 5 main steps + packet count
    retryCount = 0;
    currentLoopCount++;
    
    // Reset state for the new run
    knownDenInvIds.clear();
    isFirstDiPacket = true;
    hasCapturedInitialDenState = false; // Reset for each new adventure

    try {
        await refreshRoom();
        const textualRoomName = await dispatch.getState('room'); // Get textual room name (e.g., "denladyliya")

        if (!getRoomIdToUse() || !textualRoomName) { // Check both for validity
            updateStatus('Error: Not in a valid room. Please enter a room first.', 'error');
            stopAutomation();
            return;
        }

        playerSfsUserId = await getPlayerSfsUserId(); // Get player SFS User ID

        // Send a request for the current den inventory to establish a baseline
        console.log('[TFD Automation] Requesting current den inventory before starting quest...');
        await sendPacketWithRetry(`%xt%o%di%${getRoomIdToUse()}%`, true);

        // Step 1: Quest Creation
        updateStatus(`Creating TFD private quest (ID: ${QUEST_ID})...`, 'info', 1);
        const createQuestPacket = `%xt%o%qjc%${getRoomIdToUse()}%${textualRoomName}%${QUEST_ID}%0%`;
        console.log(`[TFD Automation] About to send 'qjc' (Create Quest) packet.`);
        await sendPacketWithRetry(createQuestPacket, true);

        // Increased delay to allow game client to process qjc and join quest room
        await new Promise(resolve => {
            currentTimeout = setTimeout(resolve, 5000); // 5 second delay
        });
        if (!isAutomationRunning) return;

        // Manually send quest start request after joining the quest room
        updateStatus('Quest room joined. Sending quest start request...', 'info', 2);
        const startQuestPacket = `%xt%o%qs%${getRoomIdToUse()}%${textualRoomName}%`;
        console.log(`[TFD Automation] About to send 'qs' (Start Quest) packet.`);
        await sendPacketWithRetry(startQuestPacket, true);

        // Record quest start time for timer calculations
        questStartTime = Date.now();
        console.log(`[TFD Automation] Quest timer started at ${new Date(questStartTime).toLocaleTimeString()}`);

        await new Promise(resolve => {
            currentTimeout = setTimeout(resolve, 2000); // Short delay after starting quest
        });
        if (!isAutomationRunning) return;

        // Step 3: Send Adventure Join Request
        updateStatus('Joining the adventure...', 'info', 3);
        const adventureJoinPacket = `%xt%o%qaskr%${getRoomIdToUse()}%liza01_%0%1%`;
        console.log(`[TFD Automation] About to send 'qaskr' (Adventure Join) packet.`);
        await sendPacketWithRetry(adventureJoinPacket, true);
        console.log(`[TFD Automation] The qaskr (Adventure Join) packet was sent correctly: ${adventureJoinPacket}`);

        await new Promise(resolve => {
            currentTimeout = setTimeout(resolve, 3000); // 3 second delay for adventure join
        });
        if (!isAutomationRunning) return;

        // Refresh room info after joining adventure
        await refreshRoom();
        const adventureRoomId = getRoomIdToUse();
        console.log(`[TFD Automation] Adventure room ID: ${adventureRoomId}`);

        updateStatus('Adventure joined. Beginning gem collection...', 'info', 4);

        // Step 4: Automate Gem Collection
        for (let i = 0; i < TFD_packets.packets.length; i++) {
            if (!isAutomationRunning) { // Check if automation was stopped before sending next packet
                updateStatus('Gem collection interrupted.');
                return;
            }
            const packet = TFD_packets.packets[i];
            updateStatus(`Collecting gem ${i + 1}/${TFD_packets.packets.length}...`, 'info', 4 + i);
            await sendPacketWithRetry(packet, false, true); // Send packet with randomized delay for gems
        }
        if (!isAutomationRunning) return; // Check if automation was stopped after loop

        updateStatus('Gem collection complete. Calculating reward timing...', 'info', totalSteps - 1);

        // Calculate how long we need to wait before collecting rewards
        const elapsedTime = Date.now() - questStartTime;
        const timeUntilSafeReward = MIN_WAIT_TIME_MS - elapsedTime;
        
        if (timeUntilSafeReward > 0) {
            const totalSeconds = Math.ceil(timeUntilSafeReward / 1000);
            const minutesLeft = Math.floor(totalSeconds / 60);
            const secondsLeft = totalSeconds % 60;
            updateStatus(`Waiting ${minutesLeft}m ${secondsLeft}s for safe reward collection (13:00 rule)...`, 'info');
            console.log(`[TFD Automation] Must wait ${timeUntilSafeReward}ms (${totalSeconds}s) more before collecting rewards`);
            
            await new Promise(resolve => {
                currentTimeout = setTimeout(resolve, timeUntilSafeReward);
            });
            if (!isAutomationRunning) return;

            // **Proactive Connection Check**
            // Send a harmless packet to ensure the connection is still alive before proceeding.
            updateStatus('Pinging server to verify connection...', 'info');
            await refreshRoom();
            const pingPacket = `%xt%o%gps%${getRoomIdToUse()}%`; // gps (get player status) is a safe ping
            await sendPacketWithRetry(pingPacket, true);
            // If sendPacket fails, it will throw and be caught by the main try/catch, stopping the automation.
            updateStatus('Connection verified. Proceeding to collect rewards.', 'info');

        } else {
            console.log(`[TFD Automation] Safe to collect rewards immediately (${Math.abs(timeUntilSafeReward)}ms past minimum)`);
        }

        updateStatus('Processing rewards...', 'info', totalSteps - 1);

        // Step 5: Automate Reward Collection (following phantoms plugin pattern)
        // Refresh room info before reward collection
        await refreshRoom();
        const rewardRoomId = getRoomIdToUse();
        
        if (!rewardRoomId) {
            console.error('[TFD Automation] No room ID available for reward collection');
            updateStatus('Error: No room ID for reward collection', 'error');
            throw new Error('No room ID available for reward collection');
        }

        console.log(`[TFD Automation] Using room ID ${rewardRoomId} for reward collection`);

        // Send a request for the current den inventory to establish a baseline
        console.log('[TFD Automation] Requesting current den inventory before collecting gifts...');
        await sendPacketWithRetry(`%xt%o%di%${rewardRoomId}%`, true);
        
        // Wait a moment for the initial `di` packet to be processed
        await new Promise(resolve => {
            currentTimeout = setTimeout(resolve, 2000);
        });

        // Send qpgift packets for each reward slot (0-5 for TFD)
        for (let i = 0; i < 6; i++) {
            if (!isAutomationRunning) return;
            
            const qpgiftPacket = `%xt%o%qpgift%${rewardRoomId}%${i}%0%0%`;
            await sendPacketWithRetry(qpgiftPacket, true);
            console.log(`[TFD Automation] Sent qpgift ${i}: ${qpgiftPacket}`);
            
            // Small delay between qpgift packets
            await new Promise(resolve => {
                currentTimeout = setTimeout(resolve, 1000);
            });
        }

        // Send qpgiftdone packet to finalize reward collection
        if (!isAutomationRunning) return;
        const qpgiftdonePacket = `%xt%o%qpgiftdone%${rewardRoomId}%`;
        await sendPacketWithRetry(qpgiftdonePacket, true);
        console.log(`[TFD Automation] Sent qpgiftdone: ${qpgiftdonePacket}`);
        
        // Random pause after done packet (500-1000ms)
        const randomPause = Math.floor(Math.random() * 501) + 500; // 500-1000ms
        console.log(`[TFD Automation] Waiting ${randomPause}ms after qpgiftdone packet`);
        await new Promise(resolve => {
            currentTimeout = setTimeout(resolve, randomPause);
        });

        updateStatus('Rewards collected. Leaving quest...', 'info', totalSteps);

        // Step 6: Leave Quest
        await new Promise(resolve => {
            currentTimeout = setTimeout(resolve, 2000);
        });
        if (!isAutomationRunning) return;

        // Refresh room info before leaving
        await refreshRoom();
        const exitRoomId = getRoomIdToUse();
        const leaveQuestPacket = `%xt%o%qx%${exitRoomId}%`;
        await sendPacketWithRetry(leaveQuestPacket, true);
        console.log(`[TFD Automation] Sent leave quest: ${leaveQuestPacket}`);
        
        // Success
        stats.successful++;
        stats.total++;
        saveStats();
        updateStatsDisplay();
        
        const loopStatus = isLooping ? ` (${currentLoopCount}/${totalLoopsToRun === Infinity ? '∞' : totalLoopsToRun})` : '';
        updateStatus(`TFD automation completed successfully!${loopStatus}`, 'success', totalSteps);
        playNotificationSound('success');
        
        // Check if we should continue looping
        if (isLooping && (totalLoopsToRun === Infinity || currentLoopCount < totalLoopsToRun) && isAutomationRunning) {
            updateStatus(`Preparing next run${loopStatus}...`, 'info');
            await new Promise(resolve => {
                currentTimeout = setTimeout(resolve, 3000); // 3 second delay between runs
            });
            if (isAutomationRunning) {
                await runSingleAutomation();
                return;
            }
        }
        
    } catch (error) {
        console.error('[TFD Automation] Error:', error);
        stats.failed++;
        stats.total++;
        saveStats();
        updateStatsDisplay();
        updateStatus(`Error: ${error.message}`, 'error');
        playNotificationSound('error');
        
        // Auto-retry logic is now handled by sendPacketWithRetry
    }
    
    stopAutomation();
}

// Function to stop the automation sequence
function stopAutomation() {
    const completedRuns = currentLoopCount; // Capture the count before resetting
    const wasLooping = isLooping && completedRuns > 0;
    isAutomationRunning = false; // Set flag to halt further execution BEFORE updating status
    isLooping = false;
    currentLoopCount = 0;
    totalLoopsToRun = 1;
    updateStatus(`Automation stopped${wasLooping ? ` after ${completedRuns} run(s)` : ''}.`, 'info');
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    
    if (currentTimeout) {
        clearTimeout(currentTimeout); // Clear any pending setTimeout
        currentTimeout = null;
    }
}

// Reset statistics
function resetStats() {
    if (confirm('Are you sure you want to reset all statistics?')) {
        stats = { successful: 0, failed: 0, total: 0 };
        saveStats();
        updateStatsDisplay();
        updateStatus('Statistics reset.', 'info');
    }
}

// Modal functionality
function showModal() {
    if (educationalModal) {
        educationalModal.style.display = 'flex';
    }
}

function hideModal() {
    if (educationalModal) {
        educationalModal.style.display = 'none';
    }
}

// Whitelist management
function getWhitelist() {
    if (!itemWhitelist || !itemWhitelist.value.trim()) {
        return new Set();
    }
    // Get value, remove whitespace, split by comma, and filter out empty strings
    const ids = itemWhitelist.value.split(',').map(id => id.trim()).filter(Boolean);
    return new Set(ids);
}

function isFilteringEnabled() {
    // Only enable filtering if user has entered specific item IDs
    const whitelist = getWhitelist();
    const hasWhitelistItems = whitelist.size > 0;
    
    // Check if filtering checkbox exists and is checked, or if whitelist has items
    const checkboxEnabled = enableFilteringCheckbox ? enableFilteringCheckbox.checked : false;
    
    return hasWhitelistItems && (checkboxEnabled || hasWhitelistItems);
}

function saveWhitelist() {
    if (itemWhitelist) {
        const whitelistValue = getWhitelist();
        localStorage.setItem('tfd_automation_whitelist', JSON.stringify(Array.from(whitelistValue)));
        updateStatus('Item whitelist saved successfully.', 'success');
        
        // Update UI to show filtering status
        updateFilteringStatus();
    }
}

function loadWhitelist() {
    if (itemWhitelist) {
        const savedWhitelist = localStorage.getItem('tfd_automation_whitelist');
        if (savedWhitelist) {
            try {
                const ids = JSON.parse(savedWhitelist);
                itemWhitelist.value = ids.join(', ');
                updateFilteringStatus();
            } catch (e) {
                console.error('[TFD Automation] Failed to load whitelist:', e);
            }
        }
    }
}

function updateFilteringStatus() {
    const filteringEnabled = isFilteringEnabled();
    const whitelist = getWhitelist();
    
    // Update console log
    if (filteringEnabled && whitelist.size > 0) {
        console.log(`[TFD Automation] Item filtering is ENABLED for ${whitelist.size} item(s): ${Array.from(whitelist).join(', ')}`);
    } else {
        console.log('[TFD Automation] Item filtering is DISABLED (no items specified or filtering disabled)');
    }
    
    // Update UI status text
    if (filterStatusText) {
        if (whitelist.size > 0) {
            filterStatusText.textContent = `Enabled for ${whitelist.size} item(s): ${Array.from(whitelist).slice(0, 10).join(', ')}${whitelist.size > 10 ? '...' : ''}`;
            filterStatusText.className = 'text-green-300';
        } else {
            filterStatusText.textContent = 'Disabled (no item IDs specified)';
            filterStatusText.className = 'text-gray-400';
        }
    }
}

function clearWhitelist() {
    if (itemWhitelist) {
        if (itemWhitelist.value.trim() === '' || confirm('Are you sure you want to clear all whitelisted items? This will disable filtering.')) {
            itemWhitelist.value = '';
            localStorage.removeItem('tfd_automation_whitelist');
            updateFilteringStatus();
            updateStatus('Item whitelist cleared. Filtering disabled.', 'info');
        }
    }
}

// Enhanced item name lookup with better error handling
function getItemName(defId, itemType) {
    if (!defId) return 'Unknown Item';

    try {
        if (itemType === 'clothing' && clothingItems && clothingItems[defId]) {
            return `${clothingItems[defId].name || `Clothing ID ${defId}`} (Clothing)`;
        }
        if (itemType === 'den' && denItems && denItems[defId]) {
            return `${denItems[defId].name || `Den ID ${defId}`} (Den Item)`;
        }
    } catch (error) {
        console.warn(`[TFD Automation] Error looking up item name for ID ${defId}:`, error);
    }
    
    return `Unknown ${itemType || 'Item'} (ID: ${defId})`;
}

// Improved packet handler for item filtering with better packet parsing
async function handleIncomingPackets(data) {
    // Only process packets if automation is running and filtering is enabled
    if (!isAutomationRunning || !data || data.direction !== 'in' || !isFilteringEnabled()) {
        return;
    }

    const { raw: rawMessage } = data;
    const parts = rawMessage.split('%');

    // Handle clothing/accessory item packets (%xt%il%)
    if (rawMessage.startsWith('%xt%il%') && parts.length > 10 && parts[4] === '2') {
        console.log('[TFD Automation] Received clothing/accessory gift packet (`il`). Processing...');
        try {
            const numAdded = parseInt(parts[9]);
            if (numAdded > 0) {
                console.log(`[TFD Automation] Packet indicates ${numAdded} new clothing item(s).`);
                let currentIndex = 11;
                for (let i = 0; i < numAdded; i++) {
                    if (parts.length > currentIndex + 1) {
                        const invId = parts[currentIndex];
                        const defId = parts[currentIndex + 1];
                        console.log(`[TFD Automation] Detected new clothing item - DefID: ${defId}, InvID: ${invId}`);
                        await processItemForFiltering(defId, invId, 'clothing');
                        currentIndex += 2; // Move to the next pair
                    }
                }
            }
        } catch (error) {
            console.error('[TFD Automation] Error processing `il` packet:', error);
        }
    }
    
    // Handle den item inventory packets (%xt%di%)
    else if (rawMessage.startsWith('%xt%di%')) {
        console.log(`[TFD Automation] Received den inventory update packet: ${rawMessage}`);
        try {
            const isAdventureRunning = questStartTime !== null; // A simple check to see if we're in an active run

            // Only capture the initial state ONCE per adventure run, before gifts are opened
            if (isAdventureRunning && !hasCapturedInitialDenState) {
                console.log('[TFD Automation] Capturing initial den inventory state...');
                const denItemCount = parseInt(parts[5]);
                if (isNaN(denItemCount)) return;

                knownDenInvIds.clear();
                let currentIndex = 7;
                for (let i = 0; i < denItemCount; i++) {
                    if (parts.length > currentIndex) {
                        knownDenInvIds.add(parts[currentIndex]);
                    }
                    currentIndex += 9;
                }
                console.log(`[TFD Automation] Stored initial den inventory state with ${knownDenInvIds.size} items.`);
                hasCapturedInitialDenState = true; // Mark as captured
            } else if (isAdventureRunning) {
                // This is a subsequent `di` packet, likely a gift update.
                console.log('[TFD Automation] Processing potential den item gift packet...');
                const denItemCount = parseInt(parts[5]);
                if (isNaN(denItemCount)) return;

                let currentIndex = 7;
                for (let i = 0; i < denItemCount; i++) {
                    if (parts.length > currentIndex + 1) {
                        const invId = parts[currentIndex];
                        const defId = parts[currentIndex + 1];

                        if (!knownDenInvIds.has(invId)) {
                            console.log(`[TFD Automation] Detected new den item by comparing inventories - DefID: ${defId}, InvID: ${invId}`);
                            await processItemForFiltering(defId, invId, 'den');
                            knownDenInvIds.add(invId); // Add to known list to avoid reprocessing
                        }
                    }
                    currentIndex += 9;
                }
            }
        } catch (error) {
            console.error('[TFD Automation] Error processing `di` packet:', error);
        }
    }
}

// Helper function to process an item for filtering
async function processItemForFiltering(defId, invId, itemType) {
    const whitelist = getWhitelist();
    
    if (defId && invId && defId.length > 0 && invId.length > 0) {
        const itemName = getItemName(defId, itemType);
        console.log(`[TFD Automation] FILTERING - Item Type: ${itemType}, Name: ${itemName}, DefID: ${defId}, InvID: ${invId}`);
        
        if (whitelist.has(defId)) {
            updateStatus(`✓ Whitelisted: ${itemName}. Keeping it.`, 'info');
            logReceivedItem(itemName, 'kept');
            console.log(`[TFD Automation] RESULT: KEEPING item ${defId} (${itemName}) - found on whitelist.`);
        } else {
            updateStatus(`♻ Recycling: ${itemName}.`, 'warning');
            logReceivedItem(itemName, 'recycled');
            console.log(`[TFD Automation] ACTION: RECYCLING item ${defId} (${itemName}) - not on whitelist.`);
            
            await new Promise(resolve => setTimeout(resolve, 150)); // Small delay
            
            await refreshRoom();
            
            let recyclePacket;
            if (itemType === 'den') {
                // Use the den-specific recycling packet with the correct format
                recyclePacket = `%xt%o%dr%${getRoomIdToUse()}%0%${invId}%`;
                console.log(`[TFD Automation] Using DEN recycle packet: ${recyclePacket}`);
            } else {
                // Default to the standard item recycling packet for clothing
                recyclePacket = `%xt%o%ir%${getRoomIdToUse()}%${invId}%`;
                console.log(`[TFD Automation] Using CLOTHING recycle packet: ${recyclePacket}`);
            }
            
            try {
                await sendPacketWithRetry(recyclePacket, true);
                console.log(`[TFD Automation] SUCCESS: Recycle request sent for InvID ${invId}.`);
            } catch (error) {
                console.error(`[TFD Automation] FAILED: Could not send recycle request for InvID ${invId}:`, error);
                updateStatus(`Error recycling ${itemName}: ${error.message}`, 'error');
            }
        }
    } else {
        console.warn(`[TFD Automation] WARNING: Could not process item. Invalid DefID or InvID. DefID: ${defId}, InvID: ${invId}`);
    }
}

// Function to add item to the received items log
function logReceivedItem(itemName, status) {
    if (!itemLog) return;

    // Remove the "No items" placeholder if it exists
    const placeholder = itemLog.querySelector('.text-center');
    if (placeholder) {
        itemLog.innerHTML = '';
    }

    const iconClass = status === 'kept' ? 'fa-star text-yellow-400' : 'fa-trash text-red-400';
    const itemElement = document.createElement('div');
    itemElement.className = 'flex items-center justify-between text-sm p-1 bg-gray-900/50 rounded';
    itemElement.innerHTML = `
        <span class="truncate">${itemName}</span>
        <i class="fas ${iconClass} ml-2"></i>
    `;

    itemLog.appendChild(itemElement);
    itemLog.scrollTop = itemLog.scrollHeight; // Auto-scroll to the bottom
}

// Function to clear the received items log
function clearItemLog() {
    if (itemLog) {
        itemLog.innerHTML = '<p class="text-sm text-text-secondary text-center">No items received yet.</p>';
        updateStatus('Item log cleared.', 'info');
    }
}

// Function to open a file in the default editor
function openFileInEditor(fileName) {
    if (typeof require === 'function') {
        try {
            const { ipcRenderer } = require('electron');
            // The main process will resolve the full path relative to the plugin directory
            ipcRenderer.send('open-file-in-editor', fileName);
        } catch (e) {
            console.error(`[TFD Automation] Could not open file ${fileName}.`, e);
            updateStatus(`Error: Could not open file ${fileName}.`, 'error');
        }
    }
}

// Event Listeners for UI buttons
if (startButton) startButton.addEventListener('click', startAutomation);
if (stopButton) stopButton.addEventListener('click', stopAutomation);
if (resetStatsButton) resetStatsButton.addEventListener('click', resetStats);
if (infoButton) infoButton.addEventListener('click', showModal);
if (saveWhitelistButton) saveWhitelistButton.addEventListener('click', saveWhitelist);
if (clearWhitelistButton) clearWhitelistButton.addEventListener('click', clearWhitelist);
if (clearLogButton) clearLogButton.addEventListener('click', clearItemLog);
if (openClothingJson) openClothingJson.addEventListener('click', () => openFileInEditor('1000-clothing.json'));
if (openDenItemsJson) openDenItemsJson.addEventListener('click', () => openFileInEditor('1030-denitems.json'));

// Add event listener for whitelist input changes to update status in real-time
if (itemWhitelist) {
    itemWhitelist.addEventListener('input', updateFilteringStatus);
}

// Modal event listeners
if (closeModal) closeModal.addEventListener('click', hideModal);
if (startAutomationFromModal) {
    startAutomationFromModal.addEventListener('click', () => {
        hideModal();
        // Don't auto-start, just close the modal
    });
}

// Close modal when clicking outside
if (educationalModal) {
    educationalModal.addEventListener('click', (e) => {
        if (e.target === educationalModal) {
            hideModal();
        }
    });
}

// Function to load item data from JSON files
async function loadItemData() {
    try {
        const clothingResponse = await fetch('./1000-clothing.json');
        if (clothingResponse.ok) {
            clothingItems = await clothingResponse.json();
            console.log('[TFD Automation] Loaded clothing items successfully.');
        } else {
            console.error('[TFD Automation] Failed to load clothing.json');
        }

        const denItemsResponse = await fetch('./1030-denitems.json');
        if (denItemsResponse.ok) {
            denItems = await denItemsResponse.json();
            console.log('[TFD Automation] Loaded den items successfully.');
        } else {
            console.error('[TFD Automation] Failed to load den_items.json');
        }
    } catch (error) {
        console.error('[TFD Automation] Error loading item data:', error);
    }
}

// Initialize
async function initialize() {
    loadStats();
    loadWhitelist();
    await loadItemData();

    // The plugin's 'dispatch' object does not have event listeners.
    // We must use ipcRenderer to listen for events from the main application.
    if (typeof require === 'function') {
        try {
            const { ipcRenderer } = require('electron');
            
            // Listener for individual packets
            ipcRenderer.on('packet-event', (event, data) => {
                handleIncomingPackets(data);
            });

            // Listener for global connection status changes
            ipcRenderer.on('connection-status-changed', (event, isConnected) => {
                if (!isConnected && isAutomationRunning) {
                    updateStatus('Connection lost. Stopping automation.', 'error');
                    stopAutomation();
                }
            });

        } catch (e) {
            console.error('[TFD Automation] Could not set up IPC listeners.', e);
            updateStatus('Error: Could not initialize listeners.', 'error');
        }
    }

    updateStatus('Ready to start TFD automation', 'info');
}

initialize();
