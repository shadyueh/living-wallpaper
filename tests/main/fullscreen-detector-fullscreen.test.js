describe('fullscreen-detector (fullscreen window)', () => {
  let detector;

  beforeEach(() => {
    jest.resetModules();
    delete global._lwEnumWindowsProc;
  });

  afterEach(() => {
    if (detector) detector.stop();
  });

  test('isAnyWindowFullscreen returns true when window has WS_MAXIMIZE', () => {
    const WS_MAXIMIZE = 0x01000000;
    jest.doMock('ffi-napi', () => ({
      Library: jest.fn(() => ({
        EnumWindows: jest.fn((cb) => {
          cb(1, 0);
          return 1;
        }),
        IsWindowVisible: jest.fn(() => true),
        GetWindowLongW: jest.fn(() => WS_MAXIMIZE),
      })),
      Callback: jest.fn((_ret, _args, fn) => fn),
    }));
    detector = require('../../src/main/fullscreen-detector');
    expect(detector.isAnyWindowFullscreen()).toBe(true);
  });

  test('calls callback with true when fullscreen window exists', (done) => {
    const WS_MAXIMIZE = 0x01000000;
    jest.doMock('ffi-napi', () => ({
      Library: jest.fn(() => ({
        EnumWindows: jest.fn((cb) => {
          cb(1, 0);
          return 1;
        }),
        IsWindowVisible: jest.fn(() => true),
        GetWindowLongW: jest.fn(() => WS_MAXIMIZE),
      })),
      Callback: jest.fn((_ret, _args, fn) => fn),
    }));
    detector = require('../../src/main/fullscreen-detector');
    detector.start((isFull) => {
      expect(isFull).toBe(true);
      detector.stop();
      done();
    });
  }, 5000);
});
