// src/main/index.js
const { app, BrowserWindow, ipcMain, screen, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const wallpaperManager = require('./wallpaper-manager');
const { buildWallpaperPayload } = require('./wallpaper-payload');
const { resolveTargetDisplay, serializeDisplays } = require('./display-utils');
const fullscreenDetector = require('./fullscreen-detector');
const hotkeys = require('./hotkeys');
const tray = require('./tray');
const { IPC, WALLPAPER_STATUS } = require('../shared/constants');

let uiWindow = null;
let fullscreenPauseState = null;
let lastWallpaperRecreateAt = 0;

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

function resolveMonitor() {
  return resolveTargetDisplay(screen, config.get('targetDisplayId'));
}

function applySavedWallpaper() {
  const savedWallpaper = config.get('wallpaper');
  if (!savedWallpaper) return;

  if (!fs.existsSync(savedWallpaper)) {
    config.set('wallpaper', null);
    notify('Living Wallpaper', `Saved video not found: ${path.basename(savedWallpaper)}`);
    return;
  }

  wallpaperManager.setWallpaper(buildWallpaperPayload(savedWallpaper, config.getAll()));
}

function startWallpaper() {
  wallpaperManager.create(resolveMonitor());
  applySavedWallpaper();
}

// Re-serves the monitor list to the settings window so labels (name, resolution)
// and the selected monitor stay in sync when displays change while the app runs.
function broadcastMonitors() {
  if (uiWindow && !uiWindow.isDestroyed()) {
    uiWindow.webContents.send(
      IPC.MONITORS_RESPONSE,
      serializeDisplays(screen, config.get('targetDisplayId'))
    );
  }
}

// Pauses/resumes the wallpaper when a fullscreen window covers its own monitor.
// The detector reports per-monitor rcRects; a wallpaper only reacts when one of
// those rects covers the display it is attached to, so a fullscreen app on
// another monitor leaves it playing (each monitor can later host its own
// wallpaper). The detector runs only while the setting is enabled.
function setupFullscreenPause() {
  if (!config.get('pauseOnFullscreen')) {
    fullscreenDetector.stop();
    fullscreenPauseState = null;
    if (process.env.LW_DEBUG_FULLSCREEN === '1') {
      console.log('[LW_DEBUG_FULLSCREEN] pause desabilitado');
    }
    return;
  }
  if (fullscreenPauseState) return;
  if (process.env.LW_DEBUG_FULLSCREEN === '1') {
    console.log('[LW_DEBUG_FULLSCREEN] pause habilitado');
  }
  fullscreenPauseState = { lastFullscreenState: false };
  fullscreenDetector.start(({ fullscreen }) => {
    const state = fullscreenPauseState;
    if (!state) return;
    const displayRect = wallpaperManager.getDisplayPhysicalRect();
    const covered = displayRect
      ? fullscreen.some((rect) => fullscreenDetector.isRectCoveringDisplay(rect, displayRect))
      : false;
    if (process.env.LW_DEBUG_FULLSCREEN === '1') {
      console.log(
        `[LW_DEBUG_FULLSCREEN] gate displayRect=${JSON.stringify(displayRect)} covered=${covered}`
      );
    }
    if (covered && !state.lastFullscreenState) {
      if (process.env.LW_DEBUG_FULLSCREEN === '1') {
        console.log('[LW_DEBUG_FULLSCREEN] fullscreen=true -> pause');
      }
      wallpaperManager.pause();
      notify('Living Wallpaper', 'Wallpaper paused — fullscreen app detected');
    } else if (!covered && state.lastFullscreenState) {
      if (process.env.LW_DEBUG_FULLSCREEN === '1') {
        console.log('[LW_DEBUG_FULLSCREEN] fullscreen=false -> resume');
      }
      wallpaperManager.resume();
      notify('Living Wallpaper', 'Wallpaper resumed');
    }
    state.lastFullscreenState = covered;
  });
}

// Rebuilds the wallpaper window on a display whose resolution/scale changed, so
// it keeps covering the whole screen. The guard collapses the burst of metric
// events a single change produces into one rebuild.
function handleDisplayMetricsChanged(_event, display, changedMetrics) {
  const geometryChanged = Array.isArray(changedMetrics)
    && changedMetrics.some((metric) => metric === 'bounds' || metric === 'scaleFactor');
  if (geometryChanged && display.id === wallpaperManager.getDisplayId()) {
    const now = Date.now();
    if (now - lastWallpaperRecreateAt >= 700) {
      lastWallpaperRecreateAt = now;
      wallpaperManager.create(display);
      applySavedWallpaper();
    }
  }
  broadcastMonitors();
}

function handleDisplayRemoved(_event, display) {
  if (config.get('targetDisplayId') === display.id) {
    config.set('targetDisplayId', null);
  }
  if (wallpaperManager.getDisplayId() === display.id) {
    wallpaperManager.create(resolveMonitor());
    applySavedWallpaper();
  }
  broadcastMonitors();
}

function showUIWindow() {
  if (uiWindow) {
    uiWindow.show();
    uiWindow.focus();
  }
}

async function fitSettingsWindow() {
  if (!uiWindow || uiWindow.isDestroyed()) return;
  try {
    const { width, height } = await uiWindow.webContents.executeJavaScript(
      '({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })'
    );
    if (width > 0 && height > 0) {
      uiWindow.setContentSize(Math.ceil(width), Math.ceil(height));
    }
  } catch {
    // window may still be loading or already closed
  }
}

function createUIWindow() {
  uiWindow = new BrowserWindow({
    width: 480,
    height: 480,
    title: 'Living Wallpaper — Settings',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
    backgroundColor: '#1a1a2e',
  });

  uiWindow.removeMenu();
  uiWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  uiWindow.webContents.once('did-finish-load', () => {
    fitSettingsWindow();
  });

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
  if ('pauseOnFullscreen' in partial) {
    setupFullscreenPause();
  }
});

