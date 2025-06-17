const HTTPClient = require('../../services/HttpClient')
const path = require('path')
const fs = require('fs')

module.exports = new class FilesController {

  /**
   * Host endpoint.
   * @getter
   * @returns {Object}
   * @public
   */
  get baseUrl () {
    return 'https://ajcontent.akamaized.net'
  }

  /**
   * Request headers.
   * @getter
   * @returns {Object}
   * @public
   */
  get baseHeaders () {
    return {
      Host: 'ajcontent.akamaized.net',
      Referer: 'https://desktop.animaljam.com/gameClient/game/index.html'
    }
  }

  /**
   * Gets the selected SWF file from settings.
   * With file replacement strategy, this always returns 'ajclient.swf'
   * @returns {string} The selected SWF filename
   * @private
   */
  getSelectedSwfFile () {
    // With file replacement strategy, we always serve ajclient.swf
    // The actual file switching is handled by replaceSwfFile()
    return 'ajclient.swf'
  }

  /**
   * Replaces the active ajclient.swf with the selected file using a robust backup system.
   * @param {string} selectedFile - The filename to make active
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   * @public
   */
  async replaceSwfFile(selectedFile) {
    const flashDir = path.resolve('assets', 'flash')
    const backupsDir = path.join(flashDir, 'backups')
    const targetFile = path.join(flashDir, 'ajclient.swf') // This is always the active file

    try {
      // Ensure backups directory exists
      if (!fs.existsSync(backupsDir)) {
        await fs.promises.mkdir(backupsDir)
      }

      // 1. Backup the original source files if they don't have a backup yet
      const allSwfFiles = fs.readdirSync(flashDir).filter(f => f.endsWith('.swf') && f !== 'ajclient.swf');
      for (const file of allSwfFiles) {
        const backupPath = path.join(backupsDir, file);
        if (!fs.existsSync(backupPath)) {
          const sourcePath = path.join(flashDir, file);
          await fs.promises.copyFile(sourcePath, backupPath);
          console.log(`Created initial backup for ${file}`);
        }
      }
       // Also back up the base ajclient.swf if not already there
      const originalClientBackupPath = path.join(backupsDir, 'ajclient.swf');
      if (!fs.existsSync(originalClientBackupPath) && fs.existsSync(targetFile)) {
          await fs.promises.copyFile(targetFile, originalClientBackupPath);
          console.log(`Created initial backup for original ajclient.swf`);
      }


      // 2. Determine the correct source for the new active client
      const sourceToCopy = path.join(backupsDir, selectedFile);
      if (!fs.existsSync(sourceToCopy)) {
        return { success: false, error: `Backup for ${selectedFile} not found.` };
      }

      // 3. Replace ajclient.swf with the selected file's backup
      await fs.promises.copyFile(sourceToCopy, targetFile);
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
   * Gets the currently active SWF file info
   * @returns {Object} Info about the currently active file
   * @public
   */
  getActiveSwfInfo() {
    const flashDir = path.resolve('assets', 'flash')
    const backupsDir = path.join(flashDir, 'backups')
    const targetFile = path.join(flashDir, 'ajclient.swf')

    try {
      if (!fs.existsSync(targetFile)) {
        return { active: null, hasBackup: false }
      }

      const stats = fs.statSync(targetFile)
      
      // Heuristic: Compare the active file with the backups to find a match
      const availableFiles = this.getAvailableSwfFiles()
      let detectedSource = 'ajclient.swf' // default

      const backupFiles = fs.readdirSync(backupsDir).filter(f => f.endsWith('.swf'));
      for (const filename of backupFiles) {
        const backupPath = path.join(backupsDir, filename)
        if (fs.existsSync(backupPath)) {
          const backupStats = fs.statSync(backupPath)
          if (backupStats.size === stats.size) {
            detectedSource = filename
            break
          }
        }
      }

      return {
        active: detectedSource,
        size: stats.size,
        modified: stats.mtime,
        hasBackup: fs.existsSync(path.join(backupsDir, detectedSource))
      }
    } catch (error) {
      console.error('Error getting active SWF info:', error)
      return { active: null, hasBackup: false, error: error.message }
    }
  }

  /**
   * Gets all available SWF files from the flash directory and backups.
   * @returns {Array<string>} Array of available SWF filenames
   * @public
   */
  getAvailableSwfFiles () {
    const flashDir = path.resolve('assets', 'flash')
    const backupsDir = path.join(flashDir, 'backups')
    let files = []

    try {
      // Get all original .swf files from the flash directory (excluding the active one)
      if (fs.existsSync(flashDir)) {
        const mainFiles = fs.readdirSync(flashDir)
          .filter(f => f.endsWith('.swf') && 
                      f !== 'ajclient.swf' &&
                      !fs.statSync(path.join(flashDir, f)).isDirectory())
        files.push(...mainFiles)
      }
      
      // Ensure ajclient.swf is in the list if its backup exists
      if (fs.existsSync(path.join(backupsDir, 'ajclient.swf')) && !files.includes('ajclient.swf')) {
          files.unshift('ajclient.swf');
      }


    } catch (error) {
      console.error('Error scanning for SWF files:', error)
      // Return default files if scanning fails
      return ['ajclient.swf', 'ajclientdev.swf']
    }
    
    // Deduplicate and ensure default is present
    const uniqueFiles = [...new Set(files)];
    if (!uniqueFiles.includes('ajclient.swf') && fs.existsSync(path.join(backupsDir, 'ajclient.swf'))) {
      uniqueFiles.unshift('ajclient.swf')
    }

    return uniqueFiles.sort();
  }

  /**
   * Gets SWF file information for display purposes.
   * @returns {Array<Object>} Array of SWF file info objects
   * @public
   */
  getSwfFileInfo () {
    const files = this.getAvailableSwfFiles()
    const flashDir = path.resolve('assets', 'flash')
    const backupsDir = path.join(flashDir, 'backups')
    
    return files.map(filename => {
      const sourcePath = path.join(flashDir, filename)
      const backupPath = path.join(backupsDir, filename)
      const displayPath = fs.existsSync(sourcePath) ? sourcePath : backupPath;

      let stats = null
      let displayName = filename
      
      try {
        if (fs.existsSync(displayPath)) {
          stats = fs.statSync(displayPath)
        }
        
        // Create friendly display names
        if (filename === 'ajclient.swf') {
          displayName = 'Production Client (ajclient.swf)'
        } else if (filename === 'ajclientdev.swf') {
          displayName = 'Development Client (ajclientdev.swf)'
        } else {
          displayName = `Custom Client (${filename})`
        }
      } catch (error) {
        console.error(`Error getting stats for ${filename}:`, error)
      }

      return {
        filename,
        displayName,
        size: stats ? stats.size : 0,
        modified: stats ? stats.mtime : null,
        exists: stats !== null
      }
    })
  }

  /**
   * Renders the animal jam swf file.
   * @param {Request} request
   * @param {Response} response
   * @returns {void}
   * @public
   */
  game (request, response) {
    const selectedSwf = this.getSelectedSwfFile()
    
    const filePath = process.platform == 'win32'
      ? path.resolve('assets', 'flash', selectedSwf)
      : path.join(__dirname, '..', '..', '..', '..', '..', 'assets', 'flash', selectedSwf)
    
    // Check if file exists before serving
    if (!fs.existsSync(filePath)) {
      console.error(`SWF file not found: ${filePath}`)
      return response.status(404).send('SWF file not found')
    }
    
    console.log(`Serving SWF file: ${selectedSwf}`)
    return response.sendFile(filePath)
  }

  /**
   * Renders the animal jam files.
   * @param {Request} request
   * @param {Response} response
   * @returns {void}
   * @public
   */
  index (request, response) {
    return request.pipe(
      HTTPClient.proxy({
        url: `${this.baseUrl}/${request.path}`,
        headers: this.baseHeaders
      })
    ).pipe(response)
  }
}()
