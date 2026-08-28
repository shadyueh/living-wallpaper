describe('fullscreen-detector (fullscreen window)', () => {
  let detector;

  function mockKoffi(styleValue) {
    const handlers = {
      EnumWindows: jest.fn((cb) => {
        cb(1, 0);
        return 1;
      }),
      IsWindowVisible: jest.fn(() => true),
      GetWindowLongW: jest.fn(() => styleValue),
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

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
  });

  afterEach(() => {
    if (detector) detector.stop();
    jest.useRealTimers();
  });

  test('isAnyWindowFullscreen returns true when window has WS_MAXIMIZE', () => {
    const WS_MAXIMIZE = 0x01000000;
    mockKoffi(WS_MAXIMIZE);
    detector = require('../../src/main/fullscreen-detector');
    expect(detector.isAnyWindowFullscreen()).toBe(true);
  });

  test('calls callback with true when fullscreen window exists', () => {
    const WS_MAXIMIZE = 0x01000000;
    mockKoffi(WS_MAXIMIZE);
    detector = require('../../src/main/fullscreen-detector');
    const cb = jest.fn();
    detector.start(cb);

    jest.advanceTimersByTime(2000);

    expect(cb).toHaveBeenCalledWith(true);
  });
});