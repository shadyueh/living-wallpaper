function buildWallpaperPayload(filePath, values) {
  return {
    type: 'video',
    path: filePath,
    volume: (Number(values && values.volume) || 0) / 100,
    speed: Number(values && values.speed) || 1,
  };
}

module.exports = { buildWallpaperPayload };