const POLL_INTERVAL_MS = 2000;
let intervalId = null;

let lib = null;
let EnumWindowsProcType = null;
let EnumWindows = null;
let IsWindowVisible = null;
let GetWindowLongW = null;
let proc = null;
let koffiRef = null;
let hasFullscreenWindow = false;
const GWL_STYLE = -16;
const WS_CAPTION = 0x00C00000;
const WS_MAXIMIZE = 0x01000000;

function onEnumWindows(hwnd, _lParam) {
  if (!IsWindowVisible(hwnd)) return true;
  const style = GetWindowLongW(hwnd, GWL_STYLE);
  const hasCaption = !!(style & WS_CAPTION);
  const isMaximized = !!(style & WS_MAXIMIZE);
  if (!hasCaption && isMaximized) {
    hasFullscreenWindow = true;
    return false;
  }
  return true;
}

function initLibrary() {
  if (lib) return;
  koffiRef = require('koffi');
  lib = koffiRef.load('user32.dll');
  EnumWindowsProcType = koffiRef.proto('bool __stdcall EnumWindowsProc(void* hwnd, int lParam)');
  EnumWindows = lib.func('__stdcall', 'EnumWindows', 'bool', [koffiRef.pointer(EnumWindowsProcType), 'int']);
  IsWindowVisible = lib.func('bool IsWindowVisible(void*)');
  GetWindowLongW = lib.func('int GetWindowLongW(void*, int)');
  proc = koffiRef.register(onEnumWindows, koffiRef.pointer(EnumWindowsProcType));
}

function isAnyWindowFullscreen() {
  try {
    initLibrary();
    hasFullscreenWindow = false;
    EnumWindows(proc, 0);
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