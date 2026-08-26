// tests/main/config.test.js
jest.mock('electron-store', () => {
  const { DEFAULT_CONFIG } = require('../../src/shared/constants');
  return jest.fn().mockImplementation(({ defaults } = {}) => {
    const store = { ...defaults };
    return {
      get: (key) => store[key],
      set: (key, value) => { store[key] = value; },
      delete: (key) => { delete store[key]; },
      store,
    };
  });
});

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/lw-test') },
}));

const config = require('../../src/main/config');

describe('config', () => {
  beforeEach(() => config.reset());

  test('returns default values', () => {
    expect(config.get('fps')).toBe(30);
    expect(config.get('volume')).toBe(0);
  });

  test('sets and gets a value', () => {
    config.set('fps', 60);
    expect(config.get('fps')).toBe(60);
  });

  test('getAll returns full config', () => {
    const all = config.getAll();
    expect(all).toHaveProperty('fps');
    expect(all).toHaveProperty('volume');
    expect(all).toHaveProperty('pauseOnFullscreen');
  });

  test('reset restores defaults', () => {
    config.set('fps', 120);
    config.reset();
    expect(config.get('fps')).toBe(30);
  });
});
