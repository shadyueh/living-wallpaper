// src/main/wallpaper-manager.js
const { BrowserWindow } = require('electron');
const path = require('path');
const { IPC, WALLPAPER_STATUS } = require('../shared/constants');

const PARENT_CHECK_INTERVAL_MS = 5000;

let wallpaperWindow = null;
let currentStatus = WALLPAPER_STATUS.STOPPED;
let isReady = false;
let pendingWallpaper = null;
let parentWatchId = null;

function stopParentingWatch() {
  if (parentWatchId) {
    clearInterval(parentWatchId);
    parentWatchId = null;
  }
}

function startParentingWatch() {
  if (parentWatchId || process.platform !== 'win32') return;
  parentWatchId = setInterval(() => {
    if (!wallpaperWindow) return;
    try {
      const windows = require('./desktop/windows');
      const hwnd = wallpaperWindow.getNativeWindowHandle();
      windows.ensureParentedToWorkerW(Number(hwnd.readBigUInt64LE(0)));
    } catch (err) {
      console.error('Parenting watch failed:', err.message);
    }
  }, PARENT_CHECK_INTERVAL_MS);
}

function resetState() {
  pendingWallpaper = null;
  isReady = false;
  stopParentingWatch();
}

function create(display) {
  if (wallpaperWindow) wallpaperWindow.destroy();

  const { x, y, width, height } = display.bounds;

  wallpaperWindow = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: false,
    type: 'toolbar',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: false,
    },
  });

  wallpaperWindow.setVisibleOnAllWorkspaces(true);
  wallpaperWindow.loadFile(path.join(__dirname, '..', 'wallpaper', 'index.html'));

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

  // Parent to WorkerW on Windows
  if (process.platform === 'win32') {
    try {
      const windows = require('./desktop/windows');
      const hwnd = wallpaperWindow.getNativeWindowHandle();
      windows.setParentToWorkerW(Number(hwnd.readBigUInt64LE(0)));
    } catch (err) {
      console.error('WorkerW injection failed:', err.message);
    }
    startParentingWatch();
  }

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
  console.log('[Wallpaper] Paused (fullscreen detected)');
  wallpaperWindow.webContents.send(IPC.PAUSE_WALLPAPER);
  currentStatus = WALLPAPER_STATUS.PAUSED;
}

function resume() {
  if (!wallpaperWindow) return;
  console.log('[Wallpaper] Resumed');
  wallpaperWindow.webContents.send(IPC.RESUME_WALLPAPER);
  currentStatus = WALLPAPER_STATUS.PLAYING;
}

function getStatus() {
  return currentStatus;
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

module.exports = { create, setWallpaper, pause, resume, getStatus, updateStatus, send, destroy };
