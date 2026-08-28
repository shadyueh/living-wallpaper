jest.mock('koffi', () => {
  const handlers = {
    EnumWindows: jest.fn((cb) => {
      cb(1, 0); // simulate one window
      return 1;
    }),
    IsWindowVisible: jest.fn(() => true),
    GetWindowLongW: jest.fn(() => 0),
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