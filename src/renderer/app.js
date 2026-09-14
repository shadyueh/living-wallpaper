const { ipcRenderer, webUtils } = require('electron');
const { IPC } = require('../shared/constants');

const volumeInput = document.getElementById('volume');
const speedInput = document.getElementById('speed');
const monitorSelect = document.getElementById('monitorSelect');
const pauseOnFullscreenInput = document.getElementById('pauseOnFullscreen');
const pauseOnBatteryInput = document.getElementById('pauseOnBattery');

function updateIndicators() {
  document.getElementById('volumeValue').textContent = `${volumeInput.value}%`;
  document.getElementById('speedValue').textContent = `${Number(speedInput.value).toFixed(1)}x`;
}

ipcRenderer.send(IPC.GET_CONFIG);
ipcRenderer.once(IPC.CONFIG_RESPONSE, (_e, cfg) => {
  volumeInput.value = cfg.volume || 0;
  speedInput.value = cfg.speed || 1;
  pauseOnFullscreenInput.checked = cfg.pauseOnFullscreen !== false;
  pauseOnBatteryInput.checked = cfg.pauseOnBattery !== false;
  updateIndicators();
  if (cfg.wallpaper) {
    showWallpaper(cfg.wallpaper);
  }
  ipcRenderer.send(IPC.GET_MONITORS);
});

ipcRenderer.on(IPC.MONITORS_RESPONSE, (_e, { monitors, selectedId }) => {
  monitorSelect.innerHTML = '';
  monitors.forEach((monitor, index) => {
    const option = document.createElement('option');
    option.value = String(monitor.id);
    const monitorLabel = `${monitor.bounds.width}\u00d7${monitor.bounds.height}`;
    option.textContent = `Monitor ${index + 1} \u2014 ${monitorLabel}${monitor.primary ? ' (Prim\u00e1ria)' : ''}`;
    monitorSelect.appendChild(option);
  });
  monitorSelect.value = String(selectedId);
  ipcRenderer.send(IPC.FIT_WINDOW);
});

monitorSelect.addEventListener('change', () => {
  ipcRenderer.send(IPC.SET_MONITOR_TARGET, Number(monitorSelect.value));
});

volumeInput.addEventListener('input', () => {
  updateIndicators();
  ipcRenderer.send(IPC.SET_VOLUME, Number(volumeInput.value) / 100);
});
volumeInput.addEventListener('change', () => {
  ipcRenderer.send(IPC.SET_CONFIG, { volume: Number(volumeInput.value) });
});

speedInput.addEventListener('input', () => {
  updateIndicators();
  ipcRenderer.send(IPC.SET_SPEED, Number(speedInput.value));
});
speedInput.addEventListener('change', () => {
  ipcRenderer.send(IPC.SET_CONFIG, { speed: Number(speedInput.value) });
});

pauseOnFullscreenInput.addEventListener('change', () => {
  ipcRenderer.send(IPC.SET_CONFIG, { pauseOnFullscreen: pauseOnFullscreenInput.checked });
});

pauseOnBatteryInput.addEventListener('change', () => {
  ipcRenderer.send(IPC.SET_CONFIG, { pauseOnBattery: pauseOnBatteryInput.checked });
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
  ipcRenderer.send(IPC.SET_WALLPAPER, {
    type: 'video',
    path: filePath,
  });
  showWallpaper(filePath);
}

function showWallpaper(filePath) {
  const name = filePath.split(/[\\/]/).pop();
  document.getElementById('currentWallpaper').style.display = 'block';
  document.getElementById('wallpaperName').textContent = name;
  ipcRenderer.send(IPC.FIT_WINDOW);
}

function showError(message) {
  const errorEl = document.getElementById('wallpaperError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
  document.getElementById('currentWallpaper').style.display = 'none';
  ipcRenderer.send(IPC.FIT_WINDOW);
}

function hideError() {
  const errorEl = document.getElementById('wallpaperError');
  if (errorEl) {
    errorEl.style.display = 'none';
  }
  ipcRenderer.send(IPC.FIT_WINDOW);
}
