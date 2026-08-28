// src/main/index.js
const { app, BrowserWindow, ipcMain, screen, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const wallpaperManager = require('./wallpaper-manager');
const fullscreenDetector = require('./fullscreen-detector');
const hotkeys = require('./hotkeys');
const tray = require('./tray');
const { IPC, WALLPAPER_STATUS } = require('../shared/constants');

let uiWindow = null;

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

function sendWallpaperError(message) {
  if (uiWindow && !uiWindow.isDestroyed()) {
    uiWindow.webContents.send(IPC.WALLPAPER_ERROR, message);
  }
}

function startWallpaper() {
  wallpaperManager.create(screen.getPrimaryDisplay());

  const savedWallpaper = config.get('wallpaper');
  if (!savedWallpaper) return;

  if (!fs.existsSync(savedWallpaper)) {
    config.set('wallpaper', null);
    notify('Living Wallpaper', `Saved video not found: ${path.basename(savedWallpaper)}`);
    return;
  }

  wallpaperManager.setWallpaper({
    type: 'video',
    path: savedWallpaper,
    volume: config.get('volume'),
  });
}

function showUIWindow() {
  if (uiWindow) {
    uiWindow.show();
    uiWindow.focus();
  }
}

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
  event.reply(IPC.CONFIG_RESPONSE, config.getAll());
});

ipcMain.on(IPC.SET_CONFIG, (_event, partial) => {
  for (const [key, value] of Object.entries(partial)) {
    config.set(key, value);
  }
});

ipcMain.on(IPC.SET_WALLPAPER, (_event, wallpaper) => {
  if (!wallpaper || !wallpaper.path || typeof wallpaper.path !== 'string') return;
  if (!fs.existsSync(wallpaper.path)) {
    sendWallpaperError(`File not found: ${path.basename(wallpaper.path)}`);
    return;
  }
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

ipcMain.on(IPC.WALLPAPER_STATUS, (_event, { status, error }) => {
  wallpaperManager.updateStatus(status, error);
  tray.updateMenu();

  if (status === WALLPAPER_STATUS.ERROR) {
    config.set('wallpaper', null);
    sendWallpaperError(error);
    notify('Living Wallpaper', `Video file not found: ${error}`);
  }
});

ipcMain.on(IPC.SHOW_UI, () => {
  showUIWindow();
});

ipcMain.on(IPC.QUIT_APP, () => {
  app.quit();
});

// --- App Lifecycle ---

app.whenReady().then(async () => {
  await config.init();

  startWallpaper();

  if (config.get('pauseOnFullscreen')) {
    let lastFullscreenState = false;
    fullscreenDetector.start((isFullscreen) => {
      if (isFullscreen && !lastFullscreenState) {
        wallpaperManager.pause();
        notify('Living Wallpaper', 'Wallpaper paused — fullscreen app detected');
      } else if (!isFullscreen && lastFullscreenState) {
        wallpaperManager.resume();
        notify('Living Wallpaper', 'Wallpaper resumed');
      }
      lastFullscreenState = isFullscreen;
    });
  }

  hotkeys.register();

  tray.create({
    showSettings: () => showUIWindow(),
  });
  createUIWindow();
});

app.on('before-quit', () => {
  fullscreenDetector.stop();
  wallpaperManager.destroy();
  hotkeys.unregister();
  if (uiWindow && !uiWindow.isDestroyed()) {
    uiWindow.destroy();
  }
  tray.destroy();
});
