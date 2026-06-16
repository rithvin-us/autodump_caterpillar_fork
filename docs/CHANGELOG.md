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

### 2026-06-16 — Payload-batched haul cycle: load full, place many dumps, reload at threshold (`site/indexV4.html`)

Replaced the gate-after-every-dump shuttle with a realistic finite-payload
mission: a truck leaves the gate FULL, services multiple dump points within its
assigned zone until its payload is nearly spent, then returns to reload —
instead of driving back to the gate after every single dump.

- **Payload model (new constants + helpers).** `dumpTonnes(model)` = one lift
  over the dump-spot footprint (`π·r² · DUMP_LIFT_M(0.45) · MATERIAL_DENSITY_TPM3(1.8)`),
  so a bigger truck sheds more per dump (Cat 785 ≈17 t, 793 ≈26 t, 797 ≈37 t).
  `dumpsPerLoad(model)` = how many dumps a full load places before the 10 %
  reserve (`RELOAD_FRACTION`) is hit — 7 / 8 / 8 dumps per trip respectively.
- **Plan: payload-batched trips (`runPlan`).** Each zone's far-to-near dump list
  is chunked into payload-sized batches; one trip = gate → access → dump₁…dump_k
  (interior hops, no gate return between dumps) → access → nearest exit gate →
  reload. Gate returns drop by ~8× versus the old one-dump-per-trip shuttle.
- **Sim state machine (`opsReset`/`opsTick`).** Trucks carry `payload` /
  `maxPayload` / `dumpTonnes` / `reloads` / `tripDumps`. A completed dump sheds
  `dumpTonnes` and the bed stays *loaded* until the remaining payload falls to
  the reload threshold; a gate reload refills to full, counts a reload, and logs
  `placed N dumps last trip`. Trucks built without a payload field (older test
  harnesses) fall back to the legacy empty-after-dump behaviour.
- **Visualization (`drawTruck`).** The bed mound height now tracks remaining
  payload (a truck rides part-full mid-mission), plus a live `210/363 t` readout
  and a fill gauge that turns red at the reserve threshold.
- **Metrics.** Telemetry, the Report page (new stat row + per-truck columns:
  gate reloads, avg dumps/trip, payload utilisation, distance/tonne), the JSON
  export, and the Fleet-Command dashboards now report payload-aware tonnage
  (`dumps · dumpTonnes`, not `dumps · full payload`) and the new cycle metrics.

**Validation:** `hard_path_planning` 25/25 (builder + invariants rewritten to the
batched model: payload never exceeded, multi-dump trips exist, loads = trips−1,
exit gate nearest the LAST dump, end-to-end sims complete on payload trucks);
`multigate_path_check` 16/16, `live_sim_completion` 14/14, `zone_decomp_validation`
18/18, `congestion_routing_check` 27/27, `haulroad_zone_check` clean; all 3 inline
`<script>` blocks parse. Test sandboxes extended with the payload constants/helpers.
See `docs/TESTING.md`.

### 2026-06-16 — Realistic mine operations: boundary-comb haul roads, exact zone partition, zones≥trucks, road-constrained return-to-gate (`site/indexV4.html`)

Refactor of the planning/execution model so trucks behave like a real
Caterpillar mine fleet (Gate → Haul Road → Zone → Strips → Haul Road → Gate)
instead of a geometric coverage demo. Trucks no longer drive across the dump
field, through dumped material, or via the field centre.

- **Zone decomposition — exact partition (`autoDecomposeZones`).** Horizontal
  slabs are now split into their disjoint x-span connected components, and each
  zone is the polygon's TRUE intersection with its `[x0,x1]×[y_bot,y_top]` box
  (Sutherland–Hodgman of the concave subject against the convex box). Concave /
  U-shaped / multi-lobe sites now partition exactly — `union(zones) = polygon`,
  no overlap, no orphan regions — instead of one rectangle bridging the void.
- **Zones ≥ trucks, no dropped zones (`runPlan` Step 2).** The slab count is
  raised until at least one zone per truck exists (extra zones when the site is
  large). The old `MIN_ZONE_AREA_M2` *drop* filter — which could push the zone
  count below the truck count and leave assigned-but-empty zones — is replaced by
  a sliver-only guard, so every operational region is kept and serviced.
