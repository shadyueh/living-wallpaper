jest.mock('electron', () => {
  const EventEmitter = require('events');

  class MockTray extends EventEmitter {
    constructor() {
      super();
      this._tooltip = '';
      this._menu = null;
      this._destroyed = false;
    }
    setToolTip(t) { this._tooltip = t; }
    setContextMenu(m) { this._menu = m; }
    popUpContextMenu() {}
    destroy() { this._destroyed = true; }
  }

  class MockMenu {
    static buildFromTemplate(template) { return template; }
  }

  return {
    Tray: MockTray,
    Menu: MockMenu,
    nativeImage: { createFromPath: jest.fn(() => ({})), createEmpty: jest.fn(() => ({})) },
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
  pause: jest.fn(),
  resume: jest.fn(),
}));

const tray = require('../../src/main/tray');
const wallpaperManager = require('../../src/main/wallpaper-manager');

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

  test('destroy is idempotent', () => {
    tray.create();
    tray.destroy();
    tray.destroy();
  });
});
