# Living Wallpaper — Multi-Monitor Support Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-08-28
**Status:** Draft (not yet implemented — Phase 2 roadmap)

**Goal:** Let the user choose, per Wallpaper layout, to **extend one wallpaper across all displays** or **assign an independent wallpaper to each monitor**.

**Spec:** `docs/superpowers/specs/2026-08-26-living-wallpaper-design.md` (§3.1 Windows geometry, §5.1 multi-monitor)

## Baseline (already implemented in Phase 1 / fix branch)

- `src/main/wallpaper-manager.js` holds a single `wallpaperWindow`, created for one display. Since the **monitor-target feature**, the display is chosen by the user (`config.targetDisplayId`) or falls back to primary via `resolveTargetDisplay(screen, id)` in `src/main/display-utils.js` (which also provides `serializeDisplays` for the settings UI). Single wallpaper window.
- `src/main/desktop/windows.js` `attachWallpaperWindow(childHandle, display)` already:
  - detects the **raised desktop** (Win11 24H2+, `WS_EX_NOREDIRECTIONBITMAP` on Progman) and targets the **child WorkerW of Progman** (classic layout fallback included);
  - converts DIP bounds to **physical pixels** via `display.scaleFactor`;
  - translates the display origin into the layer's coordinate space with `MapWindowPoints(0, layer, pt, 1)`;
  - reads the layer's full covering rectangle via `GetWindowRect(layer)` (reference for "extend to all").
- Native calls via **koffi** only.

## Key topology fact

On raised desktop builds (24H2+ / build 26200) there is a **single child WorkerW of Progman covering the entire virtual desktop** — there is NOT one WorkerW per monitor. Therefore:
- **Extend mode:** one BrowserWindow sized to `GetWindowRect(layer)` (whole virtual desktop).
- **Per-monitor mode:** one BrowserWindow per `display`, each sized to its own physical bounds and offset via `MapWindowPoints` — all parented to the *same* WorkerW.

---

## Config / data model

Evolve `DEFAULT_CONFIG` in `src/shared/constants.js` (current: `wallpaper: null`) without breaking existing saved configs (migration).

```
DEFAULT_CONFIG = {
  multiMonitorMode: 'extend',        // 'extend' | 'per-monitor'
  wallpapers: {},                     // { [displayId]: { path, volume, speed } }  (per-monitor)
  wallpaper: null,                    // current single (extend) wallpaper, kept for back-compat
  ...
}
```

- `displayId` — stable id per display (e.g. Electron `display.id`; persist mapping from `screen.getAllDisplays()`).
- Migration: if `wallpaper` set and `multiMonitorMode` was not explicitly chosen, treat `extend` (single path applies to all).

---

## IPC surface

Add channels in `src/shared/constants.js` (all `lw:` prefixed):
- `lw:set-multi-monitor-mode` → `multiMonitorMode`
- `lw:set-monitor-wallpaper` → `{ displayId, wallpaper:{path,volume,speed} }`
- `lw:get-monitors` → list of `{ id, name, bounds, primary }` for the settings UI

---

## File structure changes

```
src/main/
├── wallpaper-manager.js      # createPerMonitor(): loop getPrimaryDisplay→getAllDisplays; manager holds Map<displayId, window>
├── index.js                  # call createPerMonitor(); route new IPC to manager
└── desktop/
    └── windows.js            # extend "extend mode" sizing via GetWindowRect(layer); expose geometry helpers for tests
src/shared/constants.js       # new IPC channels + config keys
src/renderer/                 # settings UI: mode selector + per-monitor wallpaper picker
tests/
├── helpers/koffi-mock.js     # MapWindowPoints already mocked; add any new decl handlers
├── main/wallpaper-manager.test.js
└── main/desktop-integration.test.js
```

---

### Task 1: Config schema + migration

**Files:** `src/shared/constants.js`, `src/main/config.js`, `tests/main/config.test.js`

- [ ] **Step 1:** Add `multiMonitorMode`, `wallpapers` to `DEFAULT_CONFIG`; add new IPC channels.
- [ ] **Step 2:** Failing tests for default + set/get + migration (legacy `wallpaper` → `extend`).
- [ ] **Step 3:** Implement migration in `config.js` (on load, backfill `multiMonitorMode`).
- [ ] **Step 4:** Tests pass (`npx jest tests/main/config.test.js`).
- [ ] **Step 5:** Commit `feat: schema de configuração de multi-monitor com migração`.

### Task 2: Wallpaper manager — per-display windows

**Files:** `src/main/wallpaper-manager.js`, `tests/main/wallpaper-manager.test.js`

- [ ] **Step 1:** Replace single `wallpaperWindow` with `Map<displayId, BrowserWindow>`.
- [ ] **Step 2:** `createPerMonitor(displays)` — create one window per display, each calling `attachWallpaperWindow(hwnd, display)` (already handles per-display physical bounds + `MapWindowPoints` offset).
- [ ] **Step 3:** `extend` mode — create a single window sized to `GetWindowRect(layer)` (add a `windows.js` helper, e.g. `layerBounds()`).
- [ ] **Step 4:** Route existing IPC (set/pause/resume/volume/speed) to all windows; per-monitor variants target a specific displayId.
- [ ] **Step 5:** Failing→passing tests (koffi-mock: `layerBounds`/`GetWindowRect` already present).
- [ ] **Step 6:** Commit `feat: gerenciar uma janela de wallpaper por monitor`.

### Task 3: Main process wiring

**Files:** `src/main/index.js`

- [ ] **Step 1:** Call `createPerMonitor(screen.getAllDisplays())` and apply saved `wallpapers` config.
- [ ] **Step 2:** Add IPC handlers: `lw:set-multi-monitor-mode`, `lw:set-monitor-wallpaper`, `lw:get-monitors`.
- [ ] **Step 3:** Commit `feat: integrar modo multi-monitor no processo principal`.

### Task 4: Settings UI

**Files:** `src/renderer/index.html`, `src/renderer/app.js`

- [ ] **Step 1:** Add a mode selector (`extend` / `per-monitor`) and, in per-monitor mode, a wallpaper field per detected display.
- [ ] **Step 2:** Wire IPC and update on change.
- [ ] **Step 3:** Commit `feat: UI de configuração de wallpaper por monitor`.

### Task 5: Verification

- [ ] **Step 1:** `npm run lint` and `npm test` green.
- [ ] **Step 2:** Manual: two monitors, choose "extend" → one video across both; choose "per-monitor" → different video per monitor, each behind icons and filling its screen.

---

## Summary

| Task | Deliverable |
|------|------------|
| 1 | Config schema + migration |
| 2 | Per-display wallpaper windows (extend/per-monitor via `windows.js` geometry) |
| 3 | Main process IPC wiring |
| 4 | Settings UI |
| 5 | Verification (lint, tests, manual 2-monitor test) |
