# Changelog

## Commit Description (for commit message)

**Subject:** Update CHANGELOG for v3.0.3 release

- Document v3.0.3: replaced greedy grid with hex-spot generation (`hexDumpsInZone` → `buildHexSpots`).
- Restored Live Ops simulation and updated ops rendering (hex-spot states, zone labels); removed heatmap overlay.
- UI/branding redesign: switched to light "AutoDump" theme and replaced font with Arial; updated logo, favicon, and tab title.
- Deployment & site reorganization: moved deployable site into `site/`, renamed entry to `index.html`, and updated docs/workflow.
- Integrated tilt simulator visuals and consolidated client-side modules into the deployable bundle.
- Git tooling: added hooks and updated `config/sync-commit.ps1` to stop auto-editing the changelog.
- Minor editorial and formatting fixes to documentation.

## Summary (latest changes)

- README fix: repointed the deployed link to the GitHub Pages root so it opens the published app again.
- Deployment fix: restored a `site/index.html` entry file so GitHub Pages opens the app from the repository root again.
- UI/Branding: switched to a light Caterpillar theme; replaced `Barlow Condensed` with `Arial`; updated logo, favicon, and tab title to "AutoDump".
- Site entry: renamed main entry to `index.html` and moved deployable site into `site/`.
- Layout/graphics: removed scanline background; converted the three-layer architecture SVG into a responsive HTML/CSS flex layout.
- Workspace reorg: moved deploy files into `site/`, docs into `docs/`, and archived older assets into `archive/`.
- Deployment/docs: updated `docs/DEPLOY.md` and GitHub Pages workflow to publish from `./site`.
- Tilt simulator: integrated the interactive tilt pile simulator into the About/Method page (visual layer only).
- Git hooks & automation: added hooks in `config/git-hooks/`, `config/setup-git-hooks.ps1`, and `config/sync-commit.ps1` with `git ccommit` alias.
- Updated `config/sync-commit.ps1` to stop auto-editing `docs/CHANGELOG.md`; the helper now commits staged files as-is unless intentionally updated.
- Verification: confirmed edits pass `git diff --check`.

- Added `graphify-out/` cache directory (AST + semantic caches) to improve codebase search and analysis; installed graphify-out artifacts for faster workspace queries.

- Editorial: minor wording and formatting fixes to `CHANGELOG.md` to validate commit flow (test edit).

## 2026-06-11 — Priority-weighted assignment + live-sim robustness (`site/indexV4.html`)

Fixes the two reported production blockers: (1) most zones landing on a single truck, starving the rest and deadlocking Live Operations; (2) trucks orbiting one point forever / the sim never completing. Zone geometry (T-015) and the LPT-on-dump-counts concept (T-016) are untouched — only the assignment *policy* and the simulation's failure handling changed.

### Assignment — every truck participates, weighted by priority
- Removed the big/small payload gate (`payload >= 0.85 × max`) as the assignment pool. With a mixed fleet (e.g. 1× Cat 797 + 3× Cat 785) it left a single "big" truck, so the LPT loop had one candidate and assigned it EVERY zone while the small trucks waited for gap dumps that often never existed.
- New top-level `assignZonesWeighted(zones, trucks, costOf, weightOf, entryXY)`: same LPT + 8% slack + nearest-centroid tie-break as before, but over the whole fleet with loads normalised by `truckWeight(t)`.
- Zone cost = expected dump count for that truck's radius in that zone, computed exactly per distinct radius on throwaway grids (`estByRadius`). Each dump costs the same 2.5 sim-min regardless of radius, so raw dump count is the workload.
- New per-truck **Priority** column in the fleet table (0.1–10, default 1; `truckWeight` clamps and is backward compatible with saved fleets). Weight 2 ≈ double share. Changing priority with an existing plan stops any running sim and re-plans immediately. Priority is also shown in the plan assignments table.
- PASS 1 now generates each zone's spots with its assigned truck's own dump radius (deterministic zone order, shared `filled` grid); finer-radius trucks still gap-sweep in PASS 2 (gap loads weight-normalised); exit bookends moved after PASS 2. `orderZonesNearestNeighbour` extracted as a top-level helper. Dead `allHexSpots` accumulation deleted.

