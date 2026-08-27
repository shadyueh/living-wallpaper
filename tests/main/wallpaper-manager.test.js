jest.mock('electron', () => {
  const EventEmitter = require('events');
  const ipcListeners = {};

  class MockWebContents extends EventEmitter {
    send(channel, ...args) {
      const listeners = ipcListeners[channel] || [];
      listeners.forEach((fn) => fn({}, ...args));
    }
    on(channel, fn) {
      if (!ipcListeners[channel]) ipcListeners[channel] = [];
      ipcListeners[channel].push(fn);
    }
  }

  class MockBrowserWindow extends EventEmitter {
    constructor(opts) {
      super();
      this._opts = opts;
      this.webContents = new MockWebContents();
      this._destroyed = false;
    }
    loadFile() {}
    setVisibleOnAllWorkspaces() {}
    getNativeWindowHandle() {
      return Buffer.alloc(8);
    }
    destroy() {
      this._destroyed = true;
      this.emit('closed');
    }
    isDestroyed() {
      return this._destroyed;
    }
  }

  return {
    BrowserWindow: MockBrowserWindow,
  };
});

jest.mock('../../src/main/desktop/windows', () => ({
  setParentToWorkerW: jest.fn(),
}));

const { WALLPAPER_STATUS } = require('../../src/shared/constants');

describe('wallpaper-manager', () => {
  let wm;

  beforeEach(() => {
    jest.resetModules();
    wm = require('../../src/main/wallpaper-manager');
  });

  test('create returns a BrowserWindow', () => {
    const win = wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    expect(win).toBeDefined();
    expect(win._opts.width).toBe(1920);
  });

  test('create destroys previous window', () => {
    const first = wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    const second = wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    expect(first._destroyed).toBe(true);
    expect(second._destroyed).toBe(false);
  });

  test('getStatus returns STOPPED initially', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.STOPPED);
  });

  test('pause sets status to PAUSED', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.pause();
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.PAUSED);
  });

  test('resume sets status to PLAYING', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.pause();
    wm.resume();
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.PLAYING);
  });

  test('updateStatus sets PLAYING', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.updateStatus(WALLPAPER_STATUS.PLAYING);
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.PLAYING);
  });

  test('updateStatus sets PAUSED', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.updateStatus(WALLPAPER_STATUS.PAUSED);
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.PAUSED);
  });

  test('updateStatus sets ERROR', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.updateStatus(WALLPAPER_STATUS.ERROR, 'test error');
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.ERROR);
  });

  test('destroy stops the wallpaper', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.pause();
    wm.destroy();
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.STOPPED);
  });

  test('destroy is idempotent', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.destroy();
    wm.destroy();
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.STOPPED);
  });

  test('pause and resume are no-ops without window', () => {
    wm.pause();
    wm.resume();
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.STOPPED);
  });
});
