jest.mock('electron', () => ({
  globalShortcut: {
    register: jest.fn(),
    unregisterAll: jest.fn(),
  },
}));

jest.mock('../../src/main/config', () => ({
  get: jest.fn((key) => (key === 'hotkey' ? 'Ctrl+Shift+W' : undefined)),
}));

jest.mock('../../src/main/wallpaper-manager', () => ({
  toggle: jest.fn(),
}));

const { globalShortcut } = require('electron');
const config = require('../../src/main/config');
const wallpaperManager = require('../../src/main/wallpaper-manager');
const hotkeys = require('../../src/main/hotkeys');

describe('hotkeys', () => {
  let trigger;

  beforeEach(() => {
    jest.clearAllMocks();
    trigger = jest.fn();
    globalShortcut.register.mockImplementation((_accel, cb) => {
      trigger = cb;
      return true;
    });
  });

  test('register registers the configured accelerator', () => {
    hotkeys.register();
    expect(config.get).toHaveBeenCalledWith('hotkey');
    expect(globalShortcut.register).toHaveBeenCalledWith('Ctrl+Shift+W', expect.any(Function));
  });

  test('pressing the hotkey toggles the wallpaper', () => {
    hotkeys.register();
    trigger();
    expect(wallpaperManager.toggle).toHaveBeenCalled();
  });

  test('warns when the accelerator cannot be registered', () => {
    const spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    globalShortcut.register.mockReturnValue(false);
    hotkeys.register();
    expect(spyWarn).toHaveBeenCalledWith('Failed to register global shortcut:', 'Ctrl+Shift+W');
    spyWarn.mockRestore();
  });

  test('unregister clears all global shortcuts', () => {
    hotkeys.unregister();
    expect(globalShortcut.unregisterAll).toHaveBeenCalled();
  });
});