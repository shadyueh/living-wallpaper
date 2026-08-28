jest.mock('koffi', () => {
  const handlers = {
    FindWindowW: jest.fn(() => 100),
    SendMessageW: jest.fn(() => 0),
    FindWindowExW: jest.fn().mockReturnValueOnce(200).mockReturnValue(0),
    SetParent: jest.fn(() => 150),
    GetParent: jest.fn(() => 200),
    IsWindow: jest.fn(() => 1),
  };
  const lib = {
    handlers,
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

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = require('koffi').load().handlers;
    handlers.FindWindowExW.mockReset().mockReturnValueOnce(200).mockReturnValue(0);
    handlers.IsWindow.mockReturnValue(1);
  });

  test('getWorkerW finds Progman and creates WorkerW', () => {
    const workerW = desktop.getWorkerW();
    expect(workerW).toBe(200);
  });

  test('setParentToWorkerW calls SetParent', () => {
    const result = desktop.setParentToWorkerW(300);
    expect(result).toBe(150);
  });

  test('isParented returns true when parent matches a live WorkerW', () => {
    desktop.getWorkerW();
    expect(desktop.isParented(300)).toBe(true);
  });

  test('isParented returns false when WorkerW is gone', () => {
    desktop.getWorkerW();
    handlers.IsWindow.mockReturnValue(0);
    expect(desktop.isParented(300)).toBe(false);
  });

  test('ensureParentedToWorkerW re-injects when parenting is stale', () => {
    desktop.getWorkerW();
    handlers.IsWindow.mockReturnValue(0);
    handlers.FindWindowExW.mockReset().mockReturnValueOnce(200).mockReturnValue(0);

    desktop.ensureParentedToWorkerW(300);

    expect(handlers.SetParent).toHaveBeenCalled();
  });

  test('ensureParentedToWorkerW is a no-op when already parented', () => {
    desktop.getWorkerW();
    desktop.ensureParentedToWorkerW(300);
    expect(handlers.SetParent).not.toHaveBeenCalled();
  });
});