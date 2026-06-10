# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AutoDump — a static, single-file HTML dashboard demonstrating RL-based dump placement for autonomous Cat 793 mining trucks (Caterpillar Innovation Challenge 2026). There is no build step, no package manager, no test framework. The entire app (CSS, JS, trained Q-table, training history, polygon math, token broker, packer) is embedded inline in one HTML file.

- **Live entry point:** `site/indexV4.html` (~3,100 lines). This is the file you edit.
- `older versions/` holds previous standalone builds (`index v1.html` … `index_v3.0.3.html`) for reference only — new versions are created as new files rather than overwriting.
- `references/`, `archive/`, `.offline-markdown-preview/` are reference material, not live code.
- `graphify-out/` contains a generated knowledge graph of the repo (see `graphify-out/GRAPH_REPORT.md`).

## Running locally

Open `site/indexV4.html` directly in a browser, or serve it to avoid cache issues:

```bash
cd site/
python3 -m http.server 8000
```

The only network dependency is Google Fonts (system-font fallback if offline).

## Deployment

GitHub Pages deploys `./site` automatically on every push to `main` via `.github/workflows/pages.yml`. Live URL: https://preethikakumaravel.github.io/autodump_caterpillar/site/indexV4.html

## Git workflow — changelog enforcement (important)

This clone has `core.hooksPath = config/git-hooks`. The `pre-commit` hook **blocks any commit** that changes files other than `docs/CHANGELOG.md`, `.gitignore`, or `config/git-hooks/*` unless `docs/CHANGELOG.md` is also staged.

So for every code/layout/workflow change:
1. Add a dated entry to `docs/CHANGELOG.md` describing the change.
2. Stage it together with the change, then commit. (Alternatively `git ccommit "message"` runs `config/sync-commit.ps1` and commits whatever is staged.)

Companion convention (enforced by project agent rules in `.github/agents/docs-maintainer.agent.md`):
- `docs/CHANGELOG.md` — dated entry after every meaningful change.
- `docs/TESTING.md` — entry after every test/validation run: exact command or manual action, expected vs actual, status. Never invent results.

## Architecture of `site/indexV4.html`

A multi-page SPA in one file. Pages are `<section>` blocks toggled by `nav(page)` / `onPageEnter(page)`; pages cover Problem Statement, Zone Decomposition, Live RL Simulation, ML Training Results, Before vs After, Token Protocol, Custom Field (judge draws a polygon), and Architecture.

The JS is organized into banner-commented sections (search `// ====`):

- **Constants & global state** — `TRUCK_MODELS`, the single `STATE` object, field dimensions (`FIELD_W`/`FIELD_H`, `GRID_RES`).
- **Polygon geometry** — `pip` (point-in-polygon), `polyArea`, `polyPerim`, `buildMask` (rasterized occupancy mask).
- **Scale conversion** — `getScale`, `logicalToMetres` etc.; canvas units are logical metres.
- **Zone decomposition** — `buildZones` (sweep-line with sliver merge), `splitPolygonByPathways` / `clipPolyHalfplane` for pathway splitting, `laneRoute` for routing.
- **Dump packing** — hex-lattice packing via `buildHexSpots` / `hexDumpsInZone` (this replaced the older greedy `greedyDumpsInZone`), `boustrophedonOrder` for visit order.
- **Rendering** — per-page canvas drawing (`fit`, `drawSite`, `drawGrid`), site editor click handlers (`siteOnClick`, `setMode`).
- **Fleet & planning pages** — fleet table CRUD (`fleetAddRow` …), Gantt rendering (`renderGantt`), `renderPlanPage`.

The trained Q-table and training history are embedded as inline JS data — they are results of offline training, not computed in the browser (the full Python trainer lives in a separate repo).
