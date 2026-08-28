const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const FindWindowW = user32.func('void* FindWindowW(const char16_t* name, const char16_t* title)');
const SendMessageW = user32.func('void* SendMessageW(uint64_t hwnd, int msg, int wParam, int lParam)');
const FindWindowExW = user32.func('void* FindWindowExW(uint64_t parent, uint64_t childAfter, const char16_t* cls, const char16_t* title)');
const SetParent = user32.func('void* SetParent(uint64_t child, uint64_t parent)');
const GetAncestor = user32.func('void* GetAncestor(uint64_t hwnd, int flags)');
const IsWindow = user32.func('bool IsWindow(uint64_t hwnd)');
const GetWindowLongPtrW = user32.func('intptr_t GetWindowLongPtrW(uint64_t hwnd, int index)');
const SetWindowLongPtrW = user32.func('intptr_t SetWindowLongPtrW(uint64_t hwnd, int index, intptr_t value)');
const SetWindowPos = user32.func('void* SetWindowPos(uint64_t hwnd, uint64_t insertAfter, int x, int y, int cx, int cy, uint32_t flags)');

const GWL_STYLE = -16;
const WS_CHILD = 0x40000000;
const GA_PARENT = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;

let layout = null;

function handleValue(value) {
  if (!value) return 0;
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value);
  return koffi.address(value);
}

function findDesktopWorkerW() {
  let w = 0;
  let prev = 0;
  while (true) {
    w = handleValue(FindWindowExW(0, prev, 'WorkerW', null));
    if (!w) break;
    prev = w;
  }
  return prev;
}

function getWorkerW() {
  const current = getLayout();
  return current.parent;
}

function getLayout() {
  if (layout) return layout;

  const progman = handleValue(FindWindowW('Progman', null));
  if (!progman) throw new Error('Progman window not found');

  // Send 0x052C to wake up the desktop layer behind the icons
  SendMessageW(progman, 0x052C, 0, 0);

  // Layout 1: icons hosted directly under Progman -> parent to Progman
  const defView = handleValue(FindWindowExW(progman, 0, 'SHELLDLL_DefView', null));
  if (defView) {
    layout = { parent: progman, insertAfter: defView };
    return layout;
  }

  // Layout 2: icons hosted inside a WorkerW that sits under Progman
  let prev = 0;
  while (true) {
    const w = handleValue(FindWindowExW(0, prev, 'WorkerW', null));
    if (!w) break;
    if (handleValue(FindWindowExW(w, 0, 'SHELLDLL_DefView', null))) {
      layout = { parent: progman, insertAfter: w };
      return layout;
    }
    prev = w;
  }

  // Fallback: use the last WorkerW in the chain
  const lastW = findDesktopWorkerW();
  if (!lastW) throw new Error('WorkerW window not found');
  layout = { parent: lastW, insertAfter: lastW };
  return layout;
}

function setParentToWorkerW(childHandle) {
  const { parent, insertAfter } = getLayout();

  // The wallpaper window is top-level; turn it into a child before re-parenting
  const style = handleValue(GetWindowLongPtrW(childHandle, GWL_STYLE));
  SetWindowLongPtrW(childHandle, GWL_STYLE, style | WS_CHILD);

  const result = handleValue(SetParent(childHandle, parent));

  // Position the wallpaper just below the icons layer (above the static wallpaper surface)
  SetWindowPos(childHandle, insertAfter, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  return result;
}

function isParented(childHandle) {
  try {
    if (!layout) return false;
    if (!IsWindow(layout.parent)) return false;
    const parent = handleValue(GetAncestor(childHandle, GA_PARENT));
    return parent === layout.parent;
  } catch {
    return false;
  }
}

function ensureParentedToWorkerW(childHandle) {
  if (isParented(childHandle)) return true;
  resetWorkerW();
  setParentToWorkerW(childHandle);
  return true;
}

function resetWorkerW() {
  layout = null;
}

module.exports = { getWorkerW, setParentToWorkerW, isParented, ensureParentedToWorkerW, resetWorkerW };