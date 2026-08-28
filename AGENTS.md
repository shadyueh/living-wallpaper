# AGENTS.md

Electron app for animated desktop wallpapers on Windows. Phase 1 MVP: video wallpaper playback behind desktop icons.

## Commands

```bash
npm run dev       # Start in dev mode
npm start         # Start normally
npm run lint      # ESLint (flat config, ESLint 9+)
npm test          # Jest — 44 tests across 8 suites
npm run build     # electron-builder
```

Lint must pass before commits: `npm run lint && npm test`

## Architecture

- `src/main/` — Main process: config, desktop integration, wallpaper lifecycle, tray
- `src/renderer/` — Settings UI window (HTML + JS, nodeIntegration)
- `src/wallpaper/` — Decorationless BrowserWindow (renders video behind desktop icons)
- `src/shared/constants.js` — IPC channels (all `lw:` prefixed), defaults

**Windows desktop integration:** WorkerW injection via koffi (user32.dll). The wallpaper BrowserWindow is parented to a WorkerW layer behind desktop icons. See `src/main/desktop/windows.js`.

**Fullscreen auto-pause:** `src/main/fullscreen-detector.js` polls every 2s via Win32 EnumWindows. Pauses wallpaper when a fullscreen window is detected.

## Key Gotchas

- Win32 `*W` (wide) functions take UTF-16 strings — declare params as `const char16_t*`, not `const char*` (koffi auto-converts JS strings; pass `null` for NULL).
- koffi loads prebuilt native bindings and works in Electron and Node without a compiler toolchain. Do not go back to ffi-napi/ref-napi: their addons fail to dlopen inside Electron (`Error in native callback`).
- HWNDs are 64-bit pointers, but koffi `uint64_t` params accept plain JS numbers and `void*` returns are read via `koffi.address()`.
- ESLint uses flat config (`eslint.config.js`), not `.eslintrc.json`.
- Renderer and wallpaper windows use `nodeIntegration: true, contextIsolation: false` — local files only, no remote content.

## Phase 2 Roadmap

- Linux X11 support (XRandr/EWMH)
- Wallpaper editor (import, preview, export)
- Web wallpaper support (HTML)
- Multi-monitor support
- GLSL shader wallpapers
