jest.mock('koffi', () => {
  const handlers = {
    FindWindowW: jest.fn(() => 0),
    SendMessageW: jest.fn(() => 0),
    FindWindowExW: jest.fn(() => 0),
    SetParent: jest.fn(() => 0),
  };
  const lib = {
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

let desktop;

beforeEach(() => {
  jest.resetModules();
  desktop = require('../../src/main/desktop/windows');
});

describe('windows desktop integration (error cases)', () => {
  test('getLayout throws when Progman not found', () => {
    expect(() => desktop.getLayout()).toThrow('Progman window not found');
  });

  test('resetLayerCache clears cached handles', () => {
    desktop.resetLayerCache();
  });
});