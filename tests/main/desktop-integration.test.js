jest.mock('ffi-napi', () => {
  const handlers = {
    FindWindowW: jest.fn(() => 100),
    SendMessageW: jest.fn(() => 0),
    FindWindowExW: jest.fn()
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(0),
    SetParent: jest.fn(() => 150),
  };
  return {
    Library: jest.fn(() => handlers),
  };
});

const desktop = require('../../src/main/desktop/windows');

describe('windows desktop integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getWorkerW finds Progman and creates WorkerW', () => {
    const workerW = desktop.getWorkerW();
    expect(workerW).toBe(200);
  });

  test('setParentToWorkerW calls SetParent', () => {
    const result = desktop.setParentToWorkerW(300);
    expect(result).toBe(150);
  });
});
