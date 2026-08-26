const POLL_INTERVAL_MS = 2000;
let intervalId = null;

function isAnyWindowFullscreen() {
  try {
    const ffi = require('ffi-napi');
    const user32 = ffi.Library('user32.dll', {
      'EnumWindows':        ['bool', ['pointer', 'int']],
      'IsWindowVisible':    ['bool', ['int']],
      'GetWindowLongW':     ['int', ['int', 'int']],
    });

    let found = false;
    const GWL_STYLE = -16;
    const WS_CAPTION = 0x00C00000;
    const WS_MAXIMIZE = 0x01000000;

    const EnumWindowsProc = ffi.Callback('bool', ['int', 'int'], (hwnd) => {
      if (!user32.IsWindowVisible(hwnd)) return true;
      const style = user32.GetWindowLongW(hwnd, GWL_STYLE);
      const hasCaption = !!(style & WS_CAPTION);
      const isMaximized = !!(style & WS_MAXIMIZE);
      if (!hasCaption && isMaximized) {
        found = true;
        return false; // stop enumeration
      }
      return true;
    });

    user32.EnumWindows(EnumWindowsProc, 0);
    return found;
  } catch {
    return false;
  }
}

function start(callback) {
  if (intervalId) return;
  intervalId = setInterval(() => {
    const fullscreen = isAnyWindowFullscreen();
    callback(fullscreen);
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { start, stop, isAnyWindowFullscreen };
