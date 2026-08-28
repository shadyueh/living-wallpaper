const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const FindWindowW = user32.func('void* FindWindowW(const char16_t* name, const char16_t* title)');
const SendMessageW = user32.func('void* SendMessageW(uint64_t hwnd, int msg, int wParam, int lParam)');
const FindWindowExW = user32.func('void* FindWindowExW(uint64_t parent, uint64_t childAfter, const char16_t* cls, const char16_t* title)');
const SetParent = user32.func('void* SetParent(uint64_t child, uint64_t parent)');
const GetParent = user32.func('void* GetParent(uint64_t child)');
const IsWindow = user32.func('bool IsWindow(uint64_t hwnd)');

let workerW = null;

function handleValue(value) {
  if (!value) return 0;
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value);
  return koffi.address(value);
}

function getWorkerW() {
  if (workerW) return workerW;

  const progman = handleValue(FindWindowW('Progman', null));
  if (!progman) throw new Error('Progman window not found');

  // Send 0x052C to create a WorkerW behind the desktop
  SendMessageW(progman, 0x052C, 0, 0);

  // Find the new WorkerW (third WorkerW in the chain)
  let w = 0;
  let prev = 0;
  while (true) {
    w = handleValue(FindWindowExW(0, prev, 'WorkerW', null));
    if (!w) break;
    prev = w;
  }
  workerW = prev;
  if (!workerW) throw new Error('WorkerW window not found');
  return workerW;
}

function setParentToWorkerW(childHandle) {
  const parent = getWorkerW();
  return handleValue(SetParent(childHandle, parent));
}

function isParented(childHandle) {
  try {
    if (!workerW) return false;
    if (!IsWindow(workerW)) return false;
    const parent = handleValue(GetParent(childHandle));
    return parent === workerW;
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
  workerW = null;
}

module.exports = { getWorkerW, setParentToWorkerW, isParented, ensureParentedToWorkerW, resetWorkerW };