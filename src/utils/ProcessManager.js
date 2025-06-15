const { app } = require('electron');
const treeKill = require('tree-kill');
const logManager = require('./LogManager'); // Use our logger

class ProcessManager {
  constructor() {
    this.childProcesses = new Set();
    this.isQuitting = false; // Add a flag to prevent re-entry
    app.on('will-quit', this.killAll.bind(this));
  }

  add(process) {
    logManager.log(`[ProcessManager] Tracking new process with PID: ${process.pid}`, 'main');
    this.childProcesses.add(process);
    process.on('exit', (code) => {
      logManager.log(`[ProcessManager] Process with PID: ${process.pid} has exited with code ${code}.`, 'main');
      this.childProcesses.delete(process);
    });
  }

  killAll(event) {
    // Prevent the "will-quit" loop
    if (this.isQuitting) {
      return;
    }
    this.isQuitting = true;

    logManager.log('[ProcessManager] "will-quit" event triggered. Starting killAll sequence.', 'main');
    if (event) {
      logManager.log('[ProcessManager] Preventing default quit behavior to manage child processes.', 'main');
      event.preventDefault();
    }

    const promises = [];
    if (this.childProcesses.size === 0) {
      logManager.log('[ProcessManager] No child processes to kill.', 'main');
    } else {
      logManager.log(`[ProcessManager] Attempting to kill ${this.childProcesses.size} child processes.`, 'main');
    }

    for (const process of this.childProcesses) {
      logManager.log(`[ProcessManager] Creating kill promise for PID: ${process.pid}`, 'main');
      promises.push(new Promise((resolve) => {
        treeKill(process.pid, 'SIGKILL', (err) => {
          if (err) {
            logManager.error(`[ProcessManager] Failed to kill process tree for PID ${process.pid}: ${err.message}`);
          } else {
            logManager.log(`[ProcessManager] Successfully killed process tree for PID: ${process.pid}`, 'main');
          }
          // Always resolve to ensure Promise.all completes
          resolve();
        });
      }));
    }

    Promise.all(promises).then(() => {
      logManager.log('[ProcessManager] All kill promises have resolved.', 'main');
      if (event) {
        logManager.log('[ProcessManager] Proceeding to call app.quit().', 'main');
        app.quit();
      } else {
        logManager.log('[ProcessManager] No event object, skipping final app.quit().', 'main');
      }
    }).catch(error => {
      // This block may not be reached if we always resolve, but it's good practice
      logManager.error(`[ProcessManager] Error in Promise.all: ${error.message}`);
      if (event) {
        logManager.log('[ProcessManager] Calling app.quit() despite error in Promise.all.', 'main');
        app.quit();
      }
    });
  }
}

module.exports = new ProcessManager();