- **Boundary-comb haul roads (`buildHaulRoads`, `zoneEntryPoint`).** Replaced the
  centroid-hub spine network (which ran the trunk road straight through the
  middle of the active dump field) with roads that ride zone boundaries and the
  site perimeter: lateral **rungs** along every shared slab boundary, flank
  **rails** tying consecutive rungs together, **gate spurs**, and thin
  connectivity **links**. Each zone's access point sits on a rung, so a truck
  leaves the road and enters the zone EDGE-ON. The field centroid is no longer a
  road node — verified return-to-gate legs are 100 % on-network (0.000 off-road).
- **In-zone coverage sweep (`coverageOrderFromAccess`, `runPlan` Step 4).** Dump
  spots are ordered farthest-from-access first, so under the one-load-per-trip
  shuttle every haul-in leg crosses only still-empty ground and a truck never
  reverses over material it (or a neighbour) already placed.
- **Collision avoidance fix (`moveTruckWithAvoidance`).** The perpendicular-
  arrival safety bubble no longer flags a truck that is clearly BEHIND as a
  blocker (it had violated the documented "a truck to my rear is not an obstacle"
  rule and caused spurious yields). This was a pre-existing working-tree
  regression surfaced by the test run.

**Validation:** `multigate_path_check` 16/16 (A7 end-to-end 1852/1852 dumps),
`live_sim_completion` 14/14, `zone_decomp_validation` 18/18,
`hard_path_planning` 24/24, `congestion_routing_check` 27/27 (C4 updated for the
hub-free comb), `haulroad_zone_check` zones 3/3, partition 99.85 %, all routes
resolve. All 3 inline `<script>` blocks parse. Test harnesses' function-
extraction lists extended with `scanlineSpans`/`stripSpans`. See `docs/TESTING.md`.

### 2026-06-12 — Enterprise UI redesign: Caterpillar design system, typography, accessibility, de-gamed visuals (`site/indexV4.html`)

Full UI/UX pass to make the console look like a production Caterpillar mine-operations
product (MineStar-style) instead of a hackathon dashboard.

- **Design tokens.** `:root` rewritten as a structured token system: Caterpillar
  Yellow `#FFCD11` primitives (incl. `--cat-yellow-text #7A6200`, ≥5:1 on white),
  charcoal scale (`--charcoal-950/900/800`), gray scale, status colors
  (ok/warn/err/info, "status only — never decorative"), 4px spacing scale, radius
  scale, elevation shadows, and motion tokens (`--t-fast/base/slow` 150/200/250ms,
  standard easing). All legacy var names kept as aliases so existing CSS/JS works.
- **Typography.** Barlow/Barlow Condensed/Share Tech Mono/JetBrains Mono replaced
  with **Inter** (UI) + **IBM Plex Mono** (data/numerics, tabular-nums). Oversized
  condensed-uppercase page titles reduced to 22px/700 sentence case; all sub-10px
  labels bumped to ≥10px.
- **Header.** Brand block gains "Mine Operations Planning" subtitle; new right-side
  status group: live simulation-status chip (READY / RUNNING / E-STOP, mirrored from
  `setStatus`) and a 24h control-room clock.
- **Accessibility.** Skip-to-content link; keyboard activation (Enter/Space) for all
  `role="button"` elements; `aria-current="page"` on active nav; `role="img"` +
  descriptive `aria-label` on all four canvases; event log is `role="log"`; footer
  status is `role="status" aria-live="polite"`; ops progress bar is a real
  `role="progressbar"` with live `aria-valuenow`; fixed mismatched
  `</section>`/`</main>` closing tags; text-token contrast raised
  (`--txt3 #667085→#5D6878`, yellow text `#9E7C00→#7A6200`).
- **De-gamed visuals.** Removed scan-line animation, spinning dashed E-stop ring,
  danger pulse, comm-node pulse and glow shadows. Kill switch restyled as a real
  industrial E-stop (red mushroom on Cat-yellow safety plate, no animation). Tilt
  simulator's sci-fi cyan/neon palette remapped to the enterprise status palette.
  All emoji buttons (📋⚙🖨▶↻↶✕↓) replaced with Font Awesome icons.
- **Layout.** Live Operations becomes a control-room layout: field view + right KPI
  panel + full-width bottom event-log panel. Site/ops grids moved from inline styles
  to `.layout-canvas-right` / `.layout-ops` classes with responsive breakpoints
  (1280/980/840px; sidebar collapses to a horizontal strip on narrow widths; type
  scales up on ≥1800px ops displays). Field canvases/grids neutralized from blue-navy
  to charcoal (`#070C18→#15181C`, grid `#162035→#262B31`).