### Live simulation — deadlock-free and self-healing
- **Token lifecycle** (`grantToken` / `releaseToken` / `releaseTokensHeldBy` / `brokerTick`): tokens carry a `heartbeat`; the broker revokes tokens whose holder is finished/stopped/missing or idle on the token for > `TOKEN_TTL_MIN` (6 sim-min) without dumping in that zone — the supervisor-revocation the token protocol documented but never had. Finishing a route now releases all held tokens (previously a finished holder kept its zone locked forever). Fixed the dead acquire-log (`if (tok.holder !== tr.id)` after assignment was always false).
- **Queued trucks no longer freeze**: `deferLockedZone` moves the locked zone's waypoint run behind the truck's remaining work (max 2 defers per zone) so it keeps dumping elsewhere and returns later; if nothing else is left it waits in the FIFO queue, which now actually drains via heartbeat/zone-complete releases.
- **Per-zone completion**: `ops.zoneRemaining` (built in `opsReset` via new `zoneAt(x,y)` helper) decrements per dump; a finished zone logs "Z<n> complete" and force-releases its token.
- **Orbit fix**: split arrival radii — transit waypoints accept at `1.05 × turning radius` (a transit point can no longer sit inside the turning circle), dump waypoints stay tight; plus `stuckWatchdog` — no progress toward the current waypoint for `STUCK_RECOVER_MIN` (2 sim-min) pivots the truck straight at the target (three-point-turn recovery).
- **Adaptive rebalance**: a truck that runs out of waypoints steals the farthest untouched zone block from the busiest remaining truck (`stealableZoneBlocks` / `rebalanceIdleTruck`, threshold `REBALANCE_MIN_DUMPS` = 6), routes there via `laneRoute`, and updates `assignments`/`truckZones` so all dashboards stay live.
- **Stuck 'active' spots**: spots marked active now carry an `owner`; `resetActiveSpots` reverts them to empty on defer/release/finish so other trucks can claim them.
- **Progress bar synced to real completion**: bar and label now show `placed / totalPlannedDumps` dumps each tick (was: coverage ÷ projected coverage, which desynced from the log); `ops-canvas-sub` shows the same count; sim also ends when all planned dumps are placed, releasing any leftover tokens. All token/defer/rebalance/watchdog events flow through the existing event log and V2V feed in the same tick.
- Removed the dead `<script src="hexpack_engine.js">` tag (the packer was inlined long ago; the file no longer exists and 404'd on every load).

### Validation
- New `tests/live_sim_completion.mjs`: extracts the real functions out of the page (brace-counted slices, vm sandbox, stubbed DOM) and drives `opsTick` headlessly. 14/14 assertions pass — see `docs/TESTING.md` T-017/T-018.
- `tests/zone_decomp_validation.mjs` still passes (18/18); all 3 inline script blocks parse.

## 2026-06-11 — Enterprise UI redesign, CSS-only (`site/indexV4.html`)

Visual refresh of the whole console; no markup, JS, layout-structure, or workflow changes — all class names, IDs, and CSS variable names preserved (inline styles and JS-injected HTML depend on them).

### Design system
- Split the Cat-yellow token: `--cat` is now a readable dark amber (`#9E7C00`) for text on light surfaces; new `--cat-bright` (`#FFCD11`) carries true Cat yellow on solid surfaces (primary buttons, active nav marker, workflow chip, accent bars). Fixes the yellow-on-white contrast problem throughout.
- New neutral scale (`#101828`/`#344054`/`#667085` text, `#E4E7EC`/`#D0D5DD` borders), tokenized shadows (`--shadow-xs/sm/md`), `--frame`/`--terminal` dark-surface tokens.
- Typography: body switched Inter → Barlow; display headings (page titles, section titles, brand) use Barlow Condensed uppercase; numeric readouts use JetBrains Mono with `tabular-nums`.

### Chrome & components
- Dark graphite top bar and footer with 3px Cat-yellow rule — command-center frame around a light workspace; workflow steps restyled as chips (current = solid yellow).
- Sidebar: rounded nav items, active state = white card + yellow edge bar + yellow step number; completed steps green.
- Content area: subtle 28px engineering-grid background; staggered page-enter animation; `prefers-reduced-motion` support.
- Cards: white on grey workspace, yellow tick before each card title (replaces yellow title text), hairline header rule, soft shadow; removed hover "lift" gimmick.
- Buttons: primary is now solid Cat yellow with dark text; secondary/success/danger refined; press = 1px translate.
- Canvases, event log, and `pre` blocks restyled as dark terminal/radar bezels (matches the dark canvas fill the JS already uses); log line colors brightened for the dark background.
- Tables, inputs (yellow focus ring), KPI tiles (color classes now actually applied), progress bars (single-hue yellow fill), alerts (left accent border), Gantt segments refreshed.
- `.dash` fleet-command pages aligned to the same tokens; supervision camera feeds now render as dark feeds with scoped text-color overrides.
- Responsive: `.grid-4` collapses at 1280px, `.grid-2/3` and narrower sidebar at 980px.

## 2026-06-11 — Zone Decomposition geometry rewrite (`site/indexV4.html`)

### Exact scanline geometry (replaces grid sampling)
- Added `scanlineSpans(V, y)`: exact polygon-edge intersections at a horizontal line, returning disjoint x-intervals — replaces the old 0.4-unit `pip()` grid sampling inside `polyXRange`.
- Added `stripSpans(V, y0, y1)`: unions scanline spans across 7 interior rows of a strip, keeping disjoint lobes separate. `polyXRange` is now a thin wrapper over it.
- Added `zoneInsideFrac(V, x0, x1, y0, y1)`: 10×4 sample estimate of how much of a zone rect is actually inside the polygon.
- Added `cleanPoly(V)`: strips duplicate consecutive vertices, explicit closing vertex, and collinear points from clipping output.

### `buildZones` rewrite
- Equal-height strips via `nStrips = round(span / truckWidth)` instead of fixed-width strips plus a leftover sliver; the sliver-merge pass is gone.
- One zone per disjoint x-span per strip: concave gaps (U-shapes) and disconnected lobes no longer get bridged by a single rectangle.
- Zone `area` is now the effective in-polygon area (`rect × insideFrac`); zones also carry `insideFrac` and a `narrow` flag (span < truckWidth).
- Deterministic zone ordering (bottom-to-top, left-to-right) and guard against non-positive `truckWidth`.

### `splitPolygonByPathways` hardening
- Skips null/zero-length pathway segments instead of crashing.
- Drops clipping fragments below 0.05% of the field area (`MIN_FRAG`).
- A cut that produces no valid pieces can no longer wipe out all regions (`if (next.length) regions = next`).
- Dedupes identical regions and sorts by centroid so region ids/labels are stable across runs and pathway directions.

### `clipPolyHalfplane` robustness
- Dedup `push`, intersection parameter `t` clamped to [0,1], near-zero denominator guarded.

### `runPlan` zone post-processing
- Filters degenerate zones, dedupes identical bounds, sorts deterministically (region → bottom-to-top → left-to-right) before re-indexing; single-zone regions now carry `truckWidth`.

### Validation
- Added `tests/zone_decomp_validation.mjs` — Node harness comparing the old (git HEAD) and new implementations across 6 targeted scenarios (U-shape bridging, area inflation, thin features, sliver strips, degenerate pathways/noisy clipping, ordering stability). Result: 18/18 assertions pass; details in `docs/TESTING.md` (T-014, T-015).
- All 4 inline `<script>` blocks in `site/indexV4.html` pass `node --check`.
- Added `docs/fivedayplan.md` — plain-language summary of these changes.

## 2026-06-11 — Truck assignment workload rebalance (`site/indexV4.html`, Step 4 of `runPlan`)

### What was wrong
- Big-truck balancing used **zone area** as the workload metric. Plan ETA is dominated by dump count (2.5 min per dump vs 0.5 min per transit waypoint), and a zone's real dump count diverges from its area because neighbouring zones claim boundary hex cells first — in a 3× Cat 793 test the trucks got 664/560/584 dumps (max/min 1.19) despite near-equal areas.
- Zone visit order was "biggest zone first", so trucks criss-crossed the field between non-adjacent zones, inflating per-truck distance.
- Small trucks were assigned gap zones round-robin by **zone count**, ignoring how many gap dumps each zone actually contains.

### What changed (architecture preserved — same passes, broker, simulation, Q-table untouched)
- Dump spots per zone are now precomputed once in deterministic zone order (`zoneDumps`), and big-truck assignment runs LPT on **actual dump counts**: busiest zone → big truck with fewest dumps so far.
- Near-ties (within 8% load) break toward the truck whose previous zone is closest, keeping each truck's zones spatially clustered.
- Each big truck now visits its zones in a nearest-neighbour chain from the entry gate instead of biggest-first.
- Small-truck gap-fill now assigns each gap zone to the small truck with the fewest accumulated gap dumps (was: blind round-robin); stale `greedyDumpsInZone` comment fixed to `hexDumpsInZone`.

### Measured results (`tests/assignment_balance_eval.mjs`, real functions extracted from the page)
- L-field + road, 3× Cat 793: dumps 664/560/584 → 584/588/636 (CV 0.07 → 0.04), makespan 1700 → 1628.5 min (−4.2%), total distance 42.3 → 39.5 km (−6.6%).
- L-field + road, 2× Cat 797 + 2× Cat 785: total distance 40.9 → 38.9 km (−4.8%); dump balance already tight (CV 0.02) and preserved.
- Rectangle, single big truck: total distance −2.0% from the nearest-neighbour visit order; nothing else changes (only one big truck — nothing to balance).

### What you can SEE in the UI (and why earlier changes looked invisible)
The 2026-06-11 geometry + assignment changes only alter visuals when the input actually exercises them. On a plain rectangular field with the default 1-big-truck fleet, the output is intentionally near-identical. To see the differences:
- **Draw a concave field** (U or L shape) on the Site/Custom Field page: zones now hug the shape — no zone rectangle bridges the concave gap, and no dump-spot circles appear outside the boundary (before, a strip could span the gap and place dumps outside the field).
- **Zone strips are all equal height** within a region — previously the top strip could be up to 1.5× taller after the sliver merge.
- **Plan preview, zone colours**: with 2+ same-model big trucks, each truck's colour now forms contiguous clusters instead of an interleaved patchwork, and routes criss-cross less.
- **Truck assignments table**: per-truck Dumps and Distance (km) columns are visibly closer together for same-model trucks, and total distance/ETA drop a few percent.
- **Stable labels**: re-running the plan (or drawing the same road in the opposite direction) keeps the same Region/Z numbering — before, labels could swap between runs.

## 2026-06-05 — v3.0.3 (Zone Decomposition + Hex-Spot Integration)

### Plan Generation (Step 3)
- Replaced `greedyDumpsInZone` with `hexDumpsInZone`, which calls `buildHexSpots()` from `hexpack_engine.js` per zone to produce staggered hex-lattice waypoints instead of a greedy grid.
- Spots are collected into `STATE.plan.hexSpots` so both Plan Preview and Live Ops can render them.
- Plan Preview canvas now draws hex spot circles (dashed outlines) inside each zone, replacing the old filled-dot waypoint markers.

### Live Operations (Step 4)
- Restored the v3.0.2 waypoint-following simulation (`opsTick`, `drawOps`, `opsReset`, collision avoidance, turning radius, token locking).
- `drawOps()` now renders HexPackSim-style spot circles: dashed-empty → orange-active → green-filled, overlaid on zone rectangles.
- Zone backgrounds show dashed borders and zone labels (`Z1`, `Z2`, …) during simulation.
- `opsTick()` marks spots as **active** when a truck arrives and **filled** after dumping completes.
- Removed the heatmap grid overlay in favour of per-spot circle rendering.

### Shared
- Zone decomposition (sweep-line strips + sliver merge) and lane routing (`laneRoute`) remain unchanged from v3.0.2.
- Big-truck-first assignment with small-truck gap-fill logic preserved.
- `hexpack_engine.js` used as a library (`buildHexSpots` only); `HexPackSim` class no longer drives the ops canvas.

---

## 2026-06-05

### UI/Branding Redesign
- Updated the site theme from dark mode to a light mode matching the Caterpillar brand aesthetics.
- Replaced the 'Barlow Condensed' font with standard 'Arial'.
- Renamed the main entry file from `index v1.10.html` to `index.html`.
- Removed horizontal scanline styling from the site background.
- Redesigned the top bar logo to use the classic Caterpillar text and yellow triangle, removing the "Operations Console" and version badges.
- Updated the site favicon from a yellow square to a Caterpillar-style isosceles yellow triangle.
- Changed the browser tab title to simply "AutoDump".
- Redesigned the "Three-layer architecture" SVG diagram into a modern, responsive HTML/CSS flexbox layout with clean borders and shadows.

- Minor editorial fixes to changelog wording and formatting.

#### `site/index.html` — file-level changes
- Set page `<title>` to "AutoDump", added canonical, Open Graph and Twitter metadata for sharing and SEO.
- Replaced the favicon with an inline SVG Caterpillar-style yellow triangle and updated the `theme-color` meta.
- Consolidated and prioritized `Arial` as the primary UI font in CSS (body font-family), while keeping legacy font links for fallbacks.
- Reworked the top bar markup and styles to display the `AUTODUMP` brand text with a small yellow triangle mark; removed version badges and other ancillary labels.
- Removed decorative horizontal scanline styling and improved overall layout spacing, grid, and responsive rules.
- Added the tilt simulator visual/layout and controls into the page (`.tilt-demo`), plus improved canvas and control styling for the About/Method interaction.
- Embedded the trained model and runtime parameters directly in the page (`EMBED` constant with `q_table`, `q_shape`, evaluation metrics), enabling offline demo evaluation.
- Consolidated many client-side modules (zone decomposition, lane routing, greedy packer, navigation, plan export) into the single `index.html` deployable bundle for easier distribution.

## 2026-06-04

### Workspace organization
- Moved the deployable site into `site/` so the repository root contains folders only.
- Moved the live site entry point to `site/index.html`.
- Moved supporting deploy files into `site/`:
  - `404.html`
  - `.nojekyll`
  - `CNAME.example`
- Moved documentation into `docs/`:
  - `README.md`
  - `DEPLOY.md`
- Moved archived assets into `archive/`:
  - `autodump-deploy.zip`
- Kept older builds in `older versions/` for reference.
- Removed the root-level duplicate `README.md` after the docs copy was moved into `docs/`.

### Tilt simulator integration
- Added the interactive pile simulator from `references/tilt_design.html` into the About / Method page in `site/index.html`.
- Kept the visual interaction layer only:
  - tilt slider
  - fill-level slider
  - animated canvas scene
  - fill-ratio indicator
  - truck correction visualization
- Excluded the formula panel so the page stays deployment-oriented instead of presentation-style.

### Documentation updates
- Updated `docs/README.md` to describe the folder-based layout.
- Updated `docs/DEPLOY.md` so the GitHub Pages instructions refer to `site/`.
- Updated the GitHub Pages workflow to deploy from `./site`.
- Updated archive notes in `older versions/README.md`.

### Live demo link clarification
- Updated the public demo link in `README.md` and `docs/README.md` to point at the deployed Pages root.
- Reworded the button label to make it explicit that it opens the deployed `site/index.html`.
- Added matching guidance in the docs so the published index path is documented consistently.

### Git hook workflow . .
- Added a repo-tracked Git hook set in `config/git-hooks/`.
- Added `config/setup-git-hooks.ps1` to set `core.hooksPath` for the local clone.
- Documented the hook workflow in `config/git-hooks/README.md` and `docs/README.md`.
- Marked the hook scripts executable in the Git index and confirmed the local hooks path is configured.

### Automatic commit wrapper
- Added `config/sync-commit.ps1` to stage code changes, update the changelog, and create the commit in one step.
- Added the `git ccommit` alias through `config/setup-git-hooks.ps1`.
- Documented the wrapper so the repo has a single, repeatable commit path that keeps the changelog in sync.

- Note: `config/sync-commit.ps1` was modified (2026-06-05) to no longer auto-edit `docs/CHANGELOG.md`; it will commit whatever is staged without forcing changelog updates.

### Verification
- Confirmed the workspace root contains no files after the reorganization.
- Confirmed the edited HTML and documentation files pass `git diff --check`.






the given files are changes and the readme file is modified to make the link deployable. \
- Note: `config/sync-commit.ps1` was modified (2026-06-05) to no longer auto-edit `docs/CHANGELOG.md`; it will commit whatever is staged without forcing changelog updates.



