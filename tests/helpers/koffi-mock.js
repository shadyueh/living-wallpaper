// tests/helpers/koffi-mock.js
// Shared koffi mock for desktop-integration tests. Builds a user32.dll stub whose
// func() maps a signature back to a jest.fn handler by the leading function name.
function createKoffiMock(options = {}) {
  const state = {
    progman: options.progman ?? 100,
    defViewUnderProgman: options.defViewUnderProgman ?? 500,
    defViewInWorkerW: options.defViewInWorkerW ?? 0,
    workers: options.workers ?? [],
    isWindowValue: options.isWindowValue ?? 1,
    getParentValue: options.getParentValue ?? 100,
    setParentValue: options.setParentValue ?? 150,
  };

  const handlers = {
    FindWindowW: jest.fn(() => state.progman),
    SendMessageW: jest.fn(() => 0),
    FindWindowExW: jest.fn((parent, _childAfter, cls) => {
      if (cls === 'SHELLDLL_DefView') {
        if (parent === state.progman) return state.defViewUnderProgman;
        return state.defViewInWorkerW;
      }
      if (cls === 'WorkerW') {
        if (parent !== 0) return 0;
        return state.workers.length ? state.workers.shift() : 0;
      }
      return 0;
    }),
    SetParent: jest.fn(() => state.setParentValue),
    GetAncestor: jest.fn(() => state.getParentValue),
    IsWindow: jest.fn(() => state.isWindowValue),
    GetWindowLongPtrW: jest.fn(() => 0),
    SetWindowLongPtrW: jest.fn(() => 0),
    SetWindowPos: jest.fn(() => 1),
  };

  const nameOf = (signature) => Object.keys(handlers).find((name) => signature.includes(`${name}(`));

  const lib = {
    handlers,
    state,
    func: jest.fn((signature) => handlers[nameOf(signature)]),
  };

  return {
    load: jest.fn(() => lib),
    address: jest.fn((value) => (typeof value === 'number' ? value : Number(value))),
  };
}

module.exports = { createKoffiMock };