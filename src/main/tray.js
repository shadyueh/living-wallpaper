const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const config = require('./config');
const wallpaperManager = require('./wallpaper-manager');
const { WALLPAPER_STATUS } = require('../shared/constants');

let tray = null;
let showSettings = () => {};
let icons = { normal: null, paused: null };

function loadIcon(fileName) {
  const iconPath = path.join(__dirname, '..', '..', 'assets', fileName);
  try {
    return nativeImage.createFromPath(iconPath);
  } catch {
    return nativeImage.createEmpty();
  }
}

function create(options = {}) {
  showSettings = options.showSettings || (() => {});
  icons = {
    normal: loadIcon('icon.ico'),
    paused: loadIcon('icon-pause.ico'),
  };

  tray = new Tray(icons.normal);
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
  const name = wallpaper ? path.basename(wallpaper, path.extname(wallpaper)) : 'No wallpaper';
  const hotkey = config.get('hotkey') || '';

  const statusText = isPaused ? 'Paused (fullscreen)' : 'Playing';
  tray.setToolTip(`${name} — ${statusText}`);
  tray.setImage(isPaused ? (icons.paused || icons.normal) : icons.normal);

  const template = [
    {
      label: name,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `${isPaused ? '▶ Resume' : '⏸ Pause'}${hotkey ? ` (${hotkey})` : ''}`,
      click: () => {
        wallpaperManager.toggle();
        updateMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Settings...',
      click: () => showSettings(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
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
