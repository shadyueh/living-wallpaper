// Renders assets/icon.svg (normal + pause variants) into PNG and multi-size ICO files.
// Requires Inkscape CLI (renders SVG) and Electron (nativeImage downsizing + PNG encode).
// Run with: npm run icons
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const SVG_PATH = path.join(ASSETS, 'icon.svg');
const TMP_DIR = path.join(ROOT, '.tmp-icons');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const INKSCAPE_CANDIDATES = [
  process.env.INKSCAPE,
  'C:\\Program Files\\Inkscape\\bin\\inkscape.exe',
  'C:\\Program Files\\Inkscape\\inkscape.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inkscape', 'bin', 'inkscape.exe'),
].filter(Boolean);

function findInkscape() {
  for (const candidate of INKSCAPE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const fromPath = execFileSync('where', ['inkscape'], { encoding: 'utf8' })
      .split(/\r?\n/)[0]
      .trim();
    if (fromPath) return fromPath;
  } catch {
    // not on PATH
  }
  return null;
}

function variantSvg(text, variant) {
  if (variant === 'normal') return text;
  // Pause variant: hide layer1, show layer3.
  const hidden = text.replace(/(<g[^>]*id="layer1"[^>]*style="display:)inline">/, '$1none">');
  return hidden.replace(/(<g[^>]*id="layer3"[^>]*style="display:)none">/, '$1inline">');
}

function renderPng(inkscape, svgText, variant) {
  const src = path.join(TMP_DIR, `${variant}.svg`);
  const out = path.join(TMP_DIR, `${variant}.png`);
  fs.writeFileSync(src, variantSvg(svgText, variant));
  execFileSync(
    inkscape,
    [src, '--export-type=png', `--export-filename=${out}`, '--export-area-drawing', '--export-width=512'],
    { stdio: 'inherit' }
  );
  return out;
}

function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4); // image count
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, buffer } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // palette colors (unused)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    offset += buffer.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buffer)]);
}

function rasterize(inkscape, svgText, variant) {
  const png512 = renderPng(inkscape, svgText, variant);
  const base = nativeImage.createFromPath(png512);
  if (base.isEmpty()) throw new Error(`${variant}: 512px render came back empty`);
  const pngs = SIZES.map((size) => ({
    size,
    buffer: base.resize({ width: size, height: size, quality: 'good' }).toPNG(),
  }));
  const png256 = pngs.find((p) => p.size === 256).buffer;
  const ico = buildIco(pngs);
  const pngName = variant === 'normal' ? 'icon.png' : `icon-${variant}.png`;
  const icoName = variant === 'normal' ? 'icon.ico' : `icon-${variant}.ico`;
  fs.writeFileSync(path.join(ASSETS, pngName), png256);
  fs.writeFileSync(path.join(ASSETS, icoName), ico);
  return { pngName, icoName, bytes: ico.length };
}

app.whenReady().then(() => {
  try {
    if (!fs.existsSync(SVG_PATH)) {
      throw new Error(`source not found: ${SVG_PATH}`);
    }
    const inkscape = findInkscape();
    if (!inkscape) {
      throw new Error('Inkscape not found. Install it or set the INKSCAPE env var to the executable path.');
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const svgText = fs.readFileSync(SVG_PATH, 'utf8');
    const results = ['normal', 'pause'].map((variant) => rasterize(inkscape, svgText, variant));
    for (const r of results) {
      console.log(`OK  ${r.icoName} (${r.bytes} bytes) — ${r.pngName}`);
    }
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    app.quit();
  }
});