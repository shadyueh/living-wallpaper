jest.mock('koffi', () => {
  const state = {
    progman: 100,
    defViewUnderProgman: 500,
    defViewInWorkerW: 0,
    workers: [],
    isWindowValue: 1,
    getParentValue: 100,
    setParentValue: 150,
  };
  const FindWindowExW = jest.fn((parent, childAfter, cls) => {
    if (cls === 'SHELLDLL_DefView') {
      if (parent === state.progman) return state.defViewUnderProgman;
      return state.defViewInWorkerW;
    }
    if (cls === 'WorkerW') {
      if (parent !== 0) return 0;
      return state.workers.length ? state.workers.shift() : 0;
    }
    return 0;
  });
  const handlers = {
    FindWindowW: jest.fn(() => state.progman),
    SendMessageW: jest.fn(() => 0),
    FindWindowExW,
    SetParent: jest.fn(() => state.setParentValue),
    GetAncestor: jest.fn(() => state.getParentValue),
    IsWindow: jest.fn(() => state.isWindowValue),
    GetWindowLongPtrW: jest.fn(() => 0),
    SetWindowLongPtrW: jest.fn(() => 0),
    SetWindowPos: jest.fn(() => 1),
  };
  const lib = {
    handlers,
    state,
    func: jest.fn((signature) => {
      const name = signature.match(/[A-Za-z_]\w*(?=\s*\()/)[0];
      return handlers[name];
    }),
  };
  return {
    load: jest.fn(() => lib),
    address: jest.fn((value) => (typeof value === 'number' ? value : Number(value))),
  };
});

const desktop = require('../../src/main/desktop/windows');

describe('windows desktop integration', () => {
  let handlers;
  let state;

  beforeEach(() => {
    jest.clearAllMocks();
    const lib = require('koffi').load();
    handlers = lib.handlers;
    state = lib.state;
    state.defViewUnderProgman = 500;
    state.defViewInWorkerW = 0;
    state.workers = [];
    state.isWindowValue = 1;
    state.getParentValue = 100;
    state.setParentValue = 150;
    desktop.resetWorkerW();
  });

  test('getWorkerW uses Progman when it hosts the icons directly', () => {
    expect(desktop.getWorkerW()).toBe(100);
  });

  test('getWorkerW uses Progman and the icons WorkerW in the classic layout', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 500;
    state.workers = [200];
    expect(desktop.getWorkerW()).toBe(100);
  });

  test('setParentToWorkerW parents to the desktop layer below the icons', () => {
    desktop.getWorkerW();
    const result = desktop.setParentToWorkerW(300);
    expect(result).toBe(150);
    expect(handlers.SetWindowLongPtrW).toHaveBeenCalled();
    expect(handlers.SetWindowPos).toHaveBeenCalledWith(300, 500, 0, 0, 0, 0, 19);
  });

  test('setParentToWorkerW uses the icons WorkerW as insertion target in the classic layout', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 500;
    state.workers = [200];
    desktop.getWorkerW();
    desktop.setParentToWorkerW(300);
    expect(handlers.SetParent).toHaveBeenCalledWith(300, 100);
    expect(handlers.SetWindowPos).toHaveBeenCalledWith(300, 200, 0, 0, 0, 0, 19);
  });

  test('isParented returns true when parent matches a live layer', () => {
    desktop.getWorkerW();
    expect(desktop.isParented(300)).toBe(true);
  });

  test('isParented returns false when the layer is gone', () => {
    desktop.getWorkerW();
    state.isWindowValue = 0;
    expect(desktop.isParented(300)).toBe(false);
  });

  test('ensureParentedToWorkerW re-injects when parenting is stale', () => {
    desktop.getWorkerW();
    state.isWindowValue = 0;

    desktop.ensureParentedToWorkerW(300);

    expect(handlers.SetParent).toHaveBeenCalled();
  });

  test('ensureParentedToWorkerW is a no-op when already parented', () => {
    desktop.getWorkerW();
    desktop.ensureParentedToWorkerW(300);
    expect(handlers.SetParent).not.toHaveBeenCalled();
  });
});