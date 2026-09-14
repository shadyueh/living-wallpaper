// src/main/display-utils.js
function resolveTargetDisplay(screen, targetDisplayId) {
  if (typeof targetDisplayId === 'number') {
    const match = screen.getAllDisplays().find((display) => display.id === targetDisplayId);
    if (match) return match;
  }
  return screen.getPrimaryDisplay();
}

function serializeDisplays(screen, targetDisplayId) {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  return {
    monitors: displays.map((display) => ({
      id: display.id,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
      primary: display.id === primaryId,
    })),
    selectedId: resolveTargetDisplay(screen, targetDisplayId).id,
  };
}

module.exports = { resolveTargetDisplay, serializeDisplays };