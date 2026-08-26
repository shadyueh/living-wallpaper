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
  afterEach(() => detector.stop());

  test('calls callback with false when no fullscreen window', (done) => {
    detector.start((isFull) => {
      expect(isFull).toBe(false);
      detector.stop();
      done();
    });
  }, 5000);

  test('stops polling when stop() is called', () => {
    detector.start(() => {});
    detector.stop();
    // No error = pass
  });
});
