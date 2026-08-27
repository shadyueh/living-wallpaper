// src/main/index.js
const { app, BrowserWindow, ipcMain, screen, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const wallpaperManager = require('./wallpaper-manager');
const fullscreenDetector = require('./fullscreen-detector');
const tray = require('./tray');
const { IPC, WALLPAPER_STATUS } = require('../shared/constants');

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
    if (uiWindow && !uiWindow.isDestroyed()) {
      uiWindow.webContents.send(IPC.WALLPAPER_ERROR, `File not found: ${path.basename(wallpaper.path)}`);
    }
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
    if (uiWindow && !uiWindow.isDestroyed()) {
      uiWindow.webContents.send(IPC.WALLPAPER_ERROR, error);
    }
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Living Wallpaper',
        body: `Video file not found: ${error}`,
      });
      notification.show();
    }
  }
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
    if (fs.existsSync(savedWallpaper)) {
      wallpaperManager.setWallpaper({
        type: 'video',
        path: savedWallpaper,
        volume: config.get('volume'),
      });
    } else {
      config.set('wallpaper', null);
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: 'Living Wallpaper',
          body: `Saved video not found: ${path.basename(savedWallpaper)}`,
        });
        notification.show();
      }
    }
  }

  if (config.get('pauseOnFullscreen')) {
    let lastFullscreenState = false;
    fullscreenDetector.start((isFullscreen) => {
      if (isFullscreen && !lastFullscreenState) {
        wallpaperManager.pause();
        if (Notification.isSupported()) {
          new Notification({
            title: 'Living Wallpaper',
            body: 'Wallpaper paused — fullscreen app detected',
          }).show();
        }
      } else if (!isFullscreen && lastFullscreenState) {
        wallpaperManager.resume();
        if (Notification.isSupported()) {
          new Notification({
            title: 'Living Wallpaper',
            body: 'Wallpaper resumed',
          }).show();
        }
      }
      lastFullscreenState = isFullscreen;
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
