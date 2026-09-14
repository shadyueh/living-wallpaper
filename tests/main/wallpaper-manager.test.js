jest.mock('electron', () => {
  const EventEmitter = require('events');
  const ipcListeners = {};
  const orderLog = [];

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
      this._sizeCalls = [];
    }
    loadFile() {}
    setVisibleOnAllWorkspaces() {}
    show() {}
    setContentSize(width, height) {
      this._sizeCalls.push([width, height]);
      orderLog.push('setContentSize');
    }
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
    orderLog,
  };
});

jest.mock('../../src/main/desktop/windows', () => ({
  disableRoundedCorners: jest.fn(),
  attachWallpaperWindow: jest.fn(() => true),
  monitorPhysicalRect: jest.fn(() => ({ left: 0, top: 0, right: 1920, bottom: 1080 })),
}));

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
    require('../../src/main/desktop/windows').disableRoundedCorners.mockClear();
    require('../../src/main/desktop/windows').attachWallpaperWindow.mockClear();
    require('../../src/main/desktop/windows').monitorPhysicalRect.mockClear();
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

  test('create does not use the invalid desktop type on win32 and attaches after did-finish-load', () => {
    const windows = require('../../src/main/desktop/windows');
    const win = wm.create(DISPLAY);
    if (process.platform === 'win32') {
      expect(win._opts.type).toBeUndefined();
      expect(windows.attachWallpaperWindow).not.toHaveBeenCalled();
      win.webContents.emit('did-finish-load');
      expect(windows.attachWallpaperWindow).toHaveBeenCalledTimes(2);
    } else {
      expect(win._opts.type).toBe('desktop');
      win.webContents.emit('did-finish-load');
      expect(windows.attachWallpaperWindow).not.toHaveBeenCalled();
    }
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

  test('getDisplayId returns the id of the last created display', () => {
    wm.create({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    expect(wm.getDisplayId()).toBe(1);
    wm.create({ id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } });
    expect(wm.getDisplayId()).toBe(2);
  });

  test('getDisplayId is null before any display is created', () => {
    expect(wm.getDisplayId()).toBeNull();
  });

  test('getDisplayPhysicalRect is null before any display is created', () => {
    expect(wm.getDisplayPhysicalRect()).toBeNull();
  });

  test('getDisplayPhysicalRect is stored after attach and cleared on destroy', () => {
    const win = wm.create(DISPLAY);
    if (process.platform === 'win32') {
      expect(wm.getDisplayPhysicalRect()).toBeNull();
      win.webContents.emit('did-finish-load');
      expect(wm.getDisplayPhysicalRect()).toEqual({ left: 0, top: 0, right: 1920, bottom: 1080 });
      wm.destroy();
      expect(wm.getDisplayPhysicalRect()).toBeNull();
    } else {
      win.webContents.emit('did-finish-load');
      expect(wm.getDisplayPhysicalRect()).toBeNull();
    }
  });

  test('getDisplayPhysicalRect reflects the display passed to create', () => {
    const windows = require('../../src/main/desktop/windows');
    windows.monitorPhysicalRect.mockReturnValue({ left: 2560, top: 0, right: 4480, bottom: 1440 });
    const display = { id: 3516600542, bounds: { x: 2048, y: 0, width: 1536, height: 1152 }, scaleFactor: 1.25 };
    const win = wm.create(display);

    win.webContents.emit('did-finish-load');

    expect(windows.monitorPhysicalRect).toHaveBeenCalledWith(display);
    if (process.platform === 'win32') {
      expect(wm.getDisplayPhysicalRect()).toEqual({ left: 2560, top: 0, right: 4480, bottom: 1440 });
    } else {
      expect(wm.getDisplayPhysicalRect()).toBeNull();
    }
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

  test('create disables rounded corners on win32 after did-finish-load', () => {
    const windows = require('../../src/main/desktop/windows');
    const win = wm.create(DISPLAY);
    if (process.platform === 'win32') {
      expect(windows.disableRoundedCorners).not.toHaveBeenCalled();
      win.webContents.emit('did-finish-load');
      expect(windows.disableRoundedCorners).toHaveBeenCalledWith(0);
    } else {
      win.webContents.emit('did-finish-load');
      expect(windows.disableRoundedCorners).not.toHaveBeenCalled();
    }
  });

  test('create syncs the content size to the display bounds only on did-finish-load (win32)', () => {
    const win = wm.create({ bounds: { x: 0, y: 0, width: 1920, height: 1200 } });
    if (process.platform === 'win32') {
      expect(win._sizeCalls).toEqual([]);
      win.webContents.emit('did-finish-load');
      expect(win._sizeCalls).toEqual([[1920, 1200]]);
    } else {
      win.webContents.emit('did-finish-load');
      expect(win._sizeCalls).toEqual([]);
    }
  });

  test('create attaches on did-finish-load and re-asserts after the viewport sync (win32)', () => {
    const windows = require('../../src/main/desktop/windows');
    const { orderLog } = require('electron');
    windows.attachWallpaperWindow.mockImplementation(() => {
      orderLog.push('attach');
      return true;
    });
    const display = { id: 2, bounds: { x: 1536, y: 0, width: 1536, height: 960 }, scaleFactor: 1.25 };
    const win = wm.create(display);
    if (process.platform === 'win32') {
      expect(orderLog).toEqual([]);
      win.webContents.emit('did-finish-load');
      expect(windows.attachWallpaperWindow).toHaveBeenCalledTimes(2);
      windows.attachWallpaperWindow.mock.calls.forEach((call) => {
        expect(call[0]).toBe(0);
        expect(call[1]).toBe(display);
        expect(call.length).toBe(2);
      });
      expect(orderLog).toEqual(['attach', 'setContentSize', 'attach']);
      expect(win._sizeCalls).toContainEqual([1536, 960]);
    } else {
      win.webContents.emit('did-finish-load');
      expect(windows.attachWallpaperWindow).not.toHaveBeenCalled();
      expect(orderLog).toEqual([]);
    }
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
