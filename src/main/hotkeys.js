const { globalShortcut } = require('electron');
const config = require('./config');
const wallpaperManager = require('./wallpaper-manager');
const { WALLPAPER_STATUS, DEFAULT_CONFIG } = require('../shared/constants');

function register() {
  const accel = config.get('hotkey') || DEFAULT_CONFIG.hotkey;
  globalShortcut.register(accel, () => {
    const status = wallpaperManager.getStatus();
    if (status === WALLPAPER_STATUS.PAUSED) {
      wallpaperManager.resume();
    } else if (status === WALLPAPER_STATUS.PLAYING) {
      wallpaperManager.pause();
    }
  });
}

function unregister() {
  globalShortcut.unregisterAll();
}

module.exports = { register, unregister };