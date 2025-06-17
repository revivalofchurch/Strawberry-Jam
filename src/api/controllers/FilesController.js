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
   * Replaces the active ajclient.swf with the selected file
   * @param {string} selectedFile - The filename to make active
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   * @public
   */
  async replaceSwfFile(selectedFile) {
    const flashDir = path.resolve('assets', 'flash')
    const targetFile = path.join(flashDir, 'ajclient.swf')
    const backupFile = path.join(flashDir, 'ajclient.swf.backup')
    const sourceFile = path.join(flashDir, selectedFile)

    try {
      // If selecting ajclient.swf, restore from backup if it exists
      if (selectedFile === 'ajclient.swf') {
        if (fs.existsSync(backupFile)) {
          // Restore original from backup
          await fs.promises.copyFile(backupFile, targetFile)
          await fs.promises.unlink(backupFile)
          console.log('Restored original ajclient.swf from backup')
          return { success: true, message: 'Restored original ajclient.swf' }
        } else {
          // Already using original ajclient.swf
          return { success: true, message: 'Already using original ajclient.swf' }
        }
      }

      // Validate source file exists
      if (!fs.existsSync(sourceFile)) {
        return { success: false, error: `Source file ${selectedFile} not found` }
      }

      // Create backup of current ajclient.swf if it exists and no backup exists
      if (fs.existsSync(targetFile) && !fs.existsSync(backupFile)) {
        await fs.promises.copyFile(targetFile, backupFile)
        console.log('Backed up current ajclient.swf')
      }

      // Replace ajclient.swf with selected file
      await fs.promises.copyFile(sourceFile, targetFile)
      console.log(`Replaced ajclient.swf with ${selectedFile}`)
      
      return { 
        success: true, 
        message: `Successfully switched to ${selectedFile}` 
      }

    } catch (error) {
      console.error('Error replacing SWF file:', error)
      return { 
        success: false, 
        error: `Failed to replace SWF file: ${error.message}` 
      }
    }
  }

  /**
   * Gets the currently active SWF file info
   * @returns {Object} Info about the currently active file
   * @public
   */
  getActiveSwfInfo() {
    const flashDir = path.resolve('assets', 'flash')
    const targetFile = path.join(flashDir, 'ajclient.swf')
    const backupFile = path.join(flashDir, 'ajclient.swf.backup')

    try {
      if (!fs.existsSync(targetFile)) {
        return { active: null, hasBackup: false }
      }

      const stats = fs.statSync(targetFile)
      const hasBackup = fs.existsSync(backupFile)

      // Try to determine which file is currently active by comparing file sizes
      // This is a heuristic since we can't know for certain without metadata
      const availableFiles = this.getAvailableSwfFiles()
      let detectedSource = 'ajclient.swf' // default assumption

      for (const filename of availableFiles) {
        if (filename === 'ajclient.swf') continue
        
        const sourceFile = path.join(flashDir, filename)
        if (fs.existsSync(sourceFile)) {
          const sourceStats = fs.statSync(sourceFile)
          if (sourceStats.size === stats.size && 
              Math.abs(sourceStats.mtime - stats.mtime) < 1000) { // within 1 second
            detectedSource = filename
            break
          }
        }
      }

      return {
        active: detectedSource,
        size: stats.size,
        modified: stats.mtime,
        hasBackup: hasBackup
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
      // Main directory .swf files (excluding backup files)
      if (fs.existsSync(flashDir)) {
        const mainFiles = fs.readdirSync(flashDir)
          .filter(f => f.endsWith('.swf') && 
                      !f.endsWith('.backup') && 
                      !fs.statSync(path.join(flashDir, f)).isDirectory())
        files.push(...mainFiles)
      }

      // Backup directory .swf files
      if (fs.existsSync(backupsDir)) {
        const backupFiles = fs.readdirSync(backupsDir)
          .filter(f => f.endsWith('.swf'))
          .map(f => `backups/${f}`)
        files.push(...backupFiles)
      }
    } catch (error) {
      console.error('Error scanning for SWF files:', error)
      // Return default files if scanning fails
      return ['ajclient.swf', 'ajclientdev.swf']
    }

    // Ensure we always have at least the default file
    if (!files.includes('ajclient.swf')) {
      files.unshift('ajclient.swf')
    }

    return files
  }

  /**
   * Gets SWF file information for display purposes.
   * @returns {Array<Object>} Array of SWF file info objects
   * @public
   */
  getSwfFileInfo () {
    const files = this.getAvailableSwfFiles()
    const flashDir = path.resolve('assets', 'flash')
    
    return files.map(filename => {
      const fullPath = path.join(flashDir, filename)
      let stats = null
      let displayName = filename
      
      try {
        if (fs.existsSync(fullPath)) {
          stats = fs.statSync(fullPath)
        }
        
        // Create friendly display names
        if (filename === 'ajclient.swf') {
          displayName = 'Production Client (ajclient.swf)'
        } else if (filename === 'ajclientdev.swf') {
          displayName = 'Development Client (ajclientdev.swf)'
        } else if (filename.startsWith('backups/')) {
          displayName = `Backup: ${filename.replace('backups/', '')}`
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
