jest.mock('koffi', () => {
  const { createKoffiMock } = require('../helpers/koffi-mock');
  return createKoffiMock();
});

const desktop = require('../../src/main/desktop/windows');

describe('windows desktop integration', () => {
  let handlers;
  let state;

  beforeEach(() => {
    jest.clearAllMocks();
    const lib = require('koffi').load();
    handlers = lib.handlers;
    state = lib.state;
    state.defViewUnderProgman = 500;
    state.defViewInWorkerW = 0;
    state.progmanExStyle = 0;
    state.progmanWorkerW = 0;
    state.workers = [];
    state.isWindowValue = 1;
    state.getParentValue = 100;
    state.setParentValue = 150;
    desktop.resetLayerCache();
  });

  test('getLayout uses Progman when it hosts the icons directly', () => {
    expect(desktop.getLayout()).toEqual({ parent: 100, insertAfter: 500 });
  });

  test('getLayout uses Progman and the icons WorkerW in the classic layout', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 500;
    state.workers = [200];
    state.workersWithDefView = [200];
    expect(desktop.getLayout()).toEqual({ parent: 100, insertAfter: 200 });
  });

  test('attachToDesktopLayer attaches below the icons layer', () => {
    desktop.getLayout();
    desktop.attachToDesktopLayer(300);
    expect(handlers.SetWindowLongPtrW).toHaveBeenCalled();
    expect(handlers.SetWindowPos).toHaveBeenCalledWith(300, 500, 0, 0, 0, 0, 19);
  });

  test('isAttachedToDesktop resolves the layout on demand', () => {
    expect(desktop.isAttachedToDesktop(300)).toBe(true);
  });

  test('attachToDesktopLayer uses the icons WorkerW as insertion target in the classic layout', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 500;
    state.workers = [200];
    state.workersWithDefView = [200];
    desktop.getLayout();
    desktop.attachToDesktopLayer(300);
    expect(handlers.SetParent).toHaveBeenCalledWith(300, 100);
    expect(handlers.SetWindowPos).toHaveBeenCalledWith(300, 200, 0, 0, 0, 0, 19);
  });

  test('isAttachedToDesktop returns true when parent matches a live layer', () => {
    desktop.getLayout();
    expect(desktop.isAttachedToDesktop(300)).toBe(true);
  });

  test('isAttachedToDesktop returns false when the layer is gone', () => {
    desktop.getLayout();
    state.isWindowValue = 0;
    expect(desktop.isAttachedToDesktop(300)).toBe(false);
  });

  test('ensureAttachedToDesktop re-injects when parenting is stale', () => {
    desktop.getLayout();
    state.isWindowValue = 0;

    desktop.ensureAttachedToDesktop(300);

    expect(handlers.SetParent).toHaveBeenCalled();
  });

  test('ensureAttachedToDesktop is a no-op when already attached', () => {
    desktop.getLayout();
    desktop.ensureAttachedToDesktop(300);
    expect(handlers.SetParent).not.toHaveBeenCalled();
  });

  test('disableRoundedCorners asks DWM not to round the corners', () => {
    desktop.disableRoundedCorners(300);
    expect(handlers.DwmSetWindowAttribute).toHaveBeenCalledWith(
      300,
      33,
      expect.any(Int32Array),
      4
    );
  });

  test('disableRoundedCorners is a no-op without a handle', () => {
    desktop.disableRoundedCorners(0);
    expect(handlers.DwmSetWindowAttribute).not.toHaveBeenCalled();
  });

  test('findWallpaperWorkerW uses the child WorkerW of Progman on the raised desktop (Win11 24H2+)', () => {
    state.progmanExStyle = 0x00200000;
    state.progmanWorkerW = 210;
    state.defViewUnderProgman = 500;
    expect(desktop.findWallpaperWorkerW()).toBe(210);
  });

  test('findWallpaperWorkerW uses the empty top-level WorkerW on the classic layout', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 500;
    state.workers = [200, 210];
    state.workersWithDefView = [200];
    expect(desktop.findWallpaperWorkerW()).toBe(210);
  });

  test('findWallpaperWorkerW returns 0 when no wallpaper layer is found', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 0;
    state.workers = [];
    state.workersWithDefView = [];
    expect(desktop.findWallpaperWorkerW()).toBe(0);
  });

  test('attachWallpaperWindow parents a layered, opaque child window to the wallpaper layer', () => {
    state.progmanExStyle = 0x00200000;
    state.progmanWorkerW = 210;
    state.defViewUnderProgman = 500;
    const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
    expect(desktop.attachWallpaperWindow(300, display)).toBe(true);
    expect(handlers.SetParent).toHaveBeenCalledWith(300, 210);
    expect(handlers.SetLayeredWindowAttributes).toHaveBeenCalledWith(300, 0, 255, 2);
    expect(handlers.SetWindowPos).toHaveBeenCalledWith(300, 0, 0, 0, 1920, 1080, 16);
  });

  test('attachWallpaperWindow scales the bounds to physical pixels using the display scale factor', () => {
    state.progmanExStyle = 0x00200000;
    state.progmanWorkerW = 210;
    state.defViewUnderProgman = 500;
    const display = { bounds: { x: 0, y: 0, width: 2048, height: 1152 }, scaleFactor: 1.25 };
    expect(desktop.attachWallpaperWindow(300, display)).toBe(true);
    expect(handlers.SetWindowPos).toHaveBeenCalledWith(300, 0, 0, 0, 2560, 1440, 16);
  });

  test('attachWallpaperWindow clips the wallpaper to a rectangular region covering the whole window', () => {
    state.progmanExStyle = 0x00200000;
    state.progmanWorkerW = 210;
    state.defViewUnderProgman = 500;
    const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
    expect(desktop.attachWallpaperWindow(300, display)).toBe(true);
    expect(handlers.CreateRectRgn).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(handlers.SetWindowRgn).toHaveBeenCalledWith(300, 500, 1);
  });

  test('attachWallpaperWindow returns false and does not parent when no layer found', () => {
    state.defViewUnderProgman = 0;
    state.defViewInWorkerW = 0;
    state.workers = [];
    state.workersWithDefView = [];
    const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
    expect(desktop.attachWallpaperWindow(300, display)).toBe(false);
    expect(handlers.SetParent).not.toHaveBeenCalled();
    expect(handlers.CreateRectRgn).not.toHaveBeenCalled();
  });
});