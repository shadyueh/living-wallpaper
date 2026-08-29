# Living Wallpaper — Design Specification

**Date:** 2026-08-26
**Status:** Draft
**Stack:** Electron + Node.js

---

## 1. Product Vision

A cross-platform (Windows + Linux) animated wallpaper application that serves as both:

- **Player**: Renders animated wallpapers (video, web, shaders) as the desktop background
- **Creator**: Provides a visual editor for building custom wallpapers from video, HTML/CSS/JS, or GLSL shaders

---

## 2. Architecture Overview

### 2.1 Process Model

```
Main Process (Node.js)
├── Desktop Integration (Win32 / Linux APIs via koffi)
├── Wallpaper Lifecycle Manager
├── File System Operations
└── System Tray

Renderer Process — UI Window (normal BrowserWindow)
├── Settings panel
├── Wallpaper browser/library
└── Wallpaper Editor

Renderer Process — Wallpaper Window (decorationless BrowserWindow)
├── <video> for MP4/WebM playback
├── <webview> for HTML wallpapers
└── <canvas> for WebGL/GLSL shaders
```

### 2.2 Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| IPC between windows | Electron IPC + shared state | Native, no extra deps |
| Native API calls | `koffi` | Direct Win32/Linux API access via prebuilt bindings (ffi-napi/ref-napi addons fail to dlopen inside Electron) |
| Video playback | `<video>` tag with HW accel | Electron's Chromium supports VA-API/DXVA natively |
| Web wallpapers | `<webview>` tag | Isolation, performance, GPU process separation |
| Shader rendering | `<canvas>` WebGL | Direct GLSL support via Chromium |
| Config storage | JSON file in `app.getPath('userData')` | Simple, portable |
| Wallpaper geometry / scaling | `display.bounds` (DIP) × `display.scaleFactor` → physical px for `SetWindowPos`; layer rect via `GetWindowRect`, offsets via `MapWindowPoints` | Electron bounds are DIP; Win32 needs physical pixels. Base for multi-monitor |
| Wallpaper format | Directory with `manifest.json` | Self-contained, easy to share |

---

## 3. Desktop Integration

### 3.1 Windows — WorkerW Injection

**Technique:** Place the wallpaper BrowserWindow behind desktop icons by re-parenting it into the Progman/WorkerW layer. Native calls go through **koffi** (prebuilt bindings, no compiler toolchain; ffi-napi/ref-napi addons fail to dlopen inside Electron).

```javascript
// Pseudocode — koffi calls to Win32 (see src/main/desktop/windows.js)
const user32 = koffi.load('user32.dll');
const FindWindowW = user32.func('void* FindWindowW(const char16_t* name, const char16_t* title)');
const SendMessageW = user32.func('void* SendMessageW(uint64_t hwnd, int msg, int wParam, int lParam)');
const FindWindowExW = user32.func('void* FindWindowExW(uint64_t parent, uint64_t childAfter, const char16_t* cls, const char16_t* title)');
const SetParent = user32.func('void* SetParent(uint64_t child, uint64_t parent)');
const SetWindowPos = user32.func('void* SetWindowPos(uint64_t hwnd, uint64_t insertAfter, int x, int y, int cx, int cy, uint32_t flags)');
const SetWindowLongPtrW = user32.func('intptr_t SetWindowLongPtrW(uint64_t hwnd, int index, intptr_t value)');
const SetLayeredWindowAttributes = user32.func('bool SetLayeredWindowAttributes(uint64_t hwnd, int color, int alpha, int flags)');

// 1. Find Progman
const progman = hv(FindWindowW('Progman', null));
// 2. Ask Progman to spawn the wallpaper WorkerW behind the icons
SendMessageW(progman, 0x052C, 0, 0);
// 3. Detect "raised desktop" (Win11 24H2+): Progman carries WS_EX_NOREDIRECTIONBITMAP
//    and the wallpaper layer is the child WorkerW of Progman, z-ordered below the icons.
const workerW = hv(FindWindowExW(progman, 0, 'WorkerW', null));
// 4. Turn the Electron window into a layered & opaque child and re-parent it
SetWindowLongPtrW(hwnd, GWL_STYLE, (style & ~WS_POPUP) | WS_CHILD);
SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);
SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
SetParent(hwnd, workerW);
SetWindowPos(hwnd, 0, x, y, w, h, SWP_NOACTIVATE);
```