### 2026-06-12 — Live Operations de-stagnation: shift time-warp, coverage/KPI sync, render batching, rebalance O(n) (`site/indexV4.html`)

Fixes the reported Live Simulation problems: frozen "stuck after a particular
time", momentary stalls every few seconds, and the coverage bar reading 100 %
while dumps were still running.

**Root causes found and fixed**

1. **Silent off-shift freeze (the "stuck after a while" deadlock-alike).** The
   demo fleet's 06:00–18:00 shift gives a 720 sim-min budget; shuttle routes
   need thousands of sim-minutes, so at sim t=720 every truck went off shift and
   `opsTick` idled them all — at 60× that froze the screen ~7 real minutes with
   no explanation, looking like a permanent deadlock. New **off-shift
   time-warp**: when every truck with pending work is merely off shift (not
   stopped, not e-stopped), the clock jumps to the next shift start and logs
   "All units off shift — clock advanced N sim-min". Headless suites never saw
   it because they use 00:00–23:59 shifts — new H5 scenario forces it.
2. **Coverage 100 % while dumps still running (KPI desync).** `applyDump`
   received the dump radius in METRES (3.2) where LOGICAL units (~0.19) were
   expected — every sim dump painted a ~17× oversized footprint, so the
   coverage KPI saturated after a few percent of the dumps. Second half of the
   same bug: painting at the TRUCK's position (up to an arrival-radius away
   from the spot) instead of the planned dump waypoint double-painted some
   cells and missed others, capping real coverage at ~70 %. Both fixed: dumps
   paint `metresToLogical(dumpRadius)` at the target waypoint — the coverage
   KPI now tracks the dump progress bar 1:1 (50.0 % coverage at 50.0 % dumps in
   H5) and both reach 100 % together at completion.
3. **Momentary stalls every few seconds.** Three contributors:
   - The intentional dump/reload service pauses had zero visual feedback —
     added progress rings (green dump arc, yellow reload arc + "RELOAD" tag) so
     the pauses read as cycle time, not freezes; `loading` also counts as
     `active` in the Fleet-Command status pills.
   - `drawOps` stroked/filled ~2,000 hex-spot arcs individually every frame —
     steady empty/filled spots are now batched into three draw calls; only the
     handful of blooming/active spots draw individually.
   - `ops.coverageHistory` grew unbounded at 60 entries/second (GC hitches on
     long runs) — now sampled at most twice per sim-minute.
4. **Rebalance splice storm + zombie trips.** Stealing a zone under the shuttle
   cycle did hundreds of `splice` calls on ~5,000-entry waypoint arrays in one
   frame (a visible ~100 ms hitch) and left the victim with empty
   gate→zone→gate reload loops for work it no longer owned. Rewritten as a
   single O(n) route rebuild that also drops dump-less trips; the thief now
   shuttles the stolen zone realistically (one load per trip, nearest exit
   gate) with the legacy consecutive-dump fallback kept for plans without
   gates/access points (older test harnesses).

**Validation:** `tests/hard_path_planning.mjs` extended with H5 (1-hour-shift
fleet must complete via time-warp; mid-run coverage must equal dump progress
±10 pp; final coverage ≥ 99 %; coverageHistory throttled) — **24/24 pass**
(H5: 1,056/1,056 dumps, 84 time-warps, midCov 50.0 % @ 50.0 % dumps, final
100.00 %). Re-runs: `multigate_path_check` 16/16, `live_sim_completion` 14/14
(T5 exercises the new rebalance rebuild), `zone_decomp_validation` 18/18,
`haulroad_zone_check` OK, all 3 inline script blocks parse. See
`docs/TESTING.md` T-023.

### 2026-06-12 — Realistic load-haul-dump shuttle cycle, full-coverage gap fill, working no-go zones, session report with real-life values, V2V + Telemetry redesigns (`site/indexV4.html`)

**Truck workflow now replicates real dumping.** A truck carries ONE load per trip:
enter the field through a gate → haul roads to the zone access → place the load on
the next spot of the zone's path → leave by the SHORTEST way out (the gate nearest
that dump) → reload at the gate (`"load"` waypoint, `LOAD_MIN` = 1.2 sim-min) →
come back in for the next spot. Every gate is usable by every truck; the exit gate
of one trip becomes the entry gate of the next.

