# Sincronizar Documentação com a Implementação — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar AGENTS.md, spec, plano Phase 1 e README ao código real (koffi, WorkerW/SetParent, hotkeys, contagens de teste, roadmap) e registrar o requisito "biblioteca por pastas" como Phase 2.

**Architecture:** Mudanças exclusivamente de documentação; nenhum código é alterado. Cada task termina em commit `docs:`.

**Tech Stack:** Markdown; verificação via `npm run lint` + `npm test` + greps.

**Spec:** `docs/superpowers/specs/2026-08-26-living-wallpaper-design.md` (fonte da verdade para conteúdo das fases e do formato de wallpaper).

## Global Constraints

- Todas as mensagens de texto e de commit em pt-BR.
- Branch novo a partir de `develop`: `docs/sincronizar-docs-com-implementacao`. Sem merge local; `--no-ff` se mergido.
- `npm run lint && npm test` para commits.
- Edições de docs não tocam `src/`/`tests/`; lint/testes não devem ser afetados.

---

### Task 1: AGENTS.md — corrigir integração de desktop e roadmap

**Files:** `AGENTS.md`

- [ ] **Step 1: Criar branch de trabalho**

```bash
git checkout develop
git pull
git checkout -b docs/sincronizar-docs-com-implementacao
```

- [ ] **Step 2: Corrigir o parágrafo "Windows desktop integration"**

Hoje afirma `type: 'desktop'` e "não usa WorkerW parenting" no Windows. Substituir por: no Windows o wallpaper usa `attachWallpaperWindow` (em `src/main/desktop/windows.js`): detecta o *raised desktop* (WorkerW filho do Progman via `WS_EX_NOREDIRECTIONBITMAP`) ou o WorkerW clássico, habilita `WS_EX_LAYERED` + opacidade total, converte DIP→pixels físicos, `SetParent` + `SetWindowPos` com offset `MapWindowPoints`. `type: 'desktop'` é setado **apenas fora do Windows** (`wallpaper-manager.js:50-52`).

- [ ] **Step 3: Corrigir o gotcha "re-parented não compõe"**

Substituir por: um filho re-parentado só compõe quando `WS_EX_LAYERED` + opaco (alpha 255) — já tratado em `attachWallpaperWindow`. Manter o gotcha de `desktopCapturer`. Adicionar nota: re-attach após restart do explorer (`WM_TASKBARCREATED`) **não implementado** (existem só `resetLayerCache`/`ensureAttachedToDesktop`).

- [ ] **Step 4: Alinhar roadmap**

Phase 2 = Wallpaper editor, Web wallpapers, Multi-monitor, Library (adicionar pastas → escolher arquivo como wallpaper). Adicionar seção Phase 3 = Linux X11 (XRandr), Linux Wayland, GLSL shaders, Scene compositor, Marketplace/sharing, Auto-start/scheduling. Remover "Linux X11" e "GLSL shader wallpapers" da Phase 2.

- [ ] **Step 5: Verificar**

```bash
npm run lint && npm test
grep -rn "does NOT use WorkerW\|ffi-napi" AGENTS.md   # sem ocorrências residuais
```

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs: alinhar AGENTS.md ao caminho de integração de desktop implementado"
```

---

### Task 2: Spec — refletir a implementação do MVP

**Files:** `docs/superpowers/specs/2026-08-26-living-wallpaper-design.md`

- [ ] **Step 1: §2.1 (linha 24) e §3.4 (rótulo no diagrama)** — trocar `ffi-napi` → `koffi`.

- [ ] **Step 2: §5.1 auto-pause (linha 198)** — a linha do Windows usa `_NET_WM_STATE_FULLSCREEN` (atributo do X11). Substituir por: polling `EnumWindows` a cada 2s; fullscreen heurístico = janela visível sem `WS_CAPTION` e com `WS_MAXIMIZE` (ver `fullscreen-detector.js:16-26`). Manter o `_NET_WM_STATE` na linha do Linux X11.

- [ ] **Step 3: §3.1 "Known issues"** — marcar o `WM_TASKBARCREATED` (re-parent após restart do explorer) como *não implementado*; manter os demais (DWM, layered/opaque, desktopCapturer).

- [ ] **Step 4: §4 (linha 141)** — adicionar nota de status: *"Target format for the Phase 2 editor/library. MVP persists a raw video path (`config.wallpaper` = string, via drag-and-drop nas settings)."*

- [ ] **Step 5: §4.1 (linha 168)** — anotar `pauseOnBattery` (e `fps`/`startMinimized` no `DEFAULT_CONFIG`) como *"persisted in config but not yet wired in the MVP"*.

- [ ] **Step 6: §5.1 (linhas 204-205)** — anotar "Schedule" e "Performance profiles" como *"not scheduled — Phase 3 candidate"*.

- [ ] **Step 7: §6 (linhas 227-234)** — trocar linha `ffi-napi`/`ref-napi` → `koffi` (bindings nativos prebuilt, sem toolchain); manter `electron-store`; remover `uuid`/`chokidar` (não usados) ou movê-los para §6.1.

- [ ] **Step 8: §7.1 (linha 255)** — remover `build:linux` ou anotá-lo como *"(Phase 3 — Linux)"*.

- [ ] **Step 9: §5.3 Library (linha 221)** — reformular para "add source folders → pick files as wallpaper".

- [ ] **Step 10: Verificar**

```bash
grep -rn "ffi-napi\|build:linux" docs/superpowers/specs/2026-08-26-living-wallpaper-design.md
npm run lint && npm test
```

- [ ] **Step 11: Commit**

```bash
git add docs/superpowers/specs/2026-08-26-living-wallpaper-design.md
git commit -m "docs(spec): refletir implementação do MVP"
```

---

### Task 3: Plano Phase 1 — seção de desvios + fechar Task 10

**Files:** `docs/superpowers/plans/2026-08-26-phase1-mvp.md`

- [ ] **Step 1: Adicionar seção "Post-implementation deviations"**

Após "Global Constraints", antes de "## File Structure". Documentar o que divergiu do desenho original (os trechos de código do plano são históricos; a fonte da verdade é o `src/` atual):
  - `ffi-napi`/`ref-napi` → **`koffi`** em todas as tasks nativas (motivo em spec §2.2 / AGENTS.md);
  - `config.js`: `new Store()` síncrono → **`init()` assíncrono** (Task 2);
  - `windows.js`: API `getWorkerW`/`setParentToWorkerW` → **`getLayout`/`attachToDesktopLayer`/`attachWallpaperWindow`/`findWallpaperWorkerW`** + raised desktop, `MapWindowPoints`, pixels físicos (Task 3);
  - `wallpaper-manager.create()`: `show:false` + `backgroundColor:#000000`, `type:'desktop'` só fora do Windows, HWND via `BigUInt64LE`, `disableRoundedCorners`, buffer de wallpaper pendente (`isReady`/`pendingWallpaper`) (Task 6);
  - **`hotkeys.js` implementado mas ausente no plano** (Task 9) — hotkey `Ctrl+Shift+W`;
  - `index.js` extras: `await config.init()`, checagem `fs.existsSync` + notificações, `lw:wallpaper-error`, injeção de `showSettings` no tray (Task 9);
  - `fullscreen-detector` via koffi (`__stdcall EnumWindows`) (Task 4).