**Scaled / multi-monitor geometry.** `display.bounds` from Electron is in **device-independent pixels (DIP)**, but `SetWindowPos` works in **physical pixels**. On a display scaled to 125% (e.g. a 2560x1440 monitor with `scaleFactor` 1.25), a window created from the raw DIP bounds ends up physically smaller than the screen. To cover the requested monitor the bounds are multiplied by `display.scaleFactor`, and the origin is translated into the layer's coordinate space with `MapWindowPoints(HWND_DESKTOP, layer, pt, 1)`.

**Known topology (raised desktop, Win11 24H2+/build 26200 on multi-monitor):** there is a **single child WorkerW of Progman that covers the whole virtual desktop** (all monitors), not one WorkerW per display. Detecting the raised desktop uses `WS_EX_NOREDIRECTIONBITMAP` on Progman; the classic (Win10 / older Win11) fallback finds the empty top-level WorkerW that follows the icons WorkerW. `GetWindowRect(layer)` yields the layer's full covering rectangle (physical px of the whole virtual desktop), which is the base geometry for the future "extend to all displays" mode.

**Known issues:**
- DWM (Desktop Window Manager) may interfere on some Windows builds
- Must re-parent on explorer.exe restart — not yet implemented (helpers `resetLayerCache`/`ensureAttachedToDesktop` exist only; shell restart detection via `WM_TASKBARCREATED` is future work)
- An Electron window re-parented via `SetParent`+`WS_CHILD` composites only when it is **layered and fully opaque** (`WS_EX_LAYERED` + `SetLayeredWindowAttributes(alpha=255)`) — otherwise it renders internally but never appears
- `desktopCapturer` skips `type: 'desktop'`/parented windows, so a desktop screenshot never shows the wallpaper even when it is visibly composing
- Multi-monitor (future): one BrowserWindow per display parented to the shared WorkerW, each sized to its own physical bounds and offset via `MapWindowPoints`; or a single window sized to `GetWindowRect(layer)` for "extend to all displays"

### 3.2 Linux — X11

**Technique:** Set the window as desktop root window background via EWMH hints.

- Set `_XROOTPMAP_ID` property on the window to a Pixmap
- Or use `xdotool`-style window manipulation to position behind all windows
- Alternative: run a lightweight compositor or use the DE's own wallpaper mechanism

**Limitations:**
- GNOME: No public API for animated wallpapers; would need a shell extension
- KDE Plasma: Has native `AnimatedImageComponent` QML — could hook into it
- XFCE/Openbox: Easier, fewer abstractions

### 3.3 Linux — Wayland

**Technique:** Use `wlr-layer-shell-unstable` protocol (wlroots compositors: Hyprland, Sway, River, etc.)

- Create a `zwlr_layer_surface_v1` with `layer: ZWLR_LAYER_SHELL_V1_LAYER_BACKGROUND`
- Render via OpenGL/EGL directly on the surface
- Must be a native Wayland client, not Electron — **Electron does not support wlr-layer-shell**

**Implication:** On Wayland, the wallpaper rendering must be a separate native process (C/Rust). Electron handles the UI and orchestration only.

### 3.4 Multi-Platform Strategy

