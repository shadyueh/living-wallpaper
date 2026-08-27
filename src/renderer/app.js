const { ipcRenderer, webUtils } = require('electron');
const { IPC } = require('../shared/constants');

ipcRenderer.send(IPC.GET_CONFIG);
ipcRenderer.once(IPC.CONFIG_RESPONSE, (_e, cfg) => {
  document.getElementById('volume').value = cfg.volume || 0;
  document.getElementById('speed').value = cfg.speed || 1;
  document.getElementById('pauseOnFullscreen').checked = cfg.pauseOnFullscreen !== false;
  document.getElementById('pauseOnBattery').checked = cfg.pauseOnBattery !== false;
  if (cfg.wallpaper) {
    showWallpaper(cfg.wallpaper);
  }
});

const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  hideError();
  const file = e.dataTransfer.files[0];
  if (file && /\.(mp4|webm|ogg)$/i.test(file.name)) {
    const filePath = webUtils.getPathForFile(file);
    setWallpaper(filePath);
  }
});

ipcRenderer.on(IPC.WALLPAPER_ERROR, (_e, error) => {
  showError(error);
});

function setWallpaper(filePath) {
  ipcRenderer.send('lw:set-wallpaper', {
    type: 'video',
    path: filePath,
  });
  showWallpaper(filePath);
}

function showWallpaper(filePath) {
  const name = filePath.split(/[\\/]/).pop();
  document.getElementById('currentWallpaper').style.display = 'block';
  document.getElementById('wallpaperName').textContent = name;
}

function showError(message) {
  const errorEl = document.getElementById('wallpaperError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
  document.getElementById('currentWallpaper').style.display = 'none';
}

function hideError() {
  const errorEl = document.getElementById('wallpaperError');
  if (errorEl) {
    errorEl.style.display = 'none';
  }
}

document.getElementById('apply').addEventListener('click', () => {
  const cfg = {
    volume: Number(document.getElementById('volume').value),
    speed: Number(document.getElementById('speed').value),
    pauseOnFullscreen: document.getElementById('pauseOnFullscreen').checked,
    pauseOnBattery: document.getElementById('pauseOnBattery').checked,
  };
  ipcRenderer.send('lw:set-config', cfg);
  ipcRenderer.send('lw:set-volume', cfg.volume / 100);
  ipcRenderer.send('lw:set-speed', cfg.speed);
});
