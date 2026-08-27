const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/constants');

const video = document.getElementById('wallpaper');
let currentPath = null;

function sendStatus(status, error = null) {
  ipcRenderer.send(IPC.WALLPAPER_STATUS, { status, error });
}

video.addEventListener('play', () => sendStatus('playing'));
video.addEventListener('pause', () => sendStatus('paused'));
video.addEventListener('error', () => {
  const msg = video.error ? video.error.message : 'Unknown error';
  sendStatus('error', msg);
});

video.addEventListener('ended', () => {
  video.currentTime = 0;
  video.play().catch((err) => {
    sendStatus('error', err.message);
  });
});

ipcRenderer.on(IPC.SET_WALLPAPER, (_event, wallpaper) => {
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

ipcRenderer.on(IPC.PAUSE_WALLPAPER, () => {
  video.pause();
});

ipcRenderer.on(IPC.RESUME_WALLPAPER, () => {
  video.play().catch((err) => {
    sendStatus('error', err.message);
  });
});

ipcRenderer.on(IPC.SET_VOLUME, (_event, volume) => {
  video.volume = volume;
  video.muted = volume === 0;
});

ipcRenderer.on(IPC.SET_SPEED, (_event, speed) => {
  video.playbackRate = speed;
});
