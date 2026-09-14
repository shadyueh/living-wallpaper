const POLL_INTERVAL_MS = 2000;
const DEBUG = process.env.LW_DEBUG_FULLSCREEN === '1';

const MONITOR_DEFAULTTONEAREST = 2;
const MONITORINFO_SIZE = 40;

let intervalId = null;

let lib = null;
let EnumWindowsProcType = null;
let EnumWindows = null;
let IsWindowVisible = null;
let IsIconic = null;
let GetWindowRect = null;
let MonitorFromWindow = null;
let GetMonitorInfoW = null;
let GetForegroundWindow = null;
let GetClassNameW = null;
let GetWindowTextW = null;
let proc = null;
let koffiRef = null;

let visibleWindows = 0;
let fullscreenRects = [];
let prevFullscreenRects = [];
let nearMissLogged = 0;
const MAX_NEAR_MISS_LOGS = 5;

// A fullscreen window is one whose OS rect covers the whole monitor it sits on,
// within a 2px tolerance (the OS borders/presentation can trim a pixel or two).
function rectsCover(a, b) {
  return (
    Math.abs(a.left - b.left) <= 2
    && Math.abs(a.top - b.top) <= 2
    && Math.abs(a.right - b.right) <= 2
    && Math.abs(a.bottom - b.bottom) <= 2
  );
}

// True when the fullscreen monitor rect from the detector covers the physical
// rect of the display the wallpaper window is attached to. This is what gates
// pausing per monitor: a fullscreen app on another display must not pause this
// wallpaper. The detector reports rcMonitor as {left,top,right,bottom} while
// windows.monitorPhysicalRect returns {left,top,width,height}, so both shapes
// are normalised here.
function isRectCoveringDisplay(fullscreenRect, displayRect) {
  if (!fullscreenRect || !displayRect) return false;
  const a = {
    left: fullscreenRect.left,
    top: fullscreenRect.top,
    right: fullscreenRect.right ?? fullscreenRect.left + fullscreenRect.width,
    bottom: fullscreenRect.bottom ?? fullscreenRect.top + fullscreenRect.height,
  };
  const b = {
    left: displayRect.left,
    top: displayRect.top,
    right: displayRect.right ?? displayRect.left + displayRect.width,
    bottom: displayRect.bottom ?? displayRect.top + displayRect.height,
  };
  return rectsCover(a, b);
}

function onEnumWindows(hwnd, _lParam) {
  if (!IsWindowVisible(hwnd)) return true;
  visibleWindows += 1;
  if (IsIconic(hwnd)) return true;
  // Desktop layer windows (Progman/WorkerW), DPI ghost windows and other shells
  // can cover a monitor without ever being in the foreground. Requiring the
  // covering window to be the foreground one filters those phantom fullscreen
  // matches out while keeping per-monitor semantics intact.
  if (Number(GetForegroundWindow()) !== Number(hwnd)) return true;
  const rect = new Int32Array(4);
  if (!GetWindowRect(hwnd, rect)) return true;
  if (rect[2] <= rect[0] || rect[3] <= rect[1]) return true;
  const monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  const info = new Int32Array(10);
  info[0] = MONITORINFO_SIZE;
  if (!monitor || !GetMonitorInfoW(monitor, info)) return true;
  const rcMonitor = { left: info[1], top: info[2], right: info[3], bottom: info[4] };
  if (rcMonitor.right <= rcMonitor.left || rcMonitor.bottom <= rcMonitor.top) return true;
  const rcWindow = { left: rect[0], top: rect[1], right: rect[2], bottom: rect[3] };
  if (!rectsCover(rcWindow, rcMonitor)) {
    logNearMiss(hwnd, rect, rcMonitor);
    return true;
  }
  if (DEBUG) {
    console.log(
      `[LW_DEBUG_FULLSCREEN] match hwnd=${Number(hwnd)} class='${readWindowClassName(hwnd)}' title='${readWindowTitle(hwnd)}' rect=${rect.join(',')} rcMonitor=${rcMonitor.left},${rcMonitor.top},${rcMonitor.right},${rcMonitor.bottom}`
    );
  }
  fullscreenRects.push(rcMonitor);
  return true;
}

// Diagnostics: a window that almost covers a monitor (but misses the 2px
// coverage test) is usually the "maximized vs fullscreen" case (taskbar takes
// the bottom ~48px) or a DPI-virtualized fullscreen app reporting a smaller
// rect than the monitor's rcMonitor. Logging the actual numbers surfaces which
// of the two is happening on the wallpaper's own monitor.
function logNearMiss(hwnd, rect, rcMonitor) {
  if (!DEBUG) return;
  if (nearMissLogged >= MAX_NEAR_MISS_LOGS) return;
  const nearWidth = Math.abs(rect[2] - rect[0] - (rcMonitor.right - rcMonitor.left)) <= 400;
  const nearHeight = Math.abs(rect[3] - rect[1] - (rcMonitor.bottom - rcMonitor.top)) <= 400;
  if (!nearWidth || !nearHeight) return;
  nearMissLogged += 1;
  console.log(
    `[LW_DEBUG_FULLSCREEN] near hwnd=${Number(hwnd)} class='${readWindowClassName(hwnd)}' title='${readWindowTitle(hwnd)}' rect=${rect.join(',')} rcMonitor=${rcMonitor.left},${rcMonitor.top},${rcMonitor.right},${rcMonitor.bottom}`
  );
}

