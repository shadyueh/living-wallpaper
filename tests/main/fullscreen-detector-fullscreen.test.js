const RECT = { left: 0, top: 0, right: 1920, bottom: 1080 };

function mockKoffi({ windowRect = null, monitorInfoOk = true, foreground = 1 } = {}) {
  const handlers = {
    EnumWindows: jest.fn((cb) => {
      cb(1, 0); // simulate one top-level window
      return 1;
    }),
    IsWindowVisible: jest.fn(() => true),
    IsIconic: jest.fn(() => false),
    GetForegroundWindow: jest.fn(() => foreground),
    GetClassNameW: jest.fn(() => 0),
    GetWindowTextW: jest.fn(() => 0),
    GetWindowRect: jest.fn((_hwnd, rect) => {
      if (!windowRect) return false;
      rect[0] = windowRect[0];
      rect[1] = windowRect[1];
      rect[2] = windowRect[2];
      rect[3] = windowRect[3];
      return true;
    }),
    MonitorFromWindow: jest.fn(() => 0x600),
    GetMonitorInfoW: jest.fn((_monitor, info) => {
      if (!monitorInfoOk) return false;
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
  jest.doMock('koffi', () => ({
    load: jest.fn(() => lib),
    proto: jest.fn(() => 'EnumWindowsProcType'),
    pointer: jest.fn(() => 'EnumWindowsProcPtr'),
    register: jest.fn((fn) => fn),
  }));
}

describe('fullscreen-detector (fullscreen window)', () => {
  let detector;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    mockKoffi({ windowRect: [0, 0, 1920, 1080] });
    detector = require('../../src/main/fullscreen-detector');
  });

  afterEach(() => {
    if (detector) detector.stop();
    jest.useRealTimers();
  });

  test('isAnyWindowFullscreen returns true when the window covers the whole monitor', () => {
    expect(detector.isAnyWindowFullscreen()).toBe(true);
  });

  test('isAnyWindowFullscreen returns false when the covering window is not foreground', () => {
    jest.resetModules();
    mockKoffi({ windowRect: [0, 0, 1920, 1080], foreground: 0 });
    detector = require('../../src/main/fullscreen-detector');
    expect(detector.isAnyWindowFullscreen()).toBe(false);
  });

  test('isAnyWindowFullscreen returns false when the window does not cover the monitor', () => {
    jest.resetModules();
    mockKoffi({ windowRect: [0, 0, 800, 600] });
    detector = require('../../src/main/fullscreen-detector');
    expect(detector.isAnyWindowFullscreen()).toBe(false);
  });

  test('isAnyWindowFullscreen returns false when the monitor info cannot be read', () => {
    jest.resetModules();
    mockKoffi({ windowRect: [0, 0, 1920, 1080], monitorInfoOk: false });
    detector = require('../../src/main/fullscreen-detector');
    expect(detector.isAnyWindowFullscreen()).toBe(false);
  });

  test('calls the callback with the fullscreen monitor rect when a fullscreen window exists', () => {
    const cb = jest.fn();
    detector.start(cb);

    jest.advanceTimersByTime(2000);

    expect(cb).toHaveBeenCalledWith({
      added: [RECT],
      removed: [],
      fullscreen: [RECT],
    });
  });
});