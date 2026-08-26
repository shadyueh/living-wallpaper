const { ipcRenderer } = require('electron');

ipcRenderer.send('lw:get-config');
ipcRenderer.once('lw:config-response', (_e, cfg) => {
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
  const file = e.dataTransfer.files[0];
  if (file && /\.(mp4|webm|ogg)$/i.test(file.name)) {
    setWallpaper(file.path);
  }
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
