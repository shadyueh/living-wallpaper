// tests/main/display-utils.test.js
const { resolveTargetDisplay, serializeDisplays } = require('../../src/main/display-utils');

const PRIMARY = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

const SECONDARY = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  scaleFactor: 1.25,
};

function createScreen() {
  return {
    getAllDisplays: jest.fn(() => [PRIMARY, SECONDARY]),
    getPrimaryDisplay: jest.fn(() => PRIMARY),
  };
}

describe('resolveTargetDisplay', () => {
  test('returns the display matching the target id', () => {
    const screen = createScreen();
    expect(resolveTargetDisplay(screen, 2)).toBe(SECONDARY);
  });

  test('falls back to the primary display when the target id is not found', () => {
    const screen = createScreen();
    expect(resolveTargetDisplay(screen, 999)).toBe(PRIMARY);
  });

  test('falls back to the primary display when no target is set', () => {
    const screen = createScreen();
    expect(resolveTargetDisplay(screen, null)).toBe(PRIMARY);
    expect(resolveTargetDisplay(screen, undefined)).toBe(PRIMARY);
  });
});

describe('serializeDisplays', () => {
  test('returns a serializable snapshot of all displays with primary flag', () => {
    const screen = createScreen();
    const { monitors } = serializeDisplays(screen, null);

    expect(monitors).toEqual([
      { id: 1, bounds: PRIMARY.bounds, scaleFactor: 1, primary: true },
      { id: 2, bounds: SECONDARY.bounds, scaleFactor: 1.25, primary: false },
    ]);
    expect(screen.getAllDisplays).toHaveBeenCalled();
  });

  test('selectedId is the resolved target display', () => {
    const screen = createScreen();
    expect(serializeDisplays(screen, 2).selectedId).toBe(2);
    expect(serializeDisplays(screen, null).selectedId).toBe(1);
  });
});