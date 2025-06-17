const HTTPClient = require('../../services/HttpClient')
const path = require('path')
const fs = require('fs')

class FilesController {
  constructor() {
    this.flashDir = path.resolve('assets', 'flash');
    this.backupsDir = path.join(this.flashDir, 'backups');
  }

  /**
   * Host endpoint.
   */
  get baseUrl () {
    return 'https://ajcontent.akamaized.net'
  }

  /**
   * Request headers.
   */
  get baseHeaders () {
    return {
      Host: 'ajcontent.akamaized.net',
      Referer: 'https://desktop.animaljam.com/gameClient/game/index.html'
    }
  }

  /**
   * Initializes the SWF backup system.
   * This should be called on application startup.
   * @returns {Promise<void>}
   */
  async initializeSwfBackups() {
    try {
      // Ensure backups directory exists
      if (!fs.existsSync(this.backupsDir)) {
        await fs.promises.mkdir(this.backupsDir, { recursive: true });
        console.log('Created backups directory for SWF files.');
      }

      // Get all source SWF files from the flash directory
      const allSwfFiles = fs.readdirSync(this.flashDir)
        .filter(f => f.endsWith('.swf') && f !== 'ajclient.swf' && !fs.statSync(path.join(this.flashDir, f)).isDirectory());

      // Also include the base ajclient.swf in the backup process
      allSwfFiles.push('ajclient.swf');

      for (const file of allSwfFiles) {
        const sourcePath = path.join(this.flashDir, file);
        const backupPath = path.join(this.backupsDir, file);
        
        // If a backup doesn't exist and the source file does, create the backup.
        if (!fs.existsSync(backupPath) && fs.existsSync(sourcePath)) {
          await fs.promises.copyFile(sourcePath, backupPath);
          console.log(`Created initial backup for ${file}`);
        }
      }
    } catch (error) {
      console.error('Failed to initialize SWF backups:', error);
    }
  }

  /**
   * Gets the selected SWF file from settings.
   * This always returns 'ajclient.swf' because the active file is always a copy.
   */
  getSelectedSwfFile () {
    return 'ajclient.swf'
  }

  /**
   * Replaces the active ajclient.swf with the selected file from the backups.
   * @param {string} selectedFile - The filename to make active
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async replaceSwfFile(selectedFile) {
    const targetFile = path.join(this.flashDir, 'ajclient.swf');
    const sourceFromBackup = path.join(this.backupsDir, selectedFile);

    try {
      if (!fs.existsSync(sourceFromBackup)) {
        console.error(`Backup for ${selectedFile} not found. Attempting to re-initialize backups.`);
        await this.initializeSwfBackups();
        // Retry after re-initialization
        if (!fs.existsSync(sourceFromBackup)) {
          return { success: false, error: `Backup for ${selectedFile} not found even after re-initialization.` };
        }
      }

      await fs.promises.copyFile(sourceFromBackup, targetFile);
      console.log(`Switched active client to ${selectedFile}`);

      return {
        success: true,
        message: `Successfully switched to ${selectedFile}`
      };

    } catch (error) {
      console.error('Error replacing SWF file:', error);
      return {
        success: false,
        error: `Failed to replace SWF file: ${error.message}`
      };
    }
  }

  /**
   * Gets the currently active SWF file info by comparing it against backups.
   * @returns {Object} Info about the currently active file
   */
  getActiveSwfInfo() {
    const targetFile = path.join(this.flashDir, 'ajclient.swf');

    try {
      if (!fs.existsSync(targetFile) || !fs.existsSync(this.backupsDir)) {
        return { active: null, hasBackup: false, error: 'Active SWF or backups directory not found.' };
      }

      const stats = fs.statSync(targetFile);
      let detectedSource = 'ajclient.swf'; // Default assumption

      const backupFiles = fs.readdirSync(this.backupsDir).filter(f => f.endsWith('.swf'));
      for (const filename of backupFiles) {
        const backupPath = path.join(this.backupsDir, filename);
        if (fs.existsSync(backupPath)) {
          const backupStats = fs.statSync(backupPath);
          // Compare by size as a reliable heuristic
          if (backupStats.size === stats.size) {
            detectedSource = filename;
            break;
          }
        }
      }

      return {
        active: detectedSource,
        size: stats.size,
        modified: stats.mtime,
        hasBackup: fs.existsSync(path.join(this.backupsDir, detectedSource))
      };
    } catch (error) {
      console.error('Error getting active SWF info:', error.message);
      return { active: null, hasBackup: false, error: error.message };
    }
  }

  /**
   * Gets all available SWF files that can be selected.
   * @returns {Array<string>} Array of available SWF filenames
   */
  getAvailableSwfFiles () {
    try {
        if (!fs.existsSync(this.backupsDir)) {
            console.warn('Backups directory not found during getAvailableSwfFiles. Returning defaults.');
            return ['ajclient.swf', 'ajclientdev.swf'];
        }
        // The list of selectable files is simply the list of backups.
        const files = fs.readdirSync(this.backupsDir)
            .filter(f => f.endsWith('.swf') && !fs.statSync(path.join(this.backupsDir, f)).isDirectory());
        
        // Ensure production client is always an option if its backup exists
        if (!files.includes('ajclient.swf') && fs.existsSync(path.join(this.backupsDir, 'ajclient.swf'))) {
            files.unshift('ajclient.swf');
        }

        return [...new Set(files)].sort(); // Return sorted unique list
    } catch (error) {
        console.error('Error scanning for SWF files:', error);
        return ['ajclient.swf', 'ajclientdev.swf']; // Fallback
    }
  }

  /**
   * Gets SWF file information for display purposes.
   * @returns {Array<Object>} Array of SWF file info objects
   */
  getSwfFileInfo () {
    const files = this.getAvailableSwfFiles();
    
    return files.map(filename => {
      const backupPath = path.join(this.backupsDir, filename);
      let stats = null;
      let displayName = filename;
      
      try {
        if (fs.existsSync(backupPath)) {
          stats = fs.statSync(backupPath);
        }
        
        if (filename === 'ajclient.swf') {
          displayName = 'Production Client (ajclient.swf)';
        } else if (filename === 'ajclientdev.swf') {
          displayName = 'Development Client (ajclientdev.swf)';
        } else {
          displayName = `Custom Client (${filename})`;
        }
      } catch (error) {
        console.error(`Error getting stats for ${filename}:`, error);
      }

      return {
        filename,
        displayName,
        size: stats ? stats.size : 0,
        modified: stats ? stats.mtime : null,
        exists: stats !== null
      };
    });
  }

  /**
   * Serves the active ajclient.swf file.
   */
  game (request, response) {
    const activeSwfPath = path.join(this.flashDir, 'ajclient.swf');
    
    if (!fs.existsSync(activeSwfPath)) {
      console.error(`Active SWF file not found: ${activeSwfPath}`);
      return response.status(404).send('SWF file not found');
    }
    
    console.log(`Serving active SWF file: ${activeSwfPath}`);
    return response.sendFile(activeSwfPath);
  }

  /**
   * Proxies other requests to the Akamai servers.
   */
  index (request, response) {
    return request.pipe(
      HTTPClient.proxy({
        url: `${this.baseUrl}/${request.path}`,
        headers: this.baseHeaders
      })
    ).pipe(response);
  }
}

module.exports = new FilesController();
