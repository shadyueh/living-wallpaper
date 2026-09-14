const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');
const gdi32 = koffi.load('gdi32.dll');

const FindWindowW = user32.func('void* FindWindowW(const char16_t* name, const char16_t* title)');
const SendMessageW = user32.func('void* SendMessageW(uint64_t hwnd, int msg, int wParam, int lParam)');
const FindWindowExW = user32.func('void* FindWindowExW(uint64_t parent, uint64_t childAfter, const char16_t* cls, const char16_t* title)');
const SetParent = user32.func('void* SetParent(uint64_t child, uint64_t parent)');
const GetAncestor = user32.func('void* GetAncestor(uint64_t hwnd, int flags)');
const IsWindow = user32.func('bool IsWindow(uint64_t hwnd)');
const GetWindowLongPtrW = user32.func('intptr_t GetWindowLongPtrW(uint64_t hwnd, int index)');
const SetWindowLongPtrW = user32.func('intptr_t SetWindowLongPtrW(uint64_t hwnd, int index, intptr_t value)');
const SetWindowPos = user32.func('void* SetWindowPos(uint64_t hwnd, uint64_t insertAfter, int x, int y, int cx, int cy, uint32_t flags)');
const SetLayeredWindowAttributes = user32.func('bool SetLayeredWindowAttributes(uint64_t hwnd, int color, int alpha, int flags)');
const GetWindowRect = user32.func('bool GetWindowRect(uint64_t hwnd, int* rect)');
const MapWindowPoints = user32.func('int MapWindowPoints(uint64_t from, uint64_t to, int* points, int count)');
koffi.struct('POINT', { x: 'int32_t', y: 'int32_t' });
const MonitorFromPoint = user32.func('void* MonitorFromPoint(POINT point, uint32_t flags)');
const GetMonitorInfoW = user32.func('bool GetMonitorInfoW(uint64_t monitor, void* info)');
const DwmSetWindowAttribute = dwmapi.func('int DwmSetWindowAttribute(uint64_t hwnd, uint32_t attribute, const void* data, uint32_t size)');
const CreateRectRgn = gdi32.func('void* CreateRectRgn(int left, int top, int right, int bottom)');
const SetWindowRgn = user32.func('int SetWindowRgn(uint64_t hwnd, uint64_t region, int redraw)');

const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_EX_LAYERED = 0x00080000;
const WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
const LWA_ALPHA = 0x00000002;
const GA_PARENT = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const MONITOR_DEFAULTTONEAREST = 0x00000002;
const WM_SPAWN_WORKERW = 0x052C;
const PROGMAN_CLASS = 'Progman';
const DESKTOP_VIEW_CLASS = 'SHELLDLL_DefView';
const WORKERW_CLASS = 'WorkerW';
const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWCP_DONOTROUND = 1;

let layout = null;

function handleValue(value) {
  if (!value) return 0;
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value);
  return koffi.address(value);
}

function* workerWindows() {
  let prev = 0;
  while (true) {
    const w = handleValue(FindWindowExW(0, prev, WORKERW_CLASS, null));
    if (!w) break;
    yield w;
    prev = w;
  }
}

function findWorkerWWithDefView() {
  for (const w of workerWindows()) {
    if (handleValue(FindWindowExW(w, 0, DESKTOP_VIEW_CLASS, null))) return w;
  }
  return 0;
}

function findLastWorkerW() {
  let last = 0;
  for (const w of workerWindows()) last = w;
  return last;
}

function getLayout() {
  if (layout) return layout;

  const progman = handleValue(FindWindowW(PROGMAN_CLASS, null));
  if (!progman) throw new Error('Progman window not found');

  // Send WM_SPAWN_WORKERW to wake up the desktop layer behind the icons
  SendMessageW(progman, WM_SPAWN_WORKERW, 0, 0);

  // Layout 1: icons hosted directly under Progman -> parent to Progman
  const defView = handleValue(FindWindowExW(progman, 0, DESKTOP_VIEW_CLASS, null));
  if (defView) {
    layout = { parent: progman, insertAfter: defView };
    return layout;
  }

  // Layout 2: icons hosted inside a WorkerW that sits under Progman
  const iconsWorkerW = findWorkerWWithDefView();
  if (iconsWorkerW) {
    layout = { parent: progman, insertAfter: iconsWorkerW };
    return layout;
  }

  // Fallback: use the last WorkerW in the chain
  const lastW = findLastWorkerW();
  if (!lastW) throw new Error('WorkerW window not found');
  layout = { parent: lastW, insertAfter: lastW };
  return layout;
}

