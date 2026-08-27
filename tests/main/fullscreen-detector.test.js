jest.mock('ffi-napi', () => {
  return {
    Library: jest.fn(() => ({
      EnumWindows: jest.fn((cb) => {
        cb(1, 0); // simulate one window
        return 1;
      }),
      IsWindowVisible: jest.fn(() => true),
      GetWindowTextW: jest.fn(() => Buffer.alloc(256)),
      GetWindowLongW: jest.fn(() => 0),
    })),
    Callback: jest.fn(() => ({})),
  };
});

const detector = require('../../src/main/fullscreen-detector');

describe('fullscreen-detector', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    detector.stop();
  });

  afterEach(() => {
    detector.stop();
    jest.useRealTimers();
  });

  test('calls callback with false when no fullscreen window', () => {
    const cb = jest.fn();
    detector.start(cb);

    jest.advanceTimersByTime(2000);

    expect(cb).toHaveBeenCalledWith(false);
    detector.stop();
    jest.advanceTimersByTime(4000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('stops polling when stop() is called', () => {
    const cb = jest.fn();
    detector.start(cb);
    detector.stop();

    jest.advanceTimersByTime(4000);

    expect(cb).not.toHaveBeenCalled();
  });
});