// Reads a window's class name for debug logs. Win32 writes a NUL-terminated
// UTF-16 string into the buffer we hand it; koffi decodes it back to JS.
function readWindowClassName(hwnd) {
  try {
    const buf = Buffer.allocUnsafe(512);
    const len = GetClassNameW(hwnd, buf, 256);
    return len > 0 ? buf.toString('utf16le', 0, len * 2) : '';
  } catch {
    return '';
  }
}

function readWindowTitle(hwnd) {
  try {
    const buf = Buffer.allocUnsafe(512);
    const len = GetWindowTextW(hwnd, buf, 256);
    return len > 0 ? buf.toString('utf16le', 0, len * 2) : '';
  } catch {
    return '';
  }
}

function initLibrary() {
  if (lib) return;
  koffiRef = require('koffi');
  lib = koffiRef.load('user32.dll');
  EnumWindowsProcType = koffiRef.proto('bool __stdcall EnumWindowsProc(void* hwnd, int lParam)');
  EnumWindows = lib.func('__stdcall', 'EnumWindows', 'bool', [koffiRef.pointer(EnumWindowsProcType), 'int']);
  IsWindowVisible = lib.func('bool IsWindowVisible(void*)');
  IsIconic = lib.func('bool IsIconic(void*)');
  GetWindowRect = lib.func('bool GetWindowRect(uint64_t, int*)');
  MonitorFromWindow = lib.func('void* MonitorFromWindow(uint64_t, uint32_t)');
  GetMonitorInfoW = lib.func('bool GetMonitorInfoW(uint64_t, void*)');
  GetForegroundWindow = lib.func('void* GetForegroundWindow()');
  GetClassNameW = lib.func('int GetClassNameW(uint64_t, char16_t*, int)');
  GetWindowTextW = lib.func('int GetWindowTextW(uint64_t, char16_t*, int)');
  proc = koffiRef.register(onEnumWindows, koffiRef.pointer(EnumWindowsProcType));
}

function dedupeRects(rects) {
  const byKey = new Map();
  rects.forEach((rect) => {
    const key = `${rect.left},${rect.top},${rect.right},${rect.bottom}`;
    if (!byKey.has(key)) byKey.set(key, rect);
  });
  return [...byKey.values()];
}

// Enumerates top-level windows and reports which monitors currently hold a
// fullscreen window. The result carries `added`/`removed` diffs (each rect is
// the monitor's physical rcMonitor) so callers can trigger pause/resume edges
// once per monitor transition, independent of how many windows share a monitor.
function detectFullscreen() {
  try {
    initLibrary();
    visibleWindows = 0;
    fullscreenRects = [];
    nearMissLogged = 0;
    EnumWindows(proc, 0);
    const current = dedupeRects(fullscreenRects);
    const added = current.filter((rect) => !prevFullscreenRects.some((prev) => rectsCover(prev, rect)));
    const removed = prevFullscreenRects.filter((prev) => !current.some((rect) => rectsCover(prev, rect)));
    prevFullscreenRects = current;
    if (DEBUG) {
      console.log(
        `[LW_DEBUG_FULLSCREEN] poll -> visible=${visibleWindows} matches=${current.length} fullscreen=${current.length === 0 ? 'false' : 'true'}`
      );
    }
    return { added, removed, fullscreen: current };
  } catch (error) {
    if (DEBUG) {
      console.log('[LW_DEBUG_FULLSCREEN] poll error:', error.message);
    }
    return { added: [], removed: [], fullscreen: [] };
  }
}

function isAnyWindowFullscreen() {
  return detectFullscreen().fullscreen.length > 0;
}

function start(callback) {
  if (intervalId) return;
  if (DEBUG) {
    console.log('[LW_DEBUG_FULLSCREEN] start');
  }
  intervalId = setInterval(() => {
    const result = detectFullscreen();
    callback(result);
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (intervalId) {
    if (DEBUG) {
      console.log('[LW_DEBUG_FULLSCREEN] stop');
    }
    clearInterval(intervalId);
    intervalId = null;
  }
  prevFullscreenRects = [];
}

module.exports = { start, stop, isAnyWindowFullscreen, isRectCoveringDisplay, detectFullscreen };