ipcMain.on(IPC.SET_WALLPAPER, (_event, wallpaper) => {
  if (!wallpaper || !wallpaper.path || typeof wallpaper.path !== 'string') return;
  if (!fs.existsSync(wallpaper.path)) {
    sendWallpaperError(`File not found: ${path.basename(wallpaper.path)}`);
    return;
  }
  config.set('wallpaper', wallpaper.path);
  wallpaperManager.setWallpaper(buildWallpaperPayload(wallpaper.path, config.getAll()));
  tray.updateMenu();
});

ipcMain.on(IPC.GET_MONITORS, (event) => {
  event.reply(IPC.MONITORS_RESPONSE, serializeDisplays(screen, config.get('targetDisplayId')));
});

ipcMain.on(IPC.SET_MONITOR_TARGET, (_event, displayId) => {
  if (typeof displayId !== 'number') return;
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display) return;
  if (wallpaperManager.getDisplayId() === displayId) return;
  config.set('targetDisplayId', displayId);
  wallpaperManager.create(display);
  applySavedWallpaper();
});

ipcMain.on(IPC.PAUSE_WALLPAPER, () => wallpaperManager.pause());
ipcMain.on(IPC.RESUME_WALLPAPER, () => wallpaperManager.resume());

ipcMain.on(IPC.SET_VOLUME, (_event, volume) => {
  wallpaperManager.send(IPC.SET_VOLUME, volume);
});

ipcMain.on(IPC.SET_SPEED, (_event, speed) => {
  wallpaperManager.send(IPC.SET_SPEED, speed);
});

ipcMain.on(IPC.FIT_WINDOW, () => {
  fitSettingsWindow();
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

  setupFullscreenPause();

  screen.on('display-metrics-changed', handleDisplayMetricsChanged);
  screen.on('display-added', broadcastMonitors);
  screen.on('display-removed', handleDisplayRemoved);

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