- New `"load"` waypoint kind + `loading` truck state (`opsTick`); `tr.cycles` counts
  completed reloads; `tr.loaded` is event-driven (full on the whole haul-in leg,
  empty on the whole haul-out leg). `DUMP_MIN` (0.4) / `LOAD_MIN` (1.2) constants —
  compressed representations of the 1.5–2.5 min / 2.5–4 min field cycles.
- **Token release on zone exit**: a truck leaving a zone to reload releases the
  zone token immediately (scan-until-leave instead of "any dump anywhere later"),
  so other trucks can work the zone while it is out at the gate.
- `rebalanceIdleTruck` now steals ALL pending blocks of a zone (under the shuttle
  cycle every trip is its own 1-dump block — stealing one block handed over one load).
- runPlan memoises `laneRoute` per gate↔access pair (shuttle routing repeats the
  same legs hundreds of times). Plan preview draws per-zone serpentines + access
  links instead of the (now enormous) full shuttle route.
- **Fixed latent km bug**: sim `tr.km` accumulated LOGICAL units/1000; now scaled by
  `getScale()` → real kilometres everywhere (fleet monitor, telemetry, report).

**No dump spot left uncovered (the screenshot issue).** Two causes fixed:
- Planner: new `coverageGapSpots(zone, mask, filled, r)` — after the hex serpentine,
  every still-uncovered workable cell in the zone gets an extra dump appended to the
  zone path (the interstices a non-overlapping circle packing can never reach).
  Projected coverage is now ~100 % of workable cells on every test site.
- Visuals: a completed dump now fills EVERY hex spot inside its real footprint
  (was: one nearest spot per dump, which left lattice spots looking empty even where
  material had been placed).

**No-go zones are now real planner inputs.** Each marker is a circular exclusion
with a configurable radius (new "No-go radius" input, default 30 m):
`buildMask(V, nogo)` carves the circles out of the workable field (inflated by half
a cell diagonal so no spot can slip through on cell granularity — conservative is
correct for hazards); no dump spots inside; coverage is measured against workable
cells only; hazard-hatched circles drawn on site/plan/ops canvases; plan stores
`nogo` (logical circles).

**Report = full mining-session report + real-life reference values.** New KPI row
(material moved in tonnes = dumps × payload, haul cycles, fleet km, throughput
t/sim-h), session overview (site/workable area, gates, zones, fleet, planned + gap
dumps), per-zone completion table, expanded per-truck table (tonnes, cycles,
utilization), and a "Model parameters vs real-life mining reference" table driven by
the new `REAL_MINING` constant (Cat 785/793/797 payload, top speed, GMW, body
volume; dump/load cycle reference ranges; turn radius; haul-cycle definition).
Summary JSON export carries all of it (`parameters.sim` + `parameters.real_life_reference`).

**V2V Communications tab — redesigned into a radio-mesh operations panel.**
Live mesh map on a real-coordinate canvas (truck positions, dashed radio-range
rings, links coloured by separation with distance labels), message-rate KPI,
message-mix breakdown by category (TOKEN/QUEUE/DEFER/REBAL/YIELD/STUCK), link
budget table with log-distance RSSI estimates and quality pills, and a channel log
filterable by category (replaces the abstract decorative circle topology).

**Telemetry tab — completely redesigned as a production analytics board.**
New per-sim-minute telemetry ring buffer in `opsTick` feeds: tonnage / dumps-per-hour
/ fleet-utilization / coverage KPIs, a proper SVG coverage line chart with the plan
target marked, a per-zone burn-down (placed/planned progress bars, live), and a
per-truck performance table (dumps, tonnes, km, average km/h, idle, utilization
bars). Replaces the three flat bar strips.

**Algorithm refinements from rigid difficult-terrain testing**
(`tests/hard_path_planning.mjs`, mirrors the full new pipeline + headless `opsTick`):
- `zoneEntryPoint` candidates are now the zone polygon's OWN edge midpoints
  (bbox midpoints only as legacy fallback) — concave zones can no longer get an
  access point floating outside the boundary.
