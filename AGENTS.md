# AGENTS.md

Electron app for animated desktop wallpapers on Windows. Phase 1 MVP: video wallpaper playback behind desktop icons.

## Commands

```bash
npm run dev       # Start in dev mode
npm start         # Start normally
npm run lint      # ESLint (flat config, ESLint 9+)
npm test          # Jest — 45 tests across 8 suites
npm run build     # electron-builder
```

Lint must pass before commits: `npm run lint && npm test`

## Architecture

- `src/main/` — Main process: config, desktop integration, wallpaper lifecycle, tray
- `src/renderer/` — Settings UI window (HTML + JS, nodeIntegration)
- `src/wallpaper/` — Decorationless BrowserWindow (renders video behind desktop icons)
- `src/shared/constants.js` — IPC channels (all `lw:` prefixed), defaults

**Windows desktop integration:** the wallpaper BrowserWindow uses `type: 'desktop'` — Chromium keeps it behind the desktop icons and DWM-composites it correctly. `src/main/desktop/windows.js` (koffi/user32 WorkerW + Progman toolkit) is retained for native layering work, but the wallpaper window does NOT use WorkerW parenting in the MVP.

**Fullscreen auto-pause:** `src/main/fullscreen-detector.js` polls every 2s via Win32 EnumWindows. Pauses wallpaper when a fullscreen window is detected.

## Key Gotchas

- Win32 `*W` (wide) functions take UTF-16 strings — declare params as `const char16_t*`, not `const char*` (koffi auto-converts JS strings; pass `null` for NULL).
- koffi loads prebuilt native bindings and works in Electron and Node without a compiler toolchain. Do not go back to ffi-napi/ref-napi: their addons fail to dlopen inside Electron (`Error in native callback`).
- HWNDs are 64-bit pointers, but koffi `uint64_t` params accept plain JS numbers and `void*` returns are read via `koffi.address()` (BigInt on x64 — wrap in `Number()`).
- **A BrowserWindow whose HWND is re-parented (via `SetParent`, with or without `WS_CHILD`) to Progman/WorkerW does NOT composite to the screen in this Electron build** — the surface renders internally (capturePage ok) but never appears on the desktop. `type: 'desktop'` (in `wallpaper-manager.js`) is the working, supported path.
- `desktopCapturer` skips `type: 'desktop'`/parented windows — a screenshot of the desktop will never show the wallpaper even when it is visibly composing.
- `GetParent` lies for WS_POPUP windows without an owner — use `GetAncestor(hwnd, GA_PARENT)` when working with `windows.js` helpers. Desktop icon layer = `SHELLDLL_DefView`; when it is a direct child of Progman, the static wallpaper surface is the WorkerW right below it.
- ESLint uses flat config (`eslint.config.js`), not `.eslintrc.json`.
- Renderer and wallpaper windows use `nodeIntegration: true, contextIsolation: false` — local files only, no remote content.

## Phase 2 Roadmap

- Linux X11 support (XRandr/EWMH)
- Wallpaper editor (import, preview, export)
- Web wallpaper support (HTML)
- Multi-monitor support
- GLSL shader wallpapers
