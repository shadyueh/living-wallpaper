const POLL_INTERVAL_MS = 2000;
let intervalId = null;

let user32 = null;
let hasFullscreenWindow = false;
const GWL_STYLE = -16;
const WS_CAPTION = 0x00C00000;
const WS_MAXIMIZE = 0x01000000;

function initLibrary() {
  if (user32) return;
  const ffi = require('ffi-napi');
  user32 = ffi.Library('user32.dll', {
    'EnumWindows':        ['bool', ['pointer', 'int']],
    'IsWindowVisible':    ['bool', ['pointer']],
    'GetWindowLongW':     ['int', ['pointer', 'int']],
  });
}

function isAnyWindowFullscreen() {
  try {
    initLibrary();
    hasFullscreenWindow = false;

    const EnumWindowsProc = (global._lwEnumWindowsProc =
      global._lwEnumWindowsProc ||
      (function () {
        const ffi = require('ffi-napi');
        return ffi.Callback('bool', ['pointer', 'int'], (hwnd, _lParam) => {
          if (!user32.IsWindowVisible(hwnd)) return true;
          const style = user32.GetWindowLongW(hwnd, GWL_STYLE);
          const hasCaption = !!(style & WS_CAPTION);
          const isMaximized = !!(style & WS_MAXIMIZE);
          if (!hasCaption && isMaximized) {
            hasFullscreenWindow = true;
            return false;
          }
          return true;
        });
      })());

    user32.EnumWindows(EnumWindowsProc, 0);
    return hasFullscreenWindow;
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
