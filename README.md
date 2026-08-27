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
- Node.js >= 20
- npm >= 10
- Python + build tools (for ffi-napi native compilation)

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
| `npm test` | Run Jest tests (8 tests, 3 suites) |
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

**Desktop integration** — The app creates a decorationless `BrowserWindow` and parents it to a `WorkerW` layer using Win32 API calls via `ffi-napi`. This places the wallpaper behind desktop icons but visible on screen.

**Fullscreen detection** — Every 2 seconds, `EnumWindows` is called to check for maximized windows without captions (typical fullscreen behavior). When detected, the wallpaper pauses to save resources.

**IPC architecture** — All communication uses Electron IPC with `lw:`-prefixed channels. The main process orchestrates the wallpaper lifecycle, config, tray, and fullscreen detection. Renderer processes handle UI and video playback.

## Roadmap

### Phase 2
- Linux X11 support (XRandr/EWMH)
- Wallpaper editor (import, preview, export)
- Web wallpaper support (HTML/CSS/JS)
- Multi-monitor support

### Phase 3
- Linux Wayland support (separate native daemon via wlr-layer-shell)
- GLSL shader wallpapers
- Scene compositor (layers, particles)

## Tech Stack

- [Electron](https://www.electronjs.org/) — App shell
- [ffi-napi](https://github.com/node-ffi-napi/node-ffi-napi) — Win32 API calls
- [electron-store](https://github.com/sindresorhus/electron-store) — Config persistence
- [Jest](https://jestjs.io/) — Testing
- [ESLint](https://eslint.org/) — Linting (flat config)

## License

MIT
