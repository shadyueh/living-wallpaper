jest.mock('electron', () => ({
  globalShortcut: {
    register: jest.fn(),
    unregisterAll: jest.fn(),
  },
}));

jest.mock('../../src/main/config', () => ({
  get: jest.fn((key) => (key === 'hotkey' ? 'Ctrl+Shift+W' : undefined)),
}));

jest.mock('../../src/main/wallpaper-manager', () => {
  const { WALLPAPER_STATUS } = require('../../src/shared/constants');
  return {
    pause: jest.fn(),
    resume: jest.fn(),
    getStatus: jest.fn(() => WALLPAPER_STATUS.PLAYING),
  };
});

const { globalShortcut } = require('electron');
const config = require('../../src/main/config');
const wallpaperManager = require('../../src/main/wallpaper-manager');
const { WALLPAPER_STATUS } = require('../../src/shared/constants');
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

  test('pressing the hotkey pauses a playing wallpaper', () => {
    wallpaperManager.getStatus.mockReturnValue(WALLPAPER_STATUS.PLAYING);
    hotkeys.register();
    trigger();
    expect(wallpaperManager.pause).toHaveBeenCalled();
    expect(wallpaperManager.resume).not.toHaveBeenCalled();
  });

  test('pressing the hotkey resumes a paused wallpaper', () => {
    wallpaperManager.getStatus.mockReturnValue(WALLPAPER_STATUS.PAUSED);
    hotkeys.register();
    trigger();
    expect(wallpaperManager.resume).toHaveBeenCalled();
    expect(wallpaperManager.pause).not.toHaveBeenCalled();
  });

  test('pressing the hotkey is a no-op when wallpaper is stopped', () => {
    wallpaperManager.getStatus.mockReturnValue(WALLPAPER_STATUS.STOPPED);
    hotkeys.register();
    trigger();
    expect(wallpaperManager.pause).not.toHaveBeenCalled();
    expect(wallpaperManager.resume).not.toHaveBeenCalled();
  });

  test('pressing the hotkey is a no-op when wallpaper is in error', () => {
    wallpaperManager.getStatus.mockReturnValue(WALLPAPER_STATUS.ERROR);
    hotkeys.register();
    trigger();
    expect(wallpaperManager.pause).not.toHaveBeenCalled();
    expect(wallpaperManager.resume).not.toHaveBeenCalled();
  });

  test('unregister clears all global shortcuts', () => {
    hotkeys.unregister();
    expect(globalShortcut.unregisterAll).toHaveBeenCalled();
  });
});