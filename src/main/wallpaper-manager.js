// src/main/wallpaper-manager.js
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { IPC, WALLPAPER_STATUS } = require('../shared/constants');
const windows = require('./desktop/windows');

let wallpaperWindow = null;
let currentDisplayId = null;
let currentDisplayPhysicalRect = null;
let currentStatus = WALLPAPER_STATUS.STOPPED;
let isReady = false;
let pendingWallpaper = null;

function debugGeometry(label, wallpaperWindow, display) {
  if (process.env.LW_DEBUG_GEOMETRY !== '1') return;
  console.log(`[LW_DEBUG] ${label}`, {
    displayId: display && display.id,
    displayBounds: display && display.bounds,
    scaleFactor: display && display.scaleFactor,
    bounds: wallpaperWindow && wallpaperWindow.getBounds(),
    contentBounds: wallpaperWindow && wallpaperWindow.getContentBounds(),
    size: wallpaperWindow && wallpaperWindow.getSize(),
    contentSize: wallpaperWindow && wallpaperWindow.getContentSize(),
    nearestDisplay: (() => {
      try {
        const nearest = screen.getDisplayNearestWindow(wallpaperWindow);
        return { id: nearest.id, bounds: nearest.bounds, scaleFactor: nearest.scaleFactor };
      } catch {
        return null;
      }
    })(),
  });
}

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
  currentDisplayId = display.id ?? null;
  debugGeometry('after create', wallpaperWindow, display);

  wallpaperWindow.setVisibleOnAllWorkspaces(true);
  wallpaperWindow.loadFile(path.join(__dirname, '..', 'wallpaper', 'index.html'));

  wallpaperWindow.webContents.once('did-finish-load', () => {
    if (process.platform === 'win32') {
      try {
        const hwnd = Number(wallpaperWindow.getNativeWindowHandle().readBigUInt64LE(0));
        // Attach only once the window has settled on the target display: right
        // after `new BrowserWindow` the hidden window's OS rect can still report
        // the previous window's physical geometry while the move is pending,
        // which would anchor the attach on the wrong monitor. At did-finish-load
        // Electron has translated the DIP bounds to physical pixels for the
        // target display, so the OS rect is the final one and matches the target
        // monitor exactly.
        windows.disableRoundedCorners(hwnd);
        windows.attachWallpaperWindow(hwnd, display);
        // Physical rcMonitor of the target display: the reference rect used to
        // gate fullscreen auto-pause to this wallpaper's own monitor only.
        currentDisplayPhysicalRect = windows.monitorPhysicalRect(display);
        wallpaperWindow.setContentSize(Math.round(width), Math.round(height));
        // Re-assert the physical rect of the target monitor: setContentSize can
        // resize the HWND using a stale display/scale attribution. Re-attaching
        // is idempotent and pins position and size back to the target monitor.
        windows.attachWallpaperWindow(hwnd, display);
      } catch (error) {
        console.warn('Failed to attach wallpaper to the desktop layer:', error.message);
      }
    }
    debugGeometry('after did-finish-load', wallpaperWindow, display);
    if (process.env.LW_DEBUG_GEOMETRY === '1') {
      wallpaperWindow.webContents
        .executeJavaScript(
          '({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, '
            + 'videoW: document.getElementById("wallpaper").offsetWidth, '
            + 'videoH: document.getElementById("wallpaper").offsetHeight })'
        )
        .then((viewport) => console.log('[LW_DEBUG] renderer viewport', viewport))
        .catch(() => {});
    }
    // The window stays hidden until the desktop attach completes to avoid a flash
    // as a regular top-level window.
    wallpaperWindow.show();
    isReady = true;
    if (pendingWallpaper) {
      wallpaperWindow.webContents.send(IPC.SET_WALLPAPER, pendingWallpaper);
      pendingWallpaper = null;
    }
  });

  wallpaperWindow.on('closed', () => {
    wallpaperWindow = null;
    currentDisplayId = null;
    currentDisplayPhysicalRect = null;
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

function getDisplayId() {
  return currentDisplayId;
}

// Physical rcMonitor of the display the wallpaper window is attached to, in OS
// pixels. The fullscreen detector compares its per-monitor rcRects against this
// to pause only when a fullscreen app covers this wallpaper's own monitor.
function getDisplayPhysicalRect() {
  return currentDisplayPhysicalRect;
}

function destroy() {
  if (wallpaperWindow) {
    wallpaperWindow.destroy();
    wallpaperWindow = null;
  }
  currentDisplayId = null;
  currentDisplayPhysicalRect = null;
  currentStatus = WALLPAPER_STATUS.STOPPED;
  resetState();
}

module.exports = { create, setWallpaper, pause, resume, toggle, getStatus, updateStatus, send, getDisplayId, getDisplayPhysicalRect, destroy };
