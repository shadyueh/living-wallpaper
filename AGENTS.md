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

**Windows desktop integration:** the wallpaper window is attached to the desktop layer via `attachWallpaperWindow` (in `src/main/desktop/windows.js`): it detects the *raised desktop* (a WorkerW child of Progman, via `WS_EX_NOREDIRECTIONBITMAP` in `findWallpaperWorkerW`) or the classic WorkerW, enables `WS_EX_LAYERED` + full opacity, converts DIP→physical pixels via `display.scaleFactor`, then `SetParent` + `SetWindowPos` with a `MapWindowPoints` offset. `type: 'desktop'` is set **only outside Windows** (`wallpaper-manager.js:50-52`).

**Fullscreen auto-pause:** `src/main/fullscreen-detector.js` polls every 2s via Win32 EnumWindows. Pauses wallpaper when a fullscreen window is detected.

## Key Gotchas

- Win32 `*W` (wide) functions take UTF-16 strings — declare params as `const char16_t*`, not `const char*` (koffi auto-converts JS strings; pass `null` for NULL).
- koffi loads prebuilt native bindings and works in Electron and Node without a compiler toolchain. Do not go back to ffi-napi/ref-napi: their addons fail to dlopen inside Electron (`Error in native callback`).
- HWNDs are 64-bit pointers, but koffi `uint64_t` params accept plain JS numbers and `void*` returns are read via `koffi.address()` (BigInt on x64 — wrap in `Number()`).
- A BrowserWindow re-parented (via `SetParent`, with or without `WS_CHILD`) to Progman/WorkerW composites only once it is **layered and fully opaque** (`WS_EX_LAYERED` + `SetLayeredWindowAttributes` alpha 255) — handled in `attachWallpaperWindow` (`windows.js:191-195`). Without that, the surface renders internally (capturePage ok) but never appears on the desktop.
- Re-attach after explorer.exe restart (detection via `WM_TASKBARCREATED`) is **not implemented** — only the `resetLayerCache`/`ensureAttachedToDesktop` helpers exist.
- `desktopCapturer` skips `type: 'desktop'`/parented windows — a screenshot of the desktop will never show the wallpaper even when it is visibly composing.
- `GetParent` lies for WS_POPUP windows without an owner — use `GetAncestor(hwnd, GA_PARENT)` when working with `windows.js` helpers. Desktop icon layer = `SHELLDLL_DefView`; when it is a direct child of Progman, the static wallpaper surface is the WorkerW right below it.
- ESLint uses flat config (`eslint.config.js`), not `.eslintrc.json`.
- Renderer and wallpaper windows use `nodeIntegration: true, contextIsolation: false` — local files only, no remote content.

## Phase 2 Roadmap

- Wallpaper editor (import, preview, export)
- Web wallpaper support (HTML)
- Multi-monitor support
- Library management (add source folders → pick a file as wallpaper)

## Phase 3 Roadmap

- Linux X11 support (XRandr/EWMH)
- Linux Wayland support (native daemon via wlr-layer-shell)
- GLSL shader wallpapers
- Scene compositor (layers, particles)
- Marketplace/sharing
- Auto-start/scheduling
