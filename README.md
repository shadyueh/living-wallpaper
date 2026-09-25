# Living Wallpaper

Animated desktop wallpaper player for Windows. Renders video wallpapers behind your desktop icons using WorkerW injection.

## Features

- **Video wallpaper playback** — MP4/WebM files rendered as fullscreen background behind desktop icons
- **Auto-pause** — Wallpaper pauses automatically when a fullscreen app or game is detected (~0% CPU/GPU usage)
- **System tray** — Quick controls: pause/resume, open settings, quit
- **Settings UI** — Drag-and-drop video import, volume, speed, fullscreen behavior
- **Hardware-accelerated** — Uses Electron's Chromium video decoding with DXVA2/VA-API

## Requirements

- Windows 10 build 1903+ or Windows 11
- Node.js >= 22.12.0
- npm >= 10

Electron 44 includes its own Node.js runtime.

Native Win32 calls run through `koffi`, which ships prebuilt bindings — no compiler toolchain or Python build tools required.

## Installation

```bash
git clone <repo-url>
cd living-wallpaper
npm install
```

## Usage

```bash
npm start          # Start the app
npm run dev        # Start in dev mode
```

1. Click the system tray icon (bottom-right corner)
2. Select **Settings**
3. Drop a video file (MP4, WebM) onto the drop zone
4. The video appears as your desktop background behind icons

### Controls

- **System tray** — Pause/resume wallpaper, open settings, quit
- **Settings UI** — Adjust volume, speed, fullscreen behavior

## Development

### Commands

| Command | Description |
|---|---|
| `npm start` | Start the app normally |
| `npm run dev` | Start in dev mode |
| `npm run lint` | Run ESLint |
| `npm test` | Run Jest tests (97 tests, 10 suites) |
| `npm run build` | Build for current platform |
| `npm run build:win` | Build Windows installer |

### Lint + Test (required before commits)

```bash
npm run lint && npm test
```

### Project Structure

```
src/
├── main/                      # Main process
│   ├── index.js               # Entry point, IPC wiring, app lifecycle
│   ├── config.js              # electron-store wrapper
│   ├── wallpaper-manager.js   # Creates/manages wallpaper BrowserWindow
│   ├── fullscreen-detector.js # Auto-pause on fullscreen
│   ├── hotkeys.js             # Global shortcut (Ctrl+Shift+W)
│   ├── tray.js                # System tray
│   └── desktop/
│       └── windows.js         # WorkerW injection (Win32 API)
├── renderer/                  # Settings UI window
│   ├── index.html
│   └── app.js
├── wallpaper/                 # Wallpaper BrowserWindow
│   ├── index.html
│   └── video-renderer.js
└── shared/
    └── constants.js           # IPC channels, defaults
```

### How It Works

**Desktop integration** — The app creates a decorationless `BrowserWindow` and attaches it to the desktop layer — the child `WorkerW` of Progman (raised desktop) or the classic `WorkerW` — via Win32 API calls through `koffi`. It enables `WS_EX_LAYERED` + full opacity before re-parenting, so DWM composites the wallpaper behind the desktop icons. This places the wallpaper behind desktop icons but visible on screen.

**Fullscreen detection** — Every 2 seconds, `EnumWindows` is called via koffi to check for maximized windows without captions (typical fullscreen behavior). When detected, the wallpaper pauses to save resources.

**IPC architecture** — All communication uses Electron IPC with `lw:`-prefixed channels. The main process orchestrates the wallpaper lifecycle, config, tray, and fullscreen detection. Renderer processes handle UI and video playback.

## Roadmap

### Phase 2
- Wallpaper editor (import, preview, export)
- Web wallpaper support (HTML/CSS/JS)
- Multi-monitor support
- Library management (source folders)

### Phase 3
- Linux X11 support (XRandr/EWMH)
- Linux Wayland support (separate native daemon via wlr-layer-shell)
- GLSL shader wallpapers
- Scene compositor (layers, particles)
- Marketplace / sharing
- Auto-start / scheduling

## Tech Stack

- [Electron](https://www.electronjs.org/) — App shell
- [koffi](https://koffi.dev) — Win32 API calls (prebuilt bindings)
- [electron-store](https://github.com/sindresorhus/electron-store) — Config persistence
- [Jest](https://jestjs.io/) — Testing
- [ESLint](https://eslint.org/) — Linting (flat config)

## License

MIT
