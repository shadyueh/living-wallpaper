jest.mock('ffi-napi', () => ({
  Library: jest.fn(() => ({
    FindWindowW: jest.fn(() => 0),
    SendMessageW: jest.fn(() => 0),
    FindWindowExW: jest.fn(() => 0),
    SetParent: jest.fn(() => 0),
  })),
}));

let desktop;

beforeEach(() => {
  jest.resetModules();
  desktop = require('../../src/main/desktop/windows');
});

describe('windows desktop integration (error cases)', () => {
  test('getWorkerW throws when Progman not found', () => {
    expect(() => desktop.getWorkerW()).toThrow('Progman window not found');
  });

  test('resetWorkerW clears cached handle', () => {
    desktop.resetWorkerW();
  });
});
