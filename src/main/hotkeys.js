const { globalShortcut } = require('electron');
const config = require('./config');
const wallpaperManager = require('./wallpaper-manager');
const { DEFAULT_CONFIG } = require('../shared/constants');

function register() {
  const accel = config.get('hotkey') || DEFAULT_CONFIG.hotkey;
  const registered = globalShortcut.register(accel, () => {
    wallpaperManager.toggle();
  });
  if (!registered) {
    console.warn('Failed to register global shortcut:', accel);
  }
}

function unregister() {
  globalShortcut.unregisterAll();
}

module.exports = { register, unregister };