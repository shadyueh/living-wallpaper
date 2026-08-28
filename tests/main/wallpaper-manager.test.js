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
      super.on(channel, fn);
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

const { IPC, WALLPAPER_STATUS } = require('../../src/shared/constants');

const DISPLAY = { bounds: { x: 0, y: 0, width: 1920, height: 1080 } };

describe('wallpaper-manager', () => {
  let wm;
  let spyLog;
  let spyError;

  beforeEach(() => {
    jest.useFakeTimers();
    spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.resetModules();
    wm = require('../../src/main/wallpaper-manager');
  });

  afterEach(() => {
    wm.destroy();
    jest.useRealTimers();
    spyLog.mockRestore();
    spyError.mockRestore();
  });

  test('create returns a BrowserWindow', () => {
    const win = wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    expect(win).toBeDefined();
    expect(win._opts.width).toBe(1920);
  });

  test('create uses a desktop-type window (behind the icons)', () => {
    const win = wm.create(DISPLAY);
    expect(win._opts.type).toBe('desktop');
    expect(win._opts.transparent).toBeUndefined();
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

  test('toggle pauses when playing', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.resume();
    wm.toggle();
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.PAUSED);
  });

  test('toggle resumes when paused', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.pause();
    wm.toggle();
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.PLAYING);
  });

  test('toggle is a no-op while stopped', () => {
    wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    wm.toggle();
    expect(wm.getStatus()).toBe(WALLPAPER_STATUS.STOPPED);
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

  test('setWallpaper before load is queued and flushed after did-finish-load', () => {
    const wallpaper = { type: 'video', path: 'C:/x.mp4' };
    const win = wm.create(DISPLAY);
    const sendSpy = jest.spyOn(win.webContents, 'send');

    wm.setWallpaper(wallpaper);

    expect(sendSpy).not.toHaveBeenCalled();

    win.webContents.emit('did-finish-load');

    expect(sendSpy).toHaveBeenCalledWith(IPC.SET_WALLPAPER, wallpaper);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  test('setWallpaper after load sends immediately', () => {
    const wallpaper = { type: 'video', path: 'C:/y.mp4' };
    const win = wm.create(DISPLAY);
    win.webContents.emit('did-finish-load');
    const sendSpy = jest.spyOn(win.webContents, 'send');

    wm.setWallpaper(wallpaper);

    expect(sendSpy).toHaveBeenCalledWith(IPC.SET_WALLPAPER, wallpaper);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  test('create throws when display has no bounds', () => {
    expect(() => wm.create(null)).toThrow(TypeError);
    expect(() => wm.create({})).toThrow(TypeError);
  });

  test('destroy clears the pending wallpaper', () => {
    wm.create(DISPLAY);
    wm.setWallpaper({ type: 'video', path: 'C:/z.mp4' });
    wm.destroy();

    const win2 = wm.create(DISPLAY);
    const sendSpy = jest.spyOn(win2.webContents, 'send');
    win2.webContents.emit('did-finish-load');

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
