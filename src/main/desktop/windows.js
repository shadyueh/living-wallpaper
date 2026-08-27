const ffi = require('ffi-napi');

const user32 = ffi.Library('user32.dll', {
  'FindWindowW':       ['pointer', ['string', 'string']],
  'SendMessageW':      ['pointer', ['pointer', 'int', 'int', 'int']],
  'FindWindowExW':     ['pointer', ['pointer', 'pointer', 'string', 'string']],
  'SetParent':         ['pointer', ['pointer', 'pointer']],
  'GetParent':         ['pointer', ['pointer']],
  'IsWindow':          ['bool', ['pointer']],
});

let workerW = null;

function getWorkerW() {
  if (workerW) return workerW;

  const progman = user32.FindWindowW('Progman', null);
  if (!progman) throw new Error('Progman window not found');

  // Send 0x052C to create a WorkerW behind the desktop
  user32.SendMessageW(progman, 0x052C, 0, 0);

  // Find the new WorkerW (third WorkerW in the chain)
  let w = null;
  let prev = null;
  while (true) {
    w = user32.FindWindowExW(null, prev, 'WorkerW', null);
    if (!w) break;
    prev = w;
  }
  workerW = prev;
  if (!workerW) throw new Error('WorkerW window not found');
  return workerW;
}

function setParentToWorkerW(childHandle) {
  const parent = getWorkerW();
  return user32.SetParent(childHandle, parent);
}

function toPointerValue(value) {
  if (!value) return 0;
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value);
  if (Buffer.isBuffer(value) && typeof value.readBigUInt64LE === 'function') {
    try {
      return Number(value.readBigUInt64LE(0));
    } catch {
      return value.readUInt32LE(0);
    }
  }
  return Number(value);
}

function isParented(childHandle) {
  try {
    if (!workerW) return false;
    if (!user32.IsWindow(workerW)) return false;
    const parent = user32.GetParent(childHandle);
    return parent && toPointerValue(parent) === toPointerValue(workerW);
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
