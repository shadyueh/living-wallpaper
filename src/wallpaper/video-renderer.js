const { ipcRenderer } = require('electron');

const video = document.getElementById('wallpaper');
let currentPath = null;

function sendStatus(status, error = null) {
  ipcRenderer.send('lw:wallpaper-status', { status, error });
}

video.addEventListener('play', () => sendStatus('playing'));
video.addEventListener('pause', () => sendStatus('paused'));
video.addEventListener('error', () => {
  const msg = video.error ? video.error.message : 'Unknown error';
  sendStatus('error', msg);
});

video.addEventListener('ended', () => {
  video.currentTime = 0;
  video.play().catch(() => {});
});

ipcRenderer.on('lw:set-wallpaper', (_event, wallpaper) => {
  if (wallpaper.type !== 'video') return;

  if (currentPath === wallpaper.path) return;
  currentPath = wallpaper.path;

  video.src = wallpaper.path;
  video.volume = wallpaper.volume || 0;
  video.muted = wallpaper.volume === 0;
  video.playbackRate = wallpaper.speed || 1;

  video.play().catch((err) => {
    sendStatus('error', err.message);
  });
});

ipcRenderer.on('lw:pause-wallpaper', () => {
  video.pause();
});

ipcRenderer.on('lw:resume-wallpaper', () => {
  video.play().catch(() => {});
});

ipcRenderer.on('lw:set-volume', (_event, volume) => {
  video.volume = volume;
  video.muted = volume === 0;
});

ipcRenderer.on('lw:set-speed', (_event, speed) => {
  video.playbackRate = speed;
});
