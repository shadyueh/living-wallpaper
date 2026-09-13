jest.mock('electron', () => {
  const EventEmitter = require('events');

  class MockTray extends EventEmitter {
    constructor() {
      super();
      this._tooltip = '';
      this._menu = null;
      this._image = null;
      this._destroyed = false;
    }
    setToolTip(t) { this._tooltip = t; }
    setContextMenu(m) { this._menu = m; }
    setImage(i) { this._image = i; }
    popUpContextMenu() {}
    destroy() { this._destroyed = true; }
  }

  const normalIcon = { _variant: 'normal' };
  const pauseIcon = { _variant: 'pause' };

  class MockMenu {
    static buildFromTemplate(template) { return template; }
  }

  return {
    Tray: MockTray,
    Menu: MockMenu,
    nativeImage: {
      createFromPath: jest.fn((p) => (p.includes('pause') ? pauseIcon : normalIcon)),
      createEmpty: jest.fn(() => ({})),
    },
    app: { quit: jest.fn() },
  };
});

jest.mock('../../src/main/config', () => ({
  get: jest.fn((key) => {
    const defaults = { wallpaper: '/path/to/video.mp4', hotkey: 'Ctrl+Shift+W' };
    return defaults[key];
  }),
  set: jest.fn(),
}));

jest.mock('../../src/main/wallpaper-manager', () => ({
  getStatus: jest.fn(() => 'stopped'),
  toggle: jest.fn(),
}));

const tray = require('../../src/main/tray');
const wallpaperManager = require('../../src/main/wallpaper-manager');
const { nativeImage } = require('electron');

describe('tray', () => {
  afterEach(() => tray.destroy());

  test('create returns a tray instance', () => {
    const t = tray.create();
    expect(t).toBeDefined();
  });

  test('updateMenu sets tooltip with wallpaper name', () => {
    tray.create();
    tray.updateMenu();
    const t = tray.create();
    expect(t._tooltip).toContain('video');
  });

  test('updateMenu shows Playing when not paused', () => {
    wallpaperManager.getStatus.mockReturnValue('stopped');
    tray.create();
    tray.updateMenu();
    const t = tray.create();
    expect(t._tooltip).toContain('Playing');
  });

  test('updateMenu shows Paused when paused', () => {
    wallpaperManager.getStatus.mockReturnValue('paused');
    tray.create();
    tray.updateMenu();
    const t = tray.create();
    expect(t._tooltip).toContain('Paused');
  });

  test('updateMenu shows the hotkey in the toggle label', () => {
    wallpaperManager.getStatus.mockReturnValue('playing');
    tray.create();
    tray.updateMenu();
    const t = tray.create();
    const toggle = t._menu.find((item) => item.label && item.label.includes('Pause'));
    expect(toggle.label).toContain('Ctrl+Shift+W');
  });

  test('Settings menu item calls the injected showSettings callback', () => {
    const showSettings = jest.fn();
    const t = tray.create({ showSettings });
    tray.updateMenu();
    const settings = t._menu.find((item) => item.label === 'Settings...');
    settings.click();
    expect(showSettings).toHaveBeenCalled();
  });

  test('toggle menu item toggles the wallpaper', () => {
    wallpaperManager.getStatus.mockReturnValue('playing');
    tray.create();
    tray.updateMenu();
    const t = tray.create();
    const toggle = t._menu.find((item) => item.label && item.label.includes('Pause'));
    toggle.click();
    expect(wallpaperManager.toggle).toHaveBeenCalled();
  });

  test('create loads the normal and pause icon assets', () => {
    tray.create();
    const calls = nativeImage.createFromPath.mock.calls.map(([p]) => p);
    expect(calls.some((p) => p.endsWith('icon.ico'))).toBe(true);
    expect(calls.some((p) => p.endsWith('icon-pause.ico'))).toBe(true);
  });

  test('updateMenu shows the pause icon when wallpaper is paused', () => {
    wallpaperManager.getStatus.mockReturnValue('paused');
    const t = tray.create();
    tray.updateMenu();
    expect(t._image).toEqual({ _variant: 'pause' });
  });

  test('updateMenu shows the normal icon when wallpaper is playing', () => {
    wallpaperManager.getStatus.mockReturnValue('playing');
    const t = tray.create();
    tray.updateMenu();
    expect(t._image).toEqual({ _variant: 'normal' });
  });

  test('destroy is idempotent', () => {
    tray.create();
    tray.destroy();
    tray.destroy();
  });
});
