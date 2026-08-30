const IPC = {
  SET_WALLPAPER: 'lw:set-wallpaper',
  PAUSE_WALLPAPER: 'lw:pause-wallpaper',
  RESUME_WALLPAPER: 'lw:resume-wallpaper',
  WALLPAPER_STATUS: 'lw:wallpaper-status',
  WALLPAPER_ERROR: 'lw:wallpaper-error',
  GET_CONFIG: 'lw:get-config',
  SET_CONFIG: 'lw:set-config',
  CONFIG_RESPONSE: 'lw:config-response',
  SET_VOLUME: 'lw:set-volume',
  SET_SPEED: 'lw:set-speed',
  FIT_WINDOW: 'lw:fit-window',
  SHOW_UI: 'lw:show-ui',
  QUIT_APP: 'lw:quit-app',
};

const DEFAULT_CONFIG = {
  wallpaper: null,
  fps: 30,
  volume: 0,
  speed: 1,
  pauseOnFullscreen: true,
  pauseOnBattery: true,
  startMinimized: false,
  hotkey: 'Ctrl+Shift+W',
};

const WALLPAPER_STATUS = {
  PLAYING: 'playing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
};

module.exports = { IPC, DEFAULT_CONFIG, WALLPAPER_STATUS };
