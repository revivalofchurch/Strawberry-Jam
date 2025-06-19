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
const delayMultiplier = document.getElementById('delayMultiplier');
const maxRetries = document.getElementById('maxRetries');
const loopMode = document.getElementById('loopMode');

// Modal Elements
const educationalModal = document.getElementById('educationalModal');
const closeModal = document.getElementById('closeModal');
const startAutomationFromModal = document.getElementById('startAutomationFromModal');
const infoButton = document.getElementById('infoButton');

// State Variables
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
    const multiplier = delayMultiplier ? parseFloat(delayMultiplier.value) : 1;
    return baseDelay * multiplier;
}

// Function to send a single packet with delay
async function sendPacket(packet, isRaw = false, isGemPacket = false) {
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

    await dispatch.sendRemoteMessage(content);
    console.log(`[TFD Automation] Packet sent successfully.`);

    if (delay > 0) {
        // Introduce delay after sending the packet
        return new Promise(resolve => {
            currentTimeout = setTimeout(resolve, delay); // Store timeout ID
        });
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

    try {
        await refreshRoom();
        const textualRoomName = await dispatch.getState('room'); // Get textual room name (e.g., "denladyliya")

        if (!getRoomIdToUse() || !textualRoomName) { // Check both for validity
            updateStatus('Error: Not in a valid room. Please enter a room first.', 'error');
            stopAutomation();
            return;
        }

        playerSfsUserId = await getPlayerSfsUserId(); // Get player SFS User ID

        // Step 1: Quest Creation
        updateStatus(`Creating TFD private quest (ID: ${QUEST_ID})...`, 'info', 1);
        const createQuestPacket = `%xt%o%qjc%${getRoomIdToUse()}%${textualRoomName}%${QUEST_ID}%0%`;
        console.log(`[TFD Automation] About to send 'qjc' (Create Quest) packet.`);
        await sendPacket(createQuestPacket, true);

        // Increased delay to allow game client to process qjc and join quest room
        await new Promise(resolve => {
            currentTimeout = setTimeout(resolve, 5000); // 5 second delay
        });
        if (!isAutomationRunning) return;

        // Manually send quest start request after joining the quest room
        updateStatus('Quest room joined. Sending quest start request...', 'info', 2);
        const startQuestPacket = `%xt%o%qs%${getRoomIdToUse()}%${textualRoomName}%`;
        console.log(`[TFD Automation] About to send 'qs' (Start Quest) packet.`);
        await sendPacket(startQuestPacket, true);

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
        await dispatch.sendRemoteMessage(adventureJoinPacket);
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
            await sendPacket(packet, false, true); // Send packet with randomized delay for gems
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

        // Send qpgift packets for each reward slot (0-5 for TFD)
        for (let i = 0; i < 6; i++) {
            if (!isAutomationRunning) return;
            
            const qpgiftPacket = `%xt%o%qpgift%${rewardRoomId}%${i}%0%0%`;
            await dispatch.sendRemoteMessage(qpgiftPacket);
            console.log(`[TFD Automation] Sent qpgift ${i}: ${qpgiftPacket}`);
            
            // Small delay between qpgift packets
            await new Promise(resolve => {
                currentTimeout = setTimeout(resolve, 1000);
            });
        }

        // Send qpgiftdone packet to finalize reward collection
        if (!isAutomationRunning) return;
        const qpgiftdonePacket = `%xt%o%qpgiftdone%${rewardRoomId}%`;
        await dispatch.sendRemoteMessage(qpgiftdonePacket);
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
        await dispatch.sendRemoteMessage(leaveQuestPacket);
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
        
        // Auto-retry logic
        const maxRetriesValue = maxRetries ? parseInt(maxRetries.value) : 3;
        if (autoRetryCheckbox && autoRetryCheckbox.checked && retryCount < maxRetriesValue) {
            retryCount++;
            const loopStatus = isLooping ? ` (${currentLoopCount}/${totalLoopsToRun === Infinity ? '∞' : totalLoopsToRun})` : '';
            updateStatus(`Retrying in 5 seconds... (${retryCount}/${maxRetriesValue})${loopStatus}`, 'warning');
            await new Promise(resolve => {
                currentTimeout = setTimeout(resolve, 5000);
            });
            if (isAutomationRunning) {
                await runSingleAutomation();
                return;
            }
        }
    }
    
    stopAutomation();
}

// Function to stop the automation sequence
function stopAutomation() {
    const wasLooping = isLooping && currentLoopCount > 0;
    isAutomationRunning = false; // Set flag to halt further execution BEFORE updating status
    isLooping = false;
    currentLoopCount = 0;
    totalLoopsToRun = 1;
    updateStatus(`Automation stopped${wasLooping ? ` after ${currentLoopCount} run(s)` : ''}.`, 'info');
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

// Event Listeners for UI buttons
if (startButton) startButton.addEventListener('click', startAutomation);
if (stopButton) stopButton.addEventListener('click', stopAutomation);
if (resetStatsButton) resetStatsButton.addEventListener('click', resetStats);
if (infoButton) infoButton.addEventListener('click', showModal);

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

// Initialize
loadStats();
updateStatus('Ready to start TFD automation', 'info');