- `buildMask` no-go inflation (above) found by H2; checker semantics for gate
  pass-throughs (a route may legitimately drive THROUGH another gate's road node
  when a zone's branch starts at that gate) and gate-coincident access points
  (zero-length route) documented by H1/H3.
- Scenarios: demo+2 gates+mixed fleet shuttle invariants (one load per trip, exit
  via nearest gate, gate visit between any two dumps, 1880/1880 dumps in sim),
  rectangle + 2 no-go circles, U-shaped concave site with gates at both arm tips
  (1304/1304 dumps), dumbbell with a 1.2-unit corridor — **19/19 pass**.

**Validation:** `tests/hard_path_planning.mjs` 19/19 (new), `tests/multigate_path_check.mjs`
16/16, `tests/live_sim_completion.mjs` 14/14, `tests/zone_decomp_validation.mjs` 18/18,
`tests/haulroad_zone_check.mjs` OK, all 3 inline script blocks parse
(suite const lists extended with `LOAD_MIN`/`DUMP_MIN`). See `docs/TESTING.md` T-021/T-022.

### 2026-06-11 — Multi-gate path planning, one path per zone, equal fleet allocation, model-distinct live sim (`site/indexV4.html`)

**Path planning is now strictly zone-based.** Every dump path derives from the zone's
true clipped polygon, every zone owns exactly one path, and the path belongs to the
single truck assigned to that zone.

- **`hexDumpsInZone`** packs the zone's actual `verts` polygon (bounding-box rect kept
  only as a legacy fallback), so dump spots can no longer leak outside a concave or
  sloped zone boundary.
- **`boustrophedonOrder`** rewritten as a true serpentine: every hex-lattice row is one
  sweep, alternating left→right / right→left (was: 3 coarse bands that criss-crossed).
