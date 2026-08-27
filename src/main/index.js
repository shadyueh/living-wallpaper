// src/main/index.js
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const config = require('./config');
const wallpaperManager = require('./wallpaper-manager');
const fullscreenDetector = require('./fullscreen-detector');
const tray = require('./tray');
const { IPC } = require('../shared/constants');

let uiWindow = null;

function createUIWindow() {
  uiWindow = new BrowserWindow({
    width: 520,
    height: 480,
    title: 'Living Wallpaper — Settings',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
    backgroundColor: '#1a1a2e',
  });

  uiWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  uiWindow.on('close', (e) => {
    e.preventDefault();
    uiWindow.hide();
  });

  return uiWindow;
}

// --- IPC Handlers ---

ipcMain.on(IPC.GET_CONFIG, (event) => {
  event.reply('lw:config-response', config.getAll());
});

ipcMain.on(IPC.SET_CONFIG, (_event, partial) => {
  for (const [key, value] of Object.entries(partial)) {
    config.set(key, value);
  }
});

ipcMain.on(IPC.SET_WALLPAPER, (_event, wallpaper) => {
  config.set('wallpaper', wallpaper.path);
  wallpaperManager.setWallpaper(wallpaper);
  tray.updateMenu();
});

ipcMain.on(IPC.PAUSE_WALLPAPER, () => wallpaperManager.pause());
ipcMain.on(IPC.RESUME_WALLPAPER, () => wallpaperManager.resume());

ipcMain.on(IPC.SET_VOLUME, (_event, volume) => {
  wallpaperManager.send(IPC.SET_VOLUME, volume);
});

ipcMain.on(IPC.SET_SPEED, (_event, speed) => {
  wallpaperManager.send(IPC.SET_SPEED, speed);
});

ipcMain.on(IPC.SHOW_UI, () => {
  if (uiWindow) {
    uiWindow.show();
    uiWindow.focus();
  }
});

ipcMain.on(IPC.QUIT_APP, () => {
  wallpaperManager.destroy();
  app.quit();
});

// --- App Lifecycle ---

app.whenReady().then(async () => {
  await config.init();

  const primaryDisplay = screen.getPrimaryDisplay();
  wallpaperManager.create(primaryDisplay);

  const savedWallpaper = config.get('wallpaper');
  if (savedWallpaper) {
    wallpaperManager.setWallpaper({
      type: 'video',
      path: savedWallpaper,
      volume: config.get('volume'),
    });
  }

  if (config.get('pauseOnFullscreen')) {
    fullscreenDetector.start((isFullscreen) => {
      if (isFullscreen) wallpaperManager.pause();
      else wallpaperManager.resume();
    });
  }

  tray.create();
  createUIWindow();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  fullscreenDetector.stop();
  wallpaperManager.destroy();
  tray.destroy();
});
