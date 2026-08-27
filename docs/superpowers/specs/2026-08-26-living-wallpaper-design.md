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
├── Desktop Integration (Win32 / Linux APIs via ffi-napi)
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
| Native API calls | `ffi-napi` | Direct Win32/Linux API access without native addons |
| Video playback | `<video>` tag with HW accel | Electron's Chromium supports VA-API/DXVA natively |
| Web wallpapers | `<webview>` tag | Isolation, performance, GPU process separation |
| Shader rendering | `<canvas>` WebGL | Direct GLSL support via Chromium |
| Config storage | JSON file in `app.getPath('userData')` | Simple, portable |
| Wallpaper format | Directory with `manifest.json` | Self-contained, easy to share |

---

## 3. Desktop Integration

### 3.1 Windows — WorkerW Injection

**Technique:** Place the wallpaper BrowserWindow behind desktop icons using the Progman/WorkerW trick.

```javascript
// Pseudocode — ffi-napi calls to Win32
const user32 = ffi.Library('user32.dll', {
  'FindWindowW': ['int', ['string', 'string']],
  'SendMessageW': ['int', ['int', 'int', 'int', 'int']],
  'SetParent': ['int', ['int', 'int']],
  'FindWindowExW': ['int', ['int', 'int', 'string', 'string']],
});

// 1. Find Progman
const progman = user32.FindWindowW('Progman', null);

// 2. Send message to create WorkerW layer
user32.SendMessageW(progman, 0x052C, 0, 0);

// 3. Find the new WorkerW
const workerW = user32.FindWindowExW(null, null, 'WorkerW', null);

// 4. Parent our window to WorkerW
user32.SetParent(wallpaperWin32Handle, workerW);
```

**Known issues:**
- DWM (Desktop Window Manager) may interfere on some Windows builds
- Must re-parent on explorer.exe restart (shell restart detection via `WM_TASKBARCREATED`)
- Multi-monitor: create one BrowserWindow per display, parent each to WorkerW

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
    │ (ffi-napi)  │      │ (separate bin) │
    └─────────────┘      └────────────────┘
```

---

## 4. Wallpaper Format

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
    "pauseOnBattery": true
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
  - Windows: `EnumWindows` + check `_NET_WM_STATE_FULLSCREEN`
  - Linux X11: `_NET_WM_STATE` atom check
- **Multi-monitor**: Independent wallpaper per display
- **Loop playback**: Seamless video looping with no gap
- **Volume control**: Per-wallpaper audio (default: muted)
- **Hotkey**: Quick toggle pause/play
- **Schedule**: Time-based wallpaper switching
- **Performance profiles**: Low/Medium/High (cap FPS, resolution)

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
- **Library**: Browse and manage installed wallpapers

---

## 6. Dependencies

| Package | Purpose |
|---|---|
| `electron` | App shell |
| `ffi-napi` | Native API calls (Win32, Linux X11) |
| `ref-napi` | Buffer/ref types for ffi |
| `electron-store` | Persistent config |
| `uuid` | Wallpaper IDs |
| `chokidar` | File watching (live reload in editor) |

### 6.1 Optional (Phase 2)

| Package | Purpose |
|---|---|
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
npm run build:linux         # Build Linux AppImage/deb
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
- [ ] Linux X11 support (XRandr)
- [ ] Wallpaper editor (import, preview, export)
- [ ] Web wallpaper support (HTML)
- [ ] Multi-monitor support
- [ ] Library management

### Phase 3 — Advanced
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
| `ffi-napi` build issues | Medium | Use `@aspect-build/ffi-napi` or prebuild binaries |
| NVIDIA driver quirks | Medium | Test on multiple GPU vendors, `__GL_THREADED_OPTIMIZATIONS=0` fallback |

---

## 10. Success Criteria

- Wallpaper renders behind desktop icons on Windows 10/11 and Linux X11
- Video playback uses <5% CPU when visible, ~0% when paused
- User can import a video file and set it as wallpaper in <30 seconds
- Editor allows creating a wallpaper from video + property configuration
- App starts in <2 seconds, wallpaper appears in <3 seconds