```
┌──────────────────────────────────────────────┐
│           Electron (UI + Orchestration)       │
│  ┌─────────────┐  ┌────────────────────────┐ │
│  │ Settings UI │  │ Wallpaper Editor       │ │
│  └─────────────┘  └────────────────────────┘ │
└──────────┬──────────────────────┬────────────┘
           │ IPC                  │ IPC
    ┌──────▼──────┐      ┌───────▼────────┐
    │ Win32:      │      │ Linux native:  │
    │ WorkerW     │      │ Wayland daemon │
    │ (koffi)     │      │ (separate bin) │
    └─────────────┘      └────────────────┘
```

---

## 4. Wallpaper Format

> **Status:** target format for the Phase 2 editor/library. The MVP persists a raw video path (`config.wallpaper` = string, via drag-and-drop on the settings UI) instead.

A wallpaper is a directory containing:

```
my-wallpaper/
├── manifest.json
├── thumbnail.png        (320x180 preview)
├── background.mp4       (for video wallpapers)
├── index.html           (for web wallpapers)
└── shader.frag          (for GLSL wallpapers)
```

### 4.1 manifest.json

```json
{
  "id": "uuid-or-slug",
  "name": "My Wallpaper",
  "version": "1.0.0",
  "type": "video",
  "author": "username",
  "tags": ["nature", "4k"],
  "config": {
    "fps": 30,
    "resolution": { "width": 3840, "height": 2160 },
    "audio": false,
    "pauseOnFullscreen": true,
    "pauseOnBattery": true  // persisted in config but not yet wired in the MVP
  },
  "properties": [
    {
      "name": "speed",
      "type": "slider",
      "min": 0.1,
      "max": 3.0,
      "default": 1.0
    }
  ]
}
```

Note: the `fps` and `startMinimized` defaults in `DEFAULT_CONFIG` (`src/shared/constants.js`) likewise exist but are not yet wired in the MVP.

### 4.2 Wallpaper Types

| Type | `type` value | Required files | Rendering |
|---|---|---|---|
| Video | `"video"` | `background.mp4` | `<video>` tag |
| Web | `"web"` | `index.html` | `<webview>` or `<iframe>` |
| Shader | `"shader"` | `shader.frag` + `shader.vert` | `<canvas>` WebGL |
| Scene | `"scene"` | `scene.json` | Compositor (layers, particles, etc.) |

---

## 5. Core Features

### 5.1 Player Features

- **Auto-pause**: Detect fullscreen app/game → pause wallpaper → ~0% CPU/GPU
  - Windows: polls `EnumWindows` every 2s; a "fullscreen" window is one that is visible without `WS_CAPTION` (0x00C00000) and with `WS_MAXIMIZE` (0x01000000) — see `src/main/fullscreen-detector.js:16-26`
  - Linux X11: `_NET_WM_STATE` atom check
- **Multi-monitor**: user-chosen layout — either **extend one wallpaper across all displays** or **assign an independent wallpaper per monitor**. Backed by per-display config keyed by display id, sized to physical pixels (see §3.1). On Windows the raised-desktop layout shares a single WorkerW across the virtual desktop, so per-monitor consists of one window per display offset via `MapWindowPoints`, and "extend" sizes a single window to `GetWindowRect(layer)`. (Roadmap — Phase 2; see plan `multi-monitor`.)
- **Loop playback**: Seamless video looping with no gap
- **Volume control**: Per-wallpaper audio (default: muted)
- **Hotkey**: Quick toggle pause/play
- **Schedule**: Time-based wallpaper switching (not scheduled — Phase 3 candidate)
- **Performance profiles**: Low/Medium/High (cap FPS, resolution) (not scheduled — Phase 3 candidate)

### 5.2 Creator Features

- **Import**: Drag-and-drop video files, HTML, or GLSL
- **Preview**: Live preview at target resolution
- **Timeline editor** (for video): Trim, speed, loop points
- **Property editor**: Expose user-configurable properties (speed, color, intensity)
- **Export**: Package as wallpaper directory with manifest
- **Template system**: Start from pre-built templates (video loop, shader, webpage)

### 5.3 System Integration

- **System tray**: Quick access, pause/resume, switch wallpaper
- **Auto-start**: Launch on boot (configurable)
- **Settings**: Default wallpaper, performance, hotkeys
- **Library**: Add source folders and pick files from them as wallpapers (Phase 2)

---

## 6. Dependencies

| Package | Purpose |
|---|---|
| `electron` | App shell |
| `koffi` | Native Win32 API calls via prebuilt bindings (no compiler toolchain) |
| `electron-store` | Persistent config |

### 6.1 Optional (Phase 2)

> `uuid` (wallpaper IDs) and `chokidar` (file watching/live reload) are not used in the MVP; listed here for the Phase 2 editor/library.

| Package | Purpose |
|---|---|
| `uuid` | Wallpaper IDs |
| `chokidar` | File watching (live reload in editor) |
| `sharp` | Image processing (thumbnails) |
| `fluent-ffmpeg` | Video transcoding/conversion |
| `node-webgl` | Server-side WebGL (for shader preview without display) |

---

## 7. Development Workflow

### 7.1 Commands

```bash
npm install                 # Install dependencies
npm run dev                 # Start Electron in dev mode (hot reload)
npm run build               # Build for current platform
npm run build:win           # Build Windows installer
npm run build:linux         # (Phase 3 — Linux)
npm run lint                # ESLint
npm run test                # Jest tests
```

### 7.2 Project Structure

```
src/
├── main/                   # Main process
│   ├── index.js            # Entry point
│   ├── desktop/            # Platform integration
│   │   ├── windows.js      # WorkerW injection
│   │   └── linux.js        # XRandr / layer-shell
│   ├── wallpaper-manager.js
│   └── tray.js
├── renderer/               # Renderer process (UI)
│   ├── index.html
│   ├── app.js
│   ├── components/
│   └── editor/
├── wallpaper/              # Renderer process (wallpaper window)
│   ├── index.html
│   ├── video-renderer.js
│   ├── web-renderer.js
│   └── shader-renderer.js
└── shared/                 # Shared types/constants
    └── constants.js
```

---

## 8. Phases

### Phase 1 — MVP
- [x] Electron scaffolding with main + renderer processes
- [x] Windows WorkerW injection (set wallpaper behind icons)
- [x] Video wallpaper playback (MP4/WebM)
- [x] System tray integration
- [x] Basic settings UI
- [x] Auto-pause on fullscreen

### Phase 2 — Cross-platform + Editor
- [ ] Wallpaper editor (import, preview, export)
- [ ] Web wallpaper support (HTML)
- [ ] Multi-monitor support
- [ ] Library management

### Phase 3 — Advanced
- [ ] Linux X11 support (XRandr)
- [ ] Linux Wayland support (separate native daemon)
- [ ] GLSL shader wallpapers
- [ ] Scene compositor (layers, particles)
- [ ] Marketplace / sharing
- [ ] Auto-start, scheduling

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| WorkerW breaks on Windows updates | High | Monitor Windows Insider builds, fallback to alternative methods |
| Electron overhead (RAM/CPU) | Medium | Pause on fullscreen, cap FPS, use HW accel |
| Wayland requires native code | High | Phase 3, start with X11 |
| Native addons fail to dlopen in Electron | Medium | Use `koffi` (prebuilt bindings — ffi-napi/ref-napi addons fail with `Error in native callback`) |
| NVIDIA driver quirks | Medium | Test on multiple GPU vendors, `__GL_THREADED_OPTIMIZATIONS=0` fallback |

---

## 10. Success Criteria

- Wallpaper renders behind desktop icons on Windows 10/11 and Linux X11
- Video playback uses <5% CPU when visible, ~0% when paused
- User can import a video file and set it as wallpaper in <30 seconds
- Editor allows creating a wallpaper from video + property configuration
- App starts in <2 seconds, wallpaper appears in <3 seconds
