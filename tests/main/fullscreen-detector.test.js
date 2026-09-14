jest.mock('koffi', () => {
  const handlers = {
    EnumWindows: jest.fn((cb) => {
      cb(1, 0); // simulate one top-level window
      return 1;
    }),
    IsWindowVisible: jest.fn(() => true),
    IsIconic: jest.fn(() => false),
    GetForegroundWindow: jest.fn(() => 1),
    GetClassNameW: jest.fn(() => 0),
    GetWindowTextW: jest.fn(() => 0),
    GetWindowRect: jest.fn((_hwnd, rect) => {
      rect[0] = 0;
      rect[1] = 0;
      rect[2] = 1920;
      rect[3] = 1080;
      return true;
    }),
    MonitorFromWindow: jest.fn(() => 0x600),
    GetMonitorInfoW: jest.fn((_monitor, info) => {
      info[0] = 40;
      info[1] = 0;
      info[2] = 0;
      info[3] = 1920;
      info[4] = 1080;
      return true;
    }),
  };
  const lib = {
    func: jest.fn((...args) => {
      let name;
      if (typeof args[0] === 'string' && args.length === 1) {
        name = args[0].match(/[A-Za-z_]\w*(?=\s*\()/)[0];
      } else {
        name = args[1];
      }
      return handlers[name];
    }),
  };
  return {
    load: jest.fn(() => lib),
    proto: jest.fn(() => 'EnumWindowsProcType'),
    pointer: jest.fn(() => 'EnumWindowsProcPtr'),
    register: jest.fn((fn) => fn),
    handlers,
  };
});

const detector = require('../../src/main/fullscreen-detector');
const koffi = require('koffi');

const RECT = { left: 0, top: 0, right: 1920, bottom: 1080 };

function windowFillsMonitor() {
  koffi.handlers.GetWindowRect.mockImplementation((_hwnd, rect) => {
    rect[0] = RECT.left;
    rect[1] = RECT.top;
    rect[2] = RECT.right;
    rect[3] = RECT.bottom;
    return true;
  });
}

function windowPartiallyVisible() {
  koffi.handlers.GetWindowRect.mockImplementation((_hwnd, rect) => {
    rect[0] = 0;
    rect[1] = 0;
    rect[2] = 800;
    rect[3] = 600;
    return true;
  });
}

function resetHandlers() {
  koffi.handlers.EnumWindows.mockImplementation((cb) => {
    cb(1, 0);
    return 1;
  });
  koffi.handlers.IsWindowVisible.mockImplementation(() => true);
  koffi.handlers.IsIconic.mockImplementation(() => false);
  koffi.handlers.GetForegroundWindow.mockImplementation(() => 1);
  koffi.handlers.GetClassNameW.mockImplementation(() => 0);
  koffi.handlers.GetWindowTextW.mockImplementation(() => 0);
  windowFillsMonitor();
  koffi.handlers.MonitorFromWindow.mockImplementation(() => 0x600);
  koffi.handlers.GetMonitorInfoW.mockImplementation((_monitor, info) => {
    info[0] = 40;
    info[1] = RECT.left;
    info[2] = RECT.top;
    info[3] = RECT.right;
    info[4] = RECT.bottom;
    return true;
  });
}

describe('fullscreen-detector', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetHandlers();
    detector.stop();
  });

  afterEach(() => {
    detector.stop();
    jest.useRealTimers();
  });

  test('calls callback with no fullscreen monitor when no window covers a monitor', () => {
    windowPartiallyVisible();
    const cb = jest.fn();
    detector.start(cb);

    jest.advanceTimersByTime(2000);

    expect(cb).toHaveBeenCalledWith({ added: [], removed: [], fullscreen: [] });
  });

  test('stops polling when stop() is called', () => {
    const cb = jest.fn();
    detector.start(cb);
    detector.stop();

    jest.advanceTimersByTime(4000);

    expect(cb).not.toHaveBeenCalled();
  });

  test('detects a window covering the whole monitor', () => {
    expect(detector.isAnyWindowFullscreen()).toBe(true);
  });

  test('does not detect a window covering only part of the monitor', () => {
    windowPartiallyVisible();
    expect(detector.isAnyWindowFullscreen()).toBe(false);
  });

  test('matches within a 2px tolerance', () => {
    koffi.handlers.GetWindowRect.mockImplementation((_hwnd, rect) => {
      rect[0] = 0;
      rect[1] = 0;
      rect[2] = 1919;
      rect[3] = 1081;
      return true;
    });
    expect(detector.detectFullscreen().fullscreen).toEqual([RECT]);
  });

  test('ignores minimized windows', () => {
    koffi.handlers.IsIconic.mockImplementation(() => true);
    expect(detector.isAnyWindowFullscreen()).toBe(false);
  });

  test('ignores windows that cover a monitor but are not the foreground window', () => {
    koffi.handlers.GetForegroundWindow.mockImplementation(() => 0);
    expect(detector.isAnyWindowFullscreen()).toBe(false);
  });

  test('ignores windows when the monitor info cannot be read', () => {
    koffi.handlers.GetMonitorInfoW.mockImplementation(() => false);
    expect(detector.isAnyWindowFullscreen()).toBe(false);
  });

  test('reports added and fullscreen rects on the first fullscreen detection', () => {
    const result = detector.detectFullscreen();
    expect(result.added).toEqual([RECT]);
    expect(result.fullscreen).toEqual([RECT]);
    expect(result.removed).toEqual([]);
  });

  test('is stable across polls while the fullscreen window remains', () => {
    detector.detectFullscreen();
    const result = detector.detectFullscreen();
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.fullscreen).toEqual([RECT]);
  });

  test('reports removed when the fullscreen window goes away', () => {
    detector.detectFullscreen();
    koffi.handlers.IsWindowVisible.mockImplementation(() => false);
    const result = detector.detectFullscreen();
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([RECT]);
    expect(result.fullscreen).toEqual([]);
  });

  test('does not pause the wallpaper when fullscreen is on another monitor', () => {
    const displayRect = { left: 1920, top: 0, width: 1920, height: 1080, right: 3840, bottom: 1080 };
    expect(detector.isRectCoveringDisplay(RECT, displayRect)).toBe(false);
  });

  test('pauses the wallpaper when fullscreen covers its own monitor', () => {
    const displayRect = { left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080 };
    expect(detector.isRectCoveringDisplay(RECT, displayRect)).toBe(true);
  });

  test('pauses when the display rect reports physical width/height only (monitorPhysicalRect shape)', () => {
    const displayRect = { left: 0, top: 0, width: 1920, height: 1080 };
    expect(detector.isRectCoveringDisplay(RECT, displayRect)).toBe(true);
  });

  test('isRectCoveringDisplay is safe with missing rects', () => {
    expect(detector.isRectCoveringDisplay(null, RECT)).toBe(false);
    expect(detector.isRectCoveringDisplay(RECT, null)).toBe(false);
    expect(detector.isRectCoveringDisplay(null, null)).toBe(false);
  });
});