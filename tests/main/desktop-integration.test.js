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
    desktop.resetLayerCache();
  });

  test('getLayout uses Progman when it hosts the icons directly', () => {
    expect(desktop.getLayout()).toEqual({ parent: 100, insertAfter: 500 });
  });

  test('getLayout uses Progman and the icons WorkerW in the classic layout', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 500;
    state.workers = [200];
    expect(desktop.getLayout()).toEqual({ parent: 100, insertAfter: 200 });
  });

  test('attachToDesktopLayer attaches below the icons layer', () => {
    desktop.getLayout();
    const result = desktop.attachToDesktopLayer(300);
    expect(result).toBe(150);
    expect(handlers.SetWindowLongPtrW).toHaveBeenCalled();
    expect(handlers.SetWindowPos).toHaveBeenCalledWith(300, 500, 0, 0, 0, 0, 19);
  });

  test('attachToDesktopLayer uses the icons WorkerW as insertion target in the classic layout', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 500;
    state.workers = [200];
    desktop.getLayout();
    desktop.attachToDesktopLayer(300);
    expect(handlers.SetParent).toHaveBeenCalledWith(300, 100);
    expect(handlers.SetWindowPos).toHaveBeenCalledWith(300, 200, 0, 0, 0, 0, 19);
  });

  test('isAttachedToDesktop returns true when parent matches a live layer', () => {
    desktop.getLayout();
    expect(desktop.isAttachedToDesktop(300)).toBe(true);
  });

  test('isAttachedToDesktop returns false when the layer is gone', () => {
    desktop.getLayout();
    state.isWindowValue = 0;
    expect(desktop.isAttachedToDesktop(300)).toBe(false);
  });

  test('ensureAttachedToDesktop re-injects when parenting is stale', () => {
    desktop.getLayout();
    state.isWindowValue = 0;

    desktop.ensureAttachedToDesktop(300);

    expect(handlers.SetParent).toHaveBeenCalled();
  });

  test('ensureAttachedToDesktop is a no-op when already attached', () => {
    desktop.getLayout();
    desktop.ensureAttachedToDesktop(300);
    expect(handlers.SetParent).not.toHaveBeenCalled();
  });
});