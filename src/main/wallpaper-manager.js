// src/main/wallpaper-manager.js
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { IPC, WALLPAPER_STATUS } = require('../shared/constants');

let wallpaperWindow = null;
let currentStatus = WALLPAPER_STATUS.STOPPED;

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

  wallpaperWindow.on('closed', () => {
    wallpaperWindow = null;
    currentStatus = WALLPAPER_STATUS.STOPPED;
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
  }

  return wallpaperWindow;
}

function setWallpaper(wallpaper) {
  if (!wallpaperWindow) return;
  wallpaperWindow.webContents.send(IPC.SET_WALLPAPER, wallpaper);
  currentStatus = WALLPAPER_STATUS.PLAYING;
}

function pause() {
  if (!wallpaperWindow) return;
  wallpaperWindow.webContents.send(IPC.PAUSE_WALLPAPER);
  currentStatus = WALLPAPER_STATUS.PAUSED;
}

function resume() {
  if (!wallpaperWindow) return;
  wallpaperWindow.webContents.send(IPC.RESUME_WALLPAPER);
  currentStatus = WALLPAPER_STATUS.PLAYING;
}

function getStatus() {
  return currentStatus;
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
}

module.exports = { create, setWallpaper, pause, resume, getStatus, send, destroy };