- **One path per zone** — new `STATE.plan.zonePaths` artifact (`{zone, truck, access,
  dumps[]}`); a truck's route is home gate → haul roads → zone access → that zone's
  serpentine → access → next zone → nearest exit gate. **PASS 2 cross-zone gap-fill
  removed**: finer-radius trucks no longer re-sweep other trucks' zones, preserving
  strict zone ownership (each zone is packed with its assigned truck's own radius).
- **Equal mixed-fleet allocation** — `assignZonesWeighted` now applies a
  priority-weighted zone-count cap (`ceil(nZones × w / Σw)`): no truck can exceed its
  share of the zone count, so a mixed fleet spreads across all zones instead of pooling
  on the fastest truck. Workload inside the cap still balances via weighted LPT +
  locality tie-break. Priority semantics preserved (weight 2 ≈ double share).
- **`zoneAt`** tests the zone's clipped polygon first (`pip`), bbox as fallback —
  dump-to-zone attribution is exact on non-rectangular sites.

**Multiple gates (replaces the single Main Gate).**

- Site Setup: the Gate tool now adds any number of gates (G1, G2, …); undo pops the
  last one; site summary lists all gates; presets updated (demo site ships G1
  south-west + G2 east).
- `STATE.site.mainGate` → `STATE.site.gates[]`; plan stores `gates`, `truckGate`
  (home gate per truck) and keeps `mainGate` as a legacy alias for the first gate.
- **`buildHaulRoads`** builds one spine per gate to the polygon centroid (all spines
  meet there, so the network is connected and every gate reaches every zone) plus one
  branch per zone from the nearest point on any spine; each zone's access point faces
  its nearest gate (`z.gateIdx`). Single-`[x,y]` legacy call form still accepted.
- **Gates participate in path planning**: each truck stages at the gate nearest its
  assigned zones, transits only on the haul-road network (`laneRoute`), and exits via
  the gate nearest its last zone; the rebalancer routes stolen blocks to the nearest
  gate too. Plan assignments table shows each truck's home gate.
- Exports (`plan JSON`, `summary JSON`) now carry `gates`, `truckGates`, `zonePaths`.

**Live simulation — smoother, more realistic, model-distinct (mixed fleet).**

- `TRUCK_MODELS` gains per-model `speedF` (Cat 785 nimble 1.12×, Cat 793 1.0×,
  Cat 797 heavy 0.88×) and `scale` (body size); demo fleet preset is now one of each
  model so the live demo shows three visibly different trucks.
- Movement: throttle ramp (trucks ease out of dumps and stops instead of snapping to
  full speed) + corner-aware braking (speed drops up to 65 % through sharp headings —
  the turning circle itself is unchanged), per-model cruise speed.
- `drawTruck`: body scaled per model, model-coloured trail, twin rear axles on the
  Cat 797, tipping-bed dump animation (bed slides rearward, material spills behind
  the truck while dumping), model number badge under the truck id.
- Trucks stage at their home gates; live ops/plan/fleet-map canvases draw all gates
  and per-zone access-point markers; ops zone labels show `Z<n> · <truck>`.

**Validation:** new `tests/multigate_path_check.mjs` (16 assertions: road network per
gate, gate→zone connectivity, in-polygon dump containment, true-serpentine ordering,
equal allocation, zone ownership, gate bookends, end-to-end multi-gate sim completion,
single-gate back-compat) — 16/16 pass. Existing suites unaffected:
`tests/live_sim_completion.mjs` 14/14, `tests/zone_decomp_validation.mjs` 18/18,
`tests/haulroad_zone_check.mjs` OK; all 3 inline script blocks parse. See
`docs/TESTING.md` T-020.

### 2026-06-11 — Architecture redesign: Main Gate → auto haul roads → auto zones

**Goal:** Make the planner behave like a realistic mine-planning system instead of a
geometric coverage demo. User inputs are now ONLY: mine boundary polygon, Main Gate
(single point, acts as both entry and exit), truck model(s), and number of trucks.
Manual region lines (R1/R2), separate entry/exit gates, and pathway drawing are removed.

**New pipeline (`runPlan()` in `site/indexV4.html`):**
1. Field mask from polygon (unchanged).
2. **Auto zone decomposition** — `autoDecomposeZones()` divides the polygon into
   `max(nTrucks, min(nTrucks×2, area/zoneSizeTarget, 8))` balanced horizontal slab
   zones, each clipped to the true polygon boundary (verts stored per zone).
   Boustrophedon strips remain internal to zones (`boustrophedonOrder`) and are
   never promoted to zones; the token board lists zones only.
3. **Auto haul road generation** — `buildHaulRoads()` builds a spine from the Main
   Gate to the polygon centroid plus one branch per zone to its nearest access
   point (`zoneEntryPoint()`); `laneRoute` (Dijkstra over road segments) constrains
   all transit legs to the road network. If the user skipped the gate, it is
   auto-placed at the polygon vertex nearest the bottom-centre of the bounding box.
4. Weighted zone→truck assignment via token broker (unchanged mechanism, now over
   auto zones); trucks enter zones at their road access point, not centroid.
5. All trucks start at the Main Gate and the exit bookend returns them to the gate.

**Site Setup UI:** drawing modes reduced to Polygon / Main Gate / No-go; site summary
shows gate coordinates; presets and demo updated; pathway/entry/exit drawing removed.
**Rendering:** plan preview and live ops draw the generated haul roads (amber corridors
with dashed centre-line), the Main Gate marker, and zones as their actual clipped
polygons; fleet-monitor map updated likewise.
**Exports:** plan/summary JSON now include `mainGate` and `haulRoads` instead of
`entries`/`exits`.
**Coverage** was already area-based (`filled cells / polygon cells`) and is unchanged.
Legacy `splitPolygonByPathways`/`buildZones`/`drawGate` remain defined for reference
tests but are no longer called by the live pipeline.

**Validation:** new `tests/haulroad_zone_check.mjs` (zone balance, 100% area
conservation, road connectivity gate→every zone, degenerate inputs) plus the existing
`tests/live_sim_completion.mjs` suite — 14/14 pass.

### 2026-06-11 — Fix zone decomposition: regions, not strips, are zones

**Problem:** For large regions (created when the user draws R1/R2 pathway separators),
`buildZones()` was called to generate truckWidth-wide horizontal strips, and each strip
was promoted to a zone. This caused the token board to show dozens of zones and trucks
to be assigned strip-by-strip instead of region-by-region.

**Fix (single change in `runPlan()` Step 3, `site/indexV4.html`):**
- Each region created by pathway separators now maps to **exactly one zone** by default.
- For very large regions (area > `ZONE_THRESHOLD_M2`, default now 50 000 m²), the region
  is subdivided into at most 4 equal horizontal sub-zones — never truckWidth-wide strips.
- `buildZones()` is no longer called in the live pipeline (still defined but dead code;
  boustrophedon strip traversal is handled internally by `boustrophedonOrder`).
- Zone `verts` polygon is stored on each zone object for future accurate rendering.
- UI: renamed "Small region threshold" → "Zone subdivision threshold"; default 5 000 → 50 000 m²;
  updated step description and helper text.

**Result for Polygon + R1 + R2 (default settings):**
→ Zone A, Zone B, Zone C (3 zones) — one per separator-defined region.
Token board: 3 tokens. Each truck assigned a complete operational region.



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



