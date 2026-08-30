// tests/main/wallpaper-payload.test.js
const { buildWallpaperPayload } = require('../../src/main/wallpaper-payload');

describe('buildWallpaperPayload', () => {
  test('normalizes volume from percentage to fraction', () => {
    expect(buildWallpaperPayload('C:\\videos\\test.mp4', { volume: 89, speed: 1.5 })).toEqual({
      type: 'video',
      path: 'C:\\videos\\test.mp4',
      volume: 0.89,
      speed: 1.5,
    });
  });

  test('falls back to defaults when values are missing', () => {
    expect(buildWallpaperPayload('/videos/test.mp4', {})).toEqual({
      type: 'video',
      path: '/videos/test.mp4',
      volume: 0,
      speed: 1,
    });
  });

  test('keeps volume at 0 when configured volume is 0', () => {
    expect(buildWallpaperPayload('/videos/test.mp4', { volume: 0, speed: 2 })).toMatchObject({
      volume: 0,
      speed: 2,
    });
  });
});