- [ ] **Step 2: Task 10 Step 3 e Step 5**

Marcar `[x]`, com a nota *(verificado por cobertura automatizada — suítes `fullscreen-detector`)* na Step 3.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-26-phase1-mvp.md
git commit -m "docs(plan): documentar desvios da implementação e fechar smoke test"
```

---

### Task 4: README — dependências, roadmap e estrutura

**Files:** `README.md`

- [ ] **Step 1: Requirements (linha 18)** — remover "Python + build tools (for ffi-napi native compilation)"; anotar que o `koffi` é prebuilt (sem toolchain).

- [ ] **Step 2: Contagem de testes (linha 54)** — rodar `npm test` e substituir "8 tests, 3 suites" pelos números reais (AGENTS.md indica 45/8; confirmar).

- [ ] **Step 3: "How It Works → Desktop integration" (linha 88)** — trocar "via `ffi-napi`" → "via `koffi`"; descrever o anexo ao WorkerW filho (raised desktop) com `WS_EX_LAYERED`.

- [ ] **Step 4: Tech Stack (linhas 108-113)** — `ffi-napi` → `koffi`; tirar o link errado de ffi-napi.

- [ ] **Step 5: Project Structure (linhas 66-84)** — adicionar `hotkeys.js` sob `src/main/`.

- [ ] **Step 6: Roadmap (linhas 94-105)** — alinhar com a spec: mover "Linux X11 support (XRandr/EWMH)" da Phase 2 para a Phase 3; Phase 2 = editor, web, multi-monitor, library; Phase 3 = Linux X11, Wayland, GLSL, scene.

- [ ] **Step 7: Verificar** — `grep -rn "ffi-napi\|8 tests\|3 suites\|Linux X11" README.md` para confirmar o estado desejado; `npm run lint && npm test`.

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs: sincronizar README com a implementação"
```

---

### Task 5: Verificação final de consistência

- [ ] **Step 1:** `npm run lint && npm test` — green.
- [ ] **Step 2:** grep global de termos obsoletos (nenhuma ocorrência fora de notas históricas do plano Phase 1): `ffi-napi`, `ref-napi`, `build:linux` no package.json (não existe).
- [ ] **Step 3:** grep "Linux X11" — presente apenas em spec §3.2/§8 Fase 3, AGENTS.md Phase 3 e README Phase 3.
- [ ] **Step 4:** Confirmar que `docs/superpowers/plans/2026-08-28-multi-monitor.md` (já aderente) não precisa de mudanças; as referências de linha (`index.js:27`, koffi-mock) permanecem válidas pois o código não mudou.
- [ ] **Step 5:** commit final somente se houver ajustes: `docs: ajustes finais de consistência`.

---

## Summary

| Task | Deliverable | Commit |
|------|------------|--------|
| 1 | AGENTS.md coerente com o caminho de integração e roadmap | `docs: ...` |
| 2 | Spec reflete MVP (koffi, heurística fullscreen, notas de status) | `docs(spec): ...` |
| 3 | Plano Phase 1 com desvios documentados + smoke test fechado | `docs(plan): ...` |
| 4 | README sincronizado (deps, testes, roadmap, estrutura) | `docs: ...` |
| 5 | Verificação final (lint, tests, greps) | se necessário |