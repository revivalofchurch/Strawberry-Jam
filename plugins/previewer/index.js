/**
 * Strawberry Jam - Item Previewer Plugin
 *
 * This plugin allows users to preview items in-game.
 */

// Plugin class
class ItemPreviewer {
  constructor() {
    this.initialized = false;
    
    // Initialize the plugin when document is ready
    this.init();
  }

  /**
   * Initialize the plugin
   */
  init() {
    if (this.initialized) return;
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log('[Item Previewer] Initialized');
    this.initialized = true;
  }

  /**
   * Set up event listeners for the plugin's UI elements
   */
  setupEventListeners() {
    const { dispatch } = jam;

    dispatch.waitForJQuery(window, () => {
      const item = $('#item');
      const color = $('#color');
      const slot = $('#slot');

      $('#spawn').click(() => {
        if (item.val() !== '' && color.val() !== '' && slot.val() !== '') {
          dispatch.sendConnectionMessage(`%xt%ti%-1%1%1%1%0%${item.val()}%${slot.val()}%${color.val()}%1%0%259%`);
        }
      });
    });
  }
}

// Initialize the plugin
window.itemPreviewer = new ItemPreviewer();
