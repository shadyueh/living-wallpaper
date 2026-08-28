// src/main/wallpaper-manager.js
const { BrowserWindow } = require('electron');
const path = require('path');
const { IPC, WALLPAPER_STATUS } = require('../shared/constants');
const windows = require('./desktop/windows');

let wallpaperWindow = null;
let currentStatus = WALLPAPER_STATUS.STOPPED;
let isReady = false;
let pendingWallpaper = null;

function resetState() {
  pendingWallpaper = null;
  isReady = false;
}

function create(display) {
  if (!display || !display.bounds) {
    throw new TypeError('A display with bounds is required to create the wallpaper window');
  }
  if (wallpaperWindow) wallpaperWindow.destroy();

  const { x, y, width, height } = display.bounds;

  const options = {
    x, y, width, height,
    frame: false,
    show: false,
    backgroundColor: '#000000',
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: false,
    },
  };

  // 'desktop' is a valid type on macOS/Linux (background window level), but on
  // Windows it is not a valid type and is silently ignored, leaving the window
  // rendered above the desktop icons. On Windows the wallpaper is instead
  // attached to the desktop WorkerW layer via attachWallpaperWindow below.
  if (process.platform !== 'win32') {
    options.type = 'desktop';
  }

  wallpaperWindow = new BrowserWindow(options);

  wallpaperWindow.setVisibleOnAllWorkspaces(true);
  wallpaperWindow.loadFile(path.join(__dirname, '..', 'wallpaper', 'index.html'));

  if (process.platform === 'win32') {
    try {
      const hwnd = Number(wallpaperWindow.getNativeWindowHandle().readBigUInt64LE(0));
      windows.disableRoundedCorners(hwnd);
      windows.attachWallpaperWindow(hwnd, width, height);
    } catch (error) {
      console.warn('Failed to attach wallpaper to the desktop layer:', error.message);
    }
  }

  wallpaperWindow.show();

  wallpaperWindow.webContents.once('did-finish-load', () => {
    isReady = true;
    if (pendingWallpaper) {
      wallpaperWindow.webContents.send(IPC.SET_WALLPAPER, pendingWallpaper);
      pendingWallpaper = null;
    }
  });

  wallpaperWindow.on('closed', () => {
    wallpaperWindow = null;
    currentStatus = WALLPAPER_STATUS.STOPPED;
    resetState();
  });

  return wallpaperWindow;
}

function setWallpaper(wallpaper) {
  if (!wallpaperWindow) return;
  if (!isReady) {
    pendingWallpaper = wallpaper;
    return;
  }
  wallpaperWindow.webContents.send(IPC.SET_WALLPAPER, wallpaper);
}

function pause() {
  if (!wallpaperWindow) return;
  console.log('Wallpaper paused');
  wallpaperWindow.webContents.send(IPC.PAUSE_WALLPAPER);
  currentStatus = WALLPAPER_STATUS.PAUSED;
}

function resume() {
  if (!wallpaperWindow) return;
  console.log('Wallpaper resumed');
  wallpaperWindow.webContents.send(IPC.RESUME_WALLPAPER);
  currentStatus = WALLPAPER_STATUS.PLAYING;
}

function getStatus() {
  return currentStatus;
}

function toggle() {
  if (!wallpaperWindow) return;
  if (currentStatus === WALLPAPER_STATUS.PAUSED) {
    resume();
  } else if (currentStatus === WALLPAPER_STATUS.PLAYING) {
    pause();
  }
}

function updateStatus(status, error) {
  if (status === WALLPAPER_STATUS.PLAYING || status === WALLPAPER_STATUS.PAUSED) {
    currentStatus = status;
  } else if (status === WALLPAPER_STATUS.ERROR) {
    currentStatus = WALLPAPER_STATUS.ERROR;
    console.error('Wallpaper error:', error);
  }
}

function send(channel, ...args) {
  if (!wallpaperWindow) return;
  wallpaperWindow.webContents.send(channel, ...args);
}

function destroy() {
  if (wallpaperWindow) {
    wallpaperWindow.destroy();
    wallpaperWindow = null;
  }
  currentStatus = WALLPAPER_STATUS.STOPPED;
  resetState();
}

module.exports = { create, setWallpaper, pause, resume, toggle, getStatus, updateStatus, send, destroy };