function attachToDesktopLayer(childHandle) {
  const { parent, insertAfter } = getLayout();

  // The wallpaper window is top-level; turn it into a child before re-parenting
  const style = handleValue(GetWindowLongPtrW(childHandle, GWL_STYLE));
  SetWindowLongPtrW(childHandle, GWL_STYLE, style | WS_CHILD);

  SetParent(childHandle, parent);

  // Position the wallpaper just below the icons layer (above the static wallpaper surface)
  SetWindowPos(childHandle, insertAfter, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
}

function isAttachedToDesktop(childHandle) {
  try {
    const { parent } = getLayout();
    if (!IsWindow(parent)) return false;
    return handleValue(GetAncestor(childHandle, GA_PARENT)) === parent;
  } catch {
    return false;
  }
}

function ensureAttachedToDesktop(childHandle) {
  if (isAttachedToDesktop(childHandle)) return;
  resetLayerCache();
  attachToDesktopLayer(childHandle);
}

function resetLayerCache() {
  layout = null;
}

function isRaisedDesktop(progman) {
  return (Number(GetWindowLongPtrW(progman, GWL_EXSTYLE)) & WS_EX_NOREDIRECTIONBITMAP) !== 0;
}

// Returns the window the wallpaper must be parented to in order to render
// behind the desktop icons.
//
// Windows 11 24H2+ ("raised desktop"): SHELLDLL_DefView is a layered child of
// Progman that draws just the icons, and the wallpaper renders into a child
// WorkerW of Progman z-ordered below the icons layer. This is the user's build
// (26200), so the child WorkerW is the primary target.
//
// Classic (Windows 10 / older Windows 11): SHELLDLL_DefView lives inside a
// top-level WorkerW and the wallpaper layer is the empty top-level WorkerW
// that follows the icons one.
function findWallpaperWorkerW() {
  const progman = handleValue(FindWindowW(PROGMAN_CLASS, null));
  if (!progman) return 0;

  // Ask Progman to spawn the wallpaper WorkerW behind the icons if it is not
  // there yet (it is already present on repeated calls).
  SendMessageW(progman, WM_SPAWN_WORKERW, 0, 0);

  if (isRaisedDesktop(progman)) {
    return handleValue(FindWindowExW(progman, 0, WORKERW_CLASS, null));
  }

  for (const w of workerWindows()) {
    if (!handleValue(FindWindowExW(w, 0, DESKTOP_VIEW_CLASS, null))) return w;
  }
  return 0;
}

// The wallpaper BrowserWindow is created on the target display in DIP coords;
// Electron already translated those to physical pixels per-monitor when it
// positioned the window. Reading its real OS rect gives the exact physical
// geometry of that display, so attaching to a layer is correct for any DPI
// scale and any per-monitor resolution (including mixed-DPI setups, where the
// DIP virtual grid does not map linearly to physical pixels).
function windowPhysicalRect(childHandle) {
  const rect = new Int32Array(4);
  GetWindowRect(childHandle, rect);
  if (rect[2] > rect[0] && rect[3] > rect[1]) {
    return { left: rect[0], top: rect[1], width: rect[2] - rect[0], height: rect[3] - rect[1] };
  }
  return null;
}

// Fallback physical geometry: ask Win32 for the monitor covering the display's
// estimated center and read its rcMonitor rect (physical pixels). Only used
// when the freshly created window does not report a rect yet.
function monitorPhysicalRect(display) {
  const scale = (display && display.scaleFactor) || 1;
  const bounds = (display && display.bounds) || { x: 0, y: 0, width: 0, height: 0 };
  const center = new Int32Array([
    Math.round((bounds.x || 0) * scale + ((bounds.width || 0) * scale) / 2),
    Math.round((bounds.y || 0) * scale + ((bounds.height || 0) * scale) / 2),
  ]);
  const hMonitor = handleValue(MonitorFromPoint({ x: center[0], y: center[1] }, MONITOR_DEFAULTTONEAREST));
  const info = new Int32Array(10);
  info[0] = 40; // sizeof(MONITORINFO): DWORD + 2*RECT + DWORD
  if (hMonitor && GetMonitorInfoW(hMonitor, info)) {
    const left = info[1];
    const top = info[2];
    const right = info[3];
    const bottom = info[4];
    if (right > left && bottom > top) {
      return { left, top, width: right - left, height: bottom - top };
    }
  }
  return {
    left: Math.round((bounds.x || 0) * scale),
    top: Math.round((bounds.y || 0) * scale),
    width: Math.round((bounds.width || 0) * scale),
    height: Math.round((bounds.height || 0) * scale),
  };
}

// Makes the Electron window render as the desktop wallpaper, behind the icons
// and above the static wallpaper, by re-parenting it into the desktop layer.
// DWM only composites a surface behind the desktop icons when the window is
// layered and opaque, so we enable WS_EX_LAYERED and set full opacity before
// making it a child window and nesting it (SetParent) into the wallpaper layer.
//
// `display` supplies the target bounds and scale factor. The native coordinates
// involved (SetWindowPos, MapWindowPoints) are in physical pixels.
//
// The caller must invoke this only once the window has settled on its target
// display (see wallpaper-manager: it attaches on did-finish-load). At that point
// the window's OS rect is the final physical geometry of the display it was
// created on (Electron already translated the DIP bounds per-monitor), so the
// window is sized and positioned from that settled rect, covering the full
// screen regardless of the monitor's aspect. The fallback probes the monitor
// covering the DIP-bounds center only when the window reports no rect yet
// (see windowPhysicalRect / monitorPhysicalRect).
function attachWallpaperWindow(childHandle, display) {
  const parent = findWallpaperWorkerW();
  if (!parent) return false;

  const phys = windowPhysicalRect(childHandle) || monitorPhysicalRect(display);
  if (process.env.LW_DEBUG_GEOMETRY === '1') {
    console.log('[LW_DEBUG] attach physical rect', phys);
  }
  const left = phys.left;
  const top = phys.top;
  const width = phys.width;
  const height = phys.height;

  // Read the layer's covering rectangle (physical pixels of the whole virtual
  // desktop) as the reference geometry — this is what "extend to all displays"
  // will size the window to in the multi-monitor feature.
  const layerRect = new Int32Array(4);
  GetWindowRect(parent, layerRect);

  const exStyle = Number(GetWindowLongPtrW(childHandle, GWL_EXSTYLE));
  if (!(exStyle & WS_EX_LAYERED)) {
    SetWindowLongPtrW(childHandle, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);
  }
  SetLayeredWindowAttributes(childHandle, 0, 255, LWA_ALPHA);

  // Turn the top-level window into a child so SetParent nests it into the
  // desktop layer. Coordinates become relative to the new parent afterwards.
  const style = Number(GetWindowLongPtrW(childHandle, GWL_STYLE));
  SetWindowLongPtrW(childHandle, GWL_STYLE, (style & ~WS_POPUP) | WS_CHILD);

  SetParent(childHandle, parent);

  // Translate the requested screen origin into the layer's coordinate space so
  // the window lands on the correct monitor (matters once we size per display).
  const origin = new Int32Array([left, top]);
  MapWindowPoints(0, parent, origin, 1);

  SetWindowPos(childHandle, 0, origin[0], origin[1], width, height, SWP_NOACTIVATE);

  clipToRectangle(childHandle, width, height);

  return true;
}

function disableRoundedCorners(childHandle) {
  if (!childHandle) return;
  const preference = new Int32Array([DWMWCP_DONOTROUND]);
  DwmSetWindowAttribute(childHandle, DWMWA_WINDOW_CORNER_PREFERENCE, preference, 4);
}

function clipToRectangle(childHandle, width, height) {
  if (!childHandle || width <= 0 || height <= 0) return;
  const region = handleValue(CreateRectRgn(0, 0, width, height));
  if (!region) {
    console.warn('Failed to create a rectangular region for the wallpaper window');
    return;
  }
  if (!SetWindowRgn(childHandle, region, 1)) {
    console.warn('Failed to clip the wallpaper window to a rectangular region');
  }
}

module.exports = {
  getLayout,
  attachToDesktopLayer,
  isAttachedToDesktop,
  ensureAttachedToDesktop,
  resetLayerCache,
  disableRoundedCorners,
  findWallpaperWorkerW,
  attachWallpaperWindow,
  monitorPhysicalRect,
};