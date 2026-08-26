const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const config = require('./config');
const wallpaperManager = require('./wallpaper-manager');
const { IPC, WALLPAPER_STATUS } = require('../shared/constants');

let tray = null;

function create() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Living Wallpaper');

  updateMenu();

  tray.on('click', () => {
    updateMenu();
    tray.popUpContextMenu();
  });

  return tray;
}

function updateMenu() {
  if (!tray) return;

  const isPaused = wallpaperManager.getStatus() === WALLPAPER_STATUS.PAUSED;
  const wallpaper = config.get('wallpaper');

  const template = [
    {
      label: wallpaper ? path.basename(wallpaper, path.extname(wallpaper)) : 'No wallpaper',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isPaused ? '▶ Resume' : '⏸ Pause',
      click: () => {
        if (isPaused) wallpaperManager.resume();
        else wallpaperManager.pause();
        updateMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Settings...',
      click: () => {
        const { BrowserWindow } = require('electron');
        const wins = BrowserWindow.getAllWindows();
        const uiWin = wins.find((w) => w.getTitle().includes('Living Wallpaper'));
        if (uiWin) {
          uiWin.show();
          uiWin.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        wallpaperManager.destroy();
        app.quit();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { create, updateMenu, destroy };
