const { dispatch, application } = jam;
const tiki_trouble_packets = require('./tiki_trouble_packets.json');

// UI Elements
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const statusIcon = document.getElementById('statusIcon');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const loopMode = document.getElementById('loopMode');

// State Variables
let isAutomationRunning = false;
let currentTimeout = null;
let countdownInterval = null;
let currentRoom = null;
let currentInternalRoomId = null;
let currentStep = 0;
let totalSteps = 0;
let isLooping = false;
let currentLoopCount = 0;
let totalLoopsToRun = 1;

// Room ID management
const refreshRoom = async () => {
    try {
        currentRoom = await dispatch.getState('room');
        const internalRoomIdState = await dispatch.getState('internalRoomId');
        if (internalRoomIdState) {
            const parsedId = parseInt(internalRoomIdState, 10);
            if (!isNaN(parsedId)) {
                currentInternalRoomId = parsedId;
            }
        }
    } catch (e) {
        console.error('[Tiki Trouble Automation] Error refreshing room:', e);
        currentRoom = null;
        currentInternalRoomId = null;
    }
};

const getRoomIdToUse = () => {
    return currentInternalRoomId || currentRoom;
};

const pad = (n) => String(n).padStart(2, '0');

// UI Update Function
function updateStatus(message, type = 'info', step = null) {
    if (statusMessage) statusMessage.textContent = message;

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
            case 'info':
                if (isAutomationRunning) {
                    iconClass = 'fas fa-spinner fa-spin text-blue-400';
                    iconText = 'Running';
                }
                break;
        }
        statusIcon.innerHTML = `<i class="${iconClass}"></i> ${iconText}`;
    }

    if (step !== null && totalSteps > 0) {
        currentStep = step;
        const progress = Math.round((currentStep / totalSteps) * 100);
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${progress}%`;
    }

    if (application && application.consoleMessage) {
        application.consoleMessage({
            message: `Tiki Trouble Automation: ${message}`,
            type: type
        });
    }
}

// Packet Sending Function
async function sendPacket(packet, step) {
    if (!isAutomationRunning) return;

    const isConnected = await dispatch.getState('connected');
    if (!isConnected) {
        stopAutomation();
        throw new Error('Connection lost. Automation stopped.');
    }

    await refreshRoom();
    const roomId = getRoomIdToUse();
    if (!roomId) {
        throw new Error('No room ID available. Please enter a room.');
    }

    let content = packet.content.replaceAll('{room}', roomId);
    const delay = parseFloat(packet.delay) * 1000;

    updateStatus(`Sending packet: ${packet.name}`, 'info', step);
    await dispatch.sendRemoteMessage(content);

    if (delay > 0) {
        // For very long waits (>= 30 seconds), show a live countdown
        if (delay >= 30000) {
            await waitWithCountdown(Math.ceil(delay / 1000), `Waiting`, step);
        } else {
            const waitMessage = `Waiting for ${packet.delay} seconds...`;
            updateStatus(waitMessage, 'info', step);
            return new Promise(resolve => {
                currentTimeout = setTimeout(resolve, delay);
            });
        }
    }
}

// Send a raw packet string, replacing {room}
async function sendRawPacket(content) {
    if (!isAutomationRunning) return;
    const isConnected = await dispatch.getState('connected');
    if (!isConnected) {
        stopAutomation();
        throw new Error('Connection lost. Automation stopped.');
    }
    await refreshRoom();
    const roomId = getRoomIdToUse();
    if (!roomId) {
        throw new Error('No room ID available. Please enter a room.');
    }
    const finalContent = content.replaceAll('{room}', roomId);
    await dispatch.sendRemoteMessage(finalContent);
}

function sleep(ms) {
    return new Promise(resolve => {
        currentTimeout = setTimeout(resolve, ms);
    });
}

async function waitWithCountdown(totalSeconds, label = 'Waiting', step = null) {
    if (!isAutomationRunning) return;
    let remaining = totalSeconds;
    // Immediate update
    updateStatus(`${label} ${Math.floor(remaining / 60)}m ${pad(remaining % 60)}s...`, 'info', step);
    await new Promise(resolve => {
        countdownInterval = setInterval(() => {
            if (!isAutomationRunning) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                resolve();
                return;
            }
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                resolve();
                return;
            }
            updateStatus(`${label} ${Math.floor(remaining / 60)}m ${pad(remaining % 60)}s...`, 'info', step);
        }, 1000);
    });
}

async function validateDenStart() {
    await refreshRoom();
    const textualRoom = await dispatch.getState('room');
    // Basic den check: textual room names for dens start with 'den'
    if (!textualRoom || typeof textualRoom !== 'string' || !textualRoom.toLowerCase().startsWith('den')) {
        updateStatus('Error: You must start this automation in your den.', 'error');
        return false;
    }
    return true;
}

function parseLoopSettings() {
    const loopValue = loopMode ? loopMode.value : '1';
    if (loopValue === 'infinite') {
        totalLoopsToRun = Infinity;
        isLooping = true;
    } else {
        totalLoopsToRun = parseInt(loopValue, 10) || 1;
        isLooping = totalLoopsToRun > 1;
    }
    currentLoopCount = 0;
}

// All steps are now driven by tiki_trouble_packets.json

async function runSingleAutomation() {
    currentLoopCount += 1;
    currentStep = 0;
    const packets = (tiki_trouble_packets && tiki_trouble_packets.packets) ? tiki_trouble_packets.packets : [];
    totalSteps = packets.length;

    try {
        await refreshRoom();
        const textualRoom = await dispatch.getState('room');
        const roomId = getRoomIdToUse();
        if (!roomId || !textualRoom) {
            updateStatus('Error: Not in a valid room. Please enter a room first.', 'error');
            stopAutomation();
            return;
        }

        for (let i = 0; i < packets.length; i++) {
            if (!isAutomationRunning) return;
            const pkt = packets[i];
            await sendPacket(pkt, i + 1);
        }

        updateStatus('Tiki Trouble run completed!', 'success', totalSteps);

    } catch (error) {
        updateStatus(`Error: ${error.message}`, 'error');
        stopAutomation();
        return;
    }
}

// Main Automation Logic
async function startAutomation() {
    // Enforce starting in den
    if (!(await validateDenStart())) {
        return;
    }

    // Parse loop settings
    parseLoopSettings();

    isAutomationRunning = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    updateStatus(`Starting Tiki Trouble automation${isLooping ? ` (${totalLoopsToRun === Infinity ? '∞' : totalLoopsToRun} runs)` : ''}...`, 'info');

    // Run loop
    do {
        if (!isAutomationRunning) break;
        await runSingleAutomation();
        if (!isAutomationRunning) break;
        if (isLooping && (totalLoopsToRun === Infinity || currentLoopCount < totalLoopsToRun)) {
            const loopStatus = ` (${currentLoopCount}/${totalLoopsToRun === Infinity ? '∞' : totalLoopsToRun})`;
            updateStatus(`Preparing next run${loopStatus}...`, 'info');
            await sleep(3000);
        } else {
            break;
        }
    } while (isAutomationRunning);

    stopAutomation();
}

function stopAutomation() {
    isAutomationRunning = false;
    isLooping = false;
    currentLoopCount = 0;
    totalLoopsToRun = 1;
    if (currentTimeout) {
        clearTimeout(currentTimeout);
        currentTimeout = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    updateStatus('Automation stopped.', 'info');
}

// Event Listeners
startButton.addEventListener('click', startAutomation);
stopButton.addEventListener('click', stopAutomation);

// Initialize
function initialize() {
    updateStatus('Ready to start Tiki Trouble automation (start from your den)', 'info');
    if (typeof require === 'function') {
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.on('connection-status-changed', (event, isConnected) => {
                if (!isConnected && isAutomationRunning) {
                    updateStatus('Connection lost. Stopping automation.', 'error');
                    stopAutomation();
                }
            });
        } catch (e) {
            console.error('[Tiki Trouble Automation] Could not set up IPC listeners.', e);
            updateStatus('Error: Could not initialize listeners.', 'error');
        }
    }
}

initialize();
