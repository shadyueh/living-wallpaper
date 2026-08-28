const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const FindWindowW = user32.func('void* FindWindowW(const char16_t* name, const char16_t* title)');
const SendMessageW = user32.func('void* SendMessageW(uint64_t hwnd, int msg, int wParam, int lParam)');
const FindWindowExW = user32.func('void* FindWindowExW(uint64_t parent, uint64_t childAfter, const char16_t* cls, const char16_t* title)');
const SetParent = user32.func('void* SetParent(uint64_t child, uint64_t parent)');
const GetAncestor = user32.func('void* GetAncestor(uint64_t hwnd, int flags)');
const IsWindow = user32.func('bool IsWindow(uint64_t hwnd)');
const GetWindowLongPtrW = user32.func('intptr_t GetWindowLongPtrW(uint64_t hwnd, int index)');
const SetWindowLongPtrW = user32.func('intptr_t SetWindowLongPtrW(uint64_t hwnd, int index, intptr_t value)');
const SetWindowPos = user32.func('void* SetWindowPos(uint64_t hwnd, uint64_t insertAfter, int x, int y, int cx, int cy, uint32_t flags)');
const DwmSetWindowAttribute = dwmapi.func('int DwmSetWindowAttribute(uint64_t hwnd, uint32_t attribute, const void* data, uint32_t size)');

const GWL_STYLE = -16;
const WS_CHILD = 0x40000000;
const GA_PARENT = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
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

function disableRoundedCorners(childHandle) {
  if (!childHandle) return;
  const preference = new Int32Array([DWMWCP_DONOTROUND]);
  DwmSetWindowAttribute(childHandle, DWMWA_WINDOW_CORNER_PREFERENCE, preference, 4);
}

module.exports = {
  getLayout,
  attachToDesktopLayer,
  isAttachedToDesktop,
  ensureAttachedToDesktop,
  resetLayerCache,
  disableRoundedCorners,
};