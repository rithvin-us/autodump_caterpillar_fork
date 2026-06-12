# claude_context.md — AutoDump complete working context

> Single reference file for AI assistants and contributors. Read this before
> touching `site/indexV4.html`. Last full update: **2026-06-12** (congestion-
> aware fleet routing: weighted A* + BPR cost, road-network diversification,
> live dynamic re-routing, fuel model, Bézier smoothing; same day: load-haul-
> dump shuttle cycle / coverage gap fill / no-go zones / session report;
> previous: 2026-06-11 multi-gate redesign).
> Companion docs:
> `CLAUDE.md` (workflow rules), `docs/CHANGELOG.md` (history),
> `docs/TESTING.md` (validation log), `graphify-out/GRAPH_REPORT.md` +
> `graphify-out/graph.json` (knowledge graph of the repo).

## 1. What this project is

AutoDump — a static, single-file HTML dashboard demonstrating RL-based dump
placement for autonomous Cat mining trucks (Caterpillar Innovation Challenge
2026, Team Techiva@26, PSG iTech). No build step, no package manager, no
framework. Everything (CSS, JS, trained Q-table, polygon math, token broker,
hex packer, simulator) is inline in **`site/indexV4.html`** (~3,700 lines).

- Live URL: https://preethikakumaravel.github.io/autodump_caterpillar/site/indexV4.html
- Deploys from `./site` via `.github/workflows/pages.yml` on every push to `main`.
- `older versions/` = frozen previous builds; `references/`, `archive/`,
  `.offline-markdown-preview/` = reference only.
- Three-layer concept (README): Zone Decomposition → Q-Learning Agent
  (offline-trained, embedded as `EMBED.q_table`) → Token Broker
  (Coffman-1971 deadlock-free). Coverage story: 62.18 % → 74.84 %.

## 2. Git workflow (enforced)

`core.hooksPath = config/git-hooks`. The pre-commit hook **blocks any commit**
unless `docs/CHANGELOG.md` is staged with it (exceptions: `.gitignore`,
`config/git-hooks/*`). So: every change ⇒ dated CHANGELOG entry staged in the
same commit (`git ccommit "msg"` wraps this). After every test/validation run,
append an entry to `docs/TESTING.md` (T-### format, exact command, expected vs
actual, never invent results). **Never modify existing CHANGELOG entries —
prepend new ones under `## Summary (latest changes)`.**

## 3. The 5-step workflow in the page

Pages are `<section class="page">` blocks toggled by `nav(page)` /
`onPageEnter(page)`; content injected once via template string into `#content`.

1. **Site Setup** (`page-site`) — draw boundary polygon, add **gates** (G1, G2,
   … — multiple allowed, each is an entry AND exit), and **no-go zones**
   (circular exclusions, radius from the "No-go radius" input, default 30 m —
   carved out of the workable field by the planner, not just markers). Presets:
   Rectangle, L-shape, Demo (10-vertex polygon, gates G1 SW + G2 east).
2. **Fleet Config** (`page-fleet`) — truck rows (model, priority 0.1–10, shift,
   maintenance). Demo fleet = 1× Cat 793 + 1× Cat 785 + 1× Cat 797 (mixed on
   purpose). Changing priority with an existing plan re-runs `runPlan()`.
3. **Plan Generation** (`page-plan`) — `runPlan()` pipeline (see §5).
4. **Live Operations** (`page-ops`) — `opsTick`-driven multi-truck sim (see §6).
5. **Report & Export** (`page-report`) — KPIs, per-truck stats, CSV/JSON export.

Plus reference pages: About/Method (tilt simulator, Q-table metadata) and five
Fleet-Command dashboards (`dashRender`/`dashLiveTick`, in-place DOM patching).

## 4. Core data model

```js
STATE = {
  site:  { verts:[[x,y]], gates:[{x,y,name}], nogo:[{x,y,rM}], realWidthM:500, closed },
  fleet: { trucks:[{id, model, width, dumpRadius, priority, shiftStart, shiftEnd, maint[]}] },
  plan:  {
    zones,            // [{id, verts, x_min, x_max, y_bot, y_top, area, accessPt, gateIdx}]
    mask, insideCells, // rasterized WORKABLE occupancy (polygon minus no-go circles)
    assignments,      // zoneId -> truckId  (one truck per zone)
    truckZones,       // truckId -> [zoneId] in visit order
    zonePaths,        // zoneId -> {zone, truck, access, dumps:[[x,y]], gapDumps}  ← ONE PATH PER ZONE
    waypoints,        // truckId -> [[x, y, "transit"|"dump"|"load"]]  ← shuttle trips
    gates,            // [{x,y,name}] (≥1; auto-placed if user skipped)
    mainGate,         // legacy alias = gates[0]
    truckGate,        // truckId -> index into gates (home/staging gate)
    nogo,             // logical-space exclusion circles {x,y,r}
    haulPolylines, haulRoadSegs,   // road network (drawing / laneRoute)
    truckKm, projectedCov, totalDumps, etaMin, hexSpots(visual only)
  },
  ops:   { running, t(sim-min), speedMul, trucks[], tokens[], events[], heatmap,
           filled, nFilled, totalPlannedDumps, zoneRemaining, dumpAnims, estop,
           telemetry[],          // 1 sample/sim-min ring buffer (Telemetry tab)
         },
  report // full session report: tonnes, cycles, per-zone, session, realParams (see finalizeReport)
}
```

Logical canvas = 30×26 units (`FIELD_W`/`FIELD_H`); `getScale()` = realWidthM/30
metres per unit. `TRUCK_MODELS` per model: `width`, `dumpRadius`, `payload`,
`color`, `speedF` (785:1.12 / 793:1.00 / 797:0.88), `scale` (body size 0.78 /
0.90 / 1.05). `REAL_MINING` = real-life reference values shown in the report
(payload/top speed/GMW/body volume per model, dump/load cycle ranges, turn
radius, haul-cycle definition). Sim cycle constants: `DUMP_MIN` 0.4,
`LOAD_MIN` 1.2 (compressed representations of the real 1.5–2.5 / 2.5–4 min).

## 5. Planning pipeline — `runPlan()` (the heart of the app)

Inputs only: polygon, gates (0..n), no-go circles, fleet, zone-size target. Steps:

1. **Mask** — `buildMask(verts, nogo)` rasterizes the polygon MINUS no-go
   circles (blocking radius inflated by half a cell diagonal so no spot slips
   through on cell granularity). Coverage is measured on workable cells only.
2. **Auto zones** — `autoDecomposeZones(verts, nZones)`: equal-height horizontal
   slabs clipped to the true polygon (`clipPolyHalfplane` × 2 + `cleanPoly`);
   `nZones = max(nTrucks, min(nTrucks×2, areaM2/target, 8))`, filtered by min
   zone area. Zones carry their clipped `verts`.
3. **Gates + haul roads** — user gates (or one auto-placed at the polygon vertex
   nearest the bottom-centre); `buildHaulRoads(gatesXY, verts, zones)`: one
   spine per gate → polygon centroid (spines meet there ⇒ connected network),
   one branch per zone from the nearest spine point to `zoneEntryPoint(z,
   nearestGate)`; sets `z.accessPt`, `z.gateIdx`. Accepts legacy single `[x,y]`.
4. **Assignment + one path per zone + routing**:
   - Zone cost = exact dump count for that truck's radius (`estByRadius`,
     throwaway grids).
   - `assignZonesWeighted(zones, trucks, costOf, truckWeight, entryXY)`:
     weighted LPT + 8 % slack locality tie-break **+ equal-allocation cap**
     `ceil(nZones × w / Σw)` per truck ⇒ mixed fleet spreads across all zones;
     priority weight 2 ≈ double share.
   - Home gate per truck = gate nearest its zones (`truckGate`); zone visit
     order = `orderZonesNearestNeighbour` from that gate.
   - **`zonePaths`**: per zone, `hexDumpsInZone(z, mask, filled, radius)` packs
     the zone's TRUE polygon (`z.verts`) on a shared `filled` grid, then
     `boustrophedonOrder` = true serpentine over exact hex-lattice rows, then
     **`coverageGapSpots`** appends a dump on every still-uncovered workable
     cell (the interstices a circle packing can never reach) → projected
     coverage ≈ 100 % of workable cells. `zoneEntryPoint` candidates = the zone
     polygon's OWN edge midpoints (concave-safe; bbox midpoints legacy only).
   - **Truck route = LOAD-HAUL-DUMP shuttle, one load per trip**: enter via a
     gate → zone access → ONE dump → access → the gate **nearest that dump**
     (shortest way out) → `"load"` waypoint (reload) → next trip. Final gate
     arrival is a plain transit (end of shift). No cross-zone gap-fill by
     other trucks — strict zone ownership.
   - **Congestion-aware fleet routing (2026-06-12)**: `buildHaulRoads` also
     adds containment-sampled ALTERNATIVE links (gate↔gate, access ring,
     direct gate↔access, `kind="link"`) so multiple feasible paths exist;
     `buildRoadGraph(pathways)` builds the road graph ONCE (cached on the
     function object — NOT module state, vm-extracted copies couldn't see it);
     trips are routed ROUND-ROBIN across the fleet by `routeOnGraph` =
     weighted A* (ε 1.2) with BPR cost `len·(1+0.6·min(f/κ,2)⁴)` + intersection
     penalty + per-truck route-diversity penalty + fuel/turn terms, per-edge
     flows accumulating and decaying ×`FLOW_DECAY` per round. `laneRoute`
     delegates to the graph at ε 1.0 (exact; legacy Dijkstra body kept as the
     fallback for sandboxes without the new fns). Routes are then
     `smoothPathBezier`-smoothed (transit corners only; dump/load points and
     route ends never move). ETA uses dump/load/transit counts captured
     BEFORE smoothing. `plan.roadGraph`/`plan.plannedFlows` are runtime-only
     (excluded from JSON exports).
5. Distances (`truckKm`), projected coverage (`filled/insideCells`), ETA
   (dumps×2.5 + loads×`LOAD_MIN` + transits×0.5 sim-min, max over fleet).

Legacy-but-still-defined (reference/tests only, NOT in the live pipeline):
`buildZones` (strip zones), `splitPolygonByPathways`, `drawGate`.

## 6. Live simulation — `opsTick(dt)` + helpers

- Trucks stage at their **home gates**, follow shuttle `waypoints`, request
  zone tokens. `"load"` waypoints put the truck in a `loading` state for
  `LOAD_MIN`; `tr.cycles` counts reloads; `tr.loaded` is event-driven (true
  after reload, false after dump → bed reads correctly on both haul legs).
- **Tokens**: `grantToken`/`releaseToken`/`releaseTokensHeldBy`/`brokerTick`
  (heartbeat TTL 6 sim-min revocation), `deferLockedZone` (max 2 defers),
  per-zone completion via `zoneRemaining` + `zoneAt(x,y)` (polygon-exact pip
  test, bbox fallback). **Release on zone exit**: leaving the zone releases the
  token immediately (scan-until-leave), so the zone is free while the holder is
  out reloading. `rebalanceIdleTruck` steals ALL pending blocks of one zone
  (shuttle trips are 1-dump blocks).
- **Motion** (smooth + realistic): cruise = `0.2 × speedF × speedMul × dt`;
  throttle `tr.vel` ramps 0→1 (`dt×3` exponential) so trucks ease out of dumps
  and stops; corner-aware braking (down to 35 % through sharp heading error —
  the turning circle from `moveTruckWithTurning` is unchanged, Cat 793 turn
  radius 11.5 m); `moveTruckWithAvoidance` (2.5×radius gap, lower index has
  right of way); `stuckWatchdog` (2 sim-min no-progress pivot);
  `rebalanceIdleTruck` (steals farthest pending zone block from the busiest
  truck, exits via nearest gate).
- Arrival radii: transit/load ≥ 1.05× turning circle, dump tight (0.7×).
- **Live traffic (2026-06-12, always-on per-truck since 2026-06-13)**:
  `roadOccupancyTick` (throttled `OCC_TICK_MIN` 0.5 sim-min) snaps active
  trucks to road edges → `ops.roadOcc` + `ops.congestionIndex`;
  `congestionSpeedFactor` slows trucks nonlinearly on busy edges
  (`1/(1+0.6·u⁴)`, clamp [0.45,1]); `rerouteNextLeg` re-plans EVERY haul-in
  leg (at reload) and EVERY haul-out leg (after dump) from the truck's live
  position with live occupancy, per-truck corridor bias (`truckSeed`) and
  diversity vs its own previous leg (`tr._lastLegEdges`) — `REROUTE_UTIL`
  only gates logging/counting now (splices ONLY the transit run; no-op on
  legacy serpentine routes). Traffic-mode cost terms in `routeOnGraph`
  (flows-gated, so ε=1.0 laneRoute parity holds): linear early-spread
  `0.5·u`, static hub toll `0.35·(deg−2)`, ±12 % per-truck jitter.
  `moveTruckWithAvoidance`: nearest-AHEAD blocker only, LOADED trucks have
  right of way (then lower index — total order, deadlock-free), head-on
  pairs both keep right (transit only). `opsReset` DEEP-COPIES waypoints
  (defers/reroutes splice them — aliasing the plan arrays corrupted re-runs).
  Fuel: `tr.fuelL` accrues per km at `fuelLoaded`/`fuelEmpty` (TRUCK_MODELS).
  Congestion overlay (`drawCongestionOverlay`) + congestion/fuel KPIs +
  report/telemetry fuel columns + About formulas card.
- **Off-shift time-warp**: when every truck with pending work is merely off
  shift (not stopped/e-stopped), `opsTick` advances the clock to the next shift
  start and logs it — without this a 06:00–18:00 fleet froze silently at sim
  t=720 with thousands of shuttle minutes left (the "stuck after a while" bug).
- **Coverage/KPI sync invariants**: dumps paint `metresToLogical(dumpRadius)`
  (LOGICAL, ~0.19 — raw metres painted a ~17× footprint and saturated coverage
  early) at the PLANNED dump waypoint (`target`), not the truck position
  (arrival-radius offset capped real coverage at ~70 %). With both, the
  coverage KPI tracks the dump progress bar 1:1 and they hit 100 % together.
- `tr.km` accumulates REAL km (`× getScale()/1000` — the unscaled version was a
  latent bug fixed 2026-06-12). `ops.telemetry` ring buffer: 1 sample/sim-min
  (t, cov, dumps, km, perTruck) feeding the Telemetry tab. `ops.coverageHistory`
  is throttled to ≤2 samples/sim-min (was 60/s unbounded → GC hitches).
- `rebalanceIdleTruck`: single O(n) victim-route rebuild (no splice storms),
  drops the victim's now-empty trips, thief shuttles the stolen zone (one load
  per trip, nearest exit gate); legacy consecutive-dump fallback when the plan
  has no gates/access (older test harnesses).
- **Rendering** `drawOps`/`drawTruck`: zones as clipped polygons labelled
  `Z<n> · <truck>`; hex spots empty→active(pulse)→filled(bloom) — a dump fills
  EVERY spot inside its real footprint, not one nearest spot; haul roads; no-go
  hazard circles (`drawNogo`, true scaled radius, hatched); ALL gates
  (`drawGates`); per-zone access diamonds; model-distinct trucks (scaled body,
  colour-tinted trail, twin rear axles on the 797, tipping-bed dump animation,
  model badge). Service pauses show progress rings (green dump arc, yellow
  reload arc + "RELOAD" tag) so cycle time doesn't read as a freeze; `loading`
  counts as `active` in dash status pills. Steady hex spots are BATCHED into
  three draw calls (empty stroke pass, filled fill+stroke pass); only
  blooming/active spots draw individually — keep it that way, the per-spot loop
  caused frame hitches. Plan preview draws per-zone serpentines, NOT the full
  shuttle route (it would bury the map).
- **Fleet-Command tabs**: V2V = radio-mesh panel (`drawV2VMap` real-coordinate
  canvas with range rings + distance-coloured links, message-mix breakdown via
  `_v2cat`, RSSI link-budget table, category-filterable channel log
  `dashV2Filter`); Telemetry = production analytics (`_tmChartSVG` coverage
  line chart vs plan target, zone burn-down bars, per-truck performance table
  with tonnes / avg km/h / utilization).

## 7. Tests (Node, no framework — extract real functions from the page)

All extract `function NAME(...){...}` via brace-counted slices into a `vm`
sandbox, so the exact shipped code is tested. Run from repo root:

| Suite | Command | Covers | Status |
|---|---|---|---|
| Congestion routing | `node tests/congestion_routing_check.mjs` | road-graph integrity/connectivity, BPR convexity, route diversity, de-centering, Bézier smoothing invariants, ETA parity, end-to-end sim with live occupancy + forced reroute, laneRoute parity | 23/23 (T-024) |
| Hard path planning | `node tests/hard_path_planning.mjs` | shuttle-cycle invariants (one load/trip, nearest-exit gate), coverage gap fill, no-go exclusion, concave U-shape, dumbbell corridor, end-to-end shuttle sims, H5 shift time-warp + coverage/KPI sync regression | 24/24 (T-021/23) |
| Multi-gate / per-zone paths | `node tests/multigate_path_check.mjs` | road net per gate, gate→zone connectivity, in-polygon dumps, serpentine, equal allocation, ownership, end-to-end sim | 16/16 (T-020/22) |
| Live-sim completion | `node tests/live_sim_completion.mjs` | assignment spread, priority, token deadlock, defer, rebalance, completion | 14/14 (T-017/18/22) |
| Zone decomposition | `node tests/zone_decomp_validation.mjs` | old-vs-new geometry regressions | 18/18 (T-015) |
| Haul road / auto zones | `node tests/haulroad_zone_check.mjs` | zone balance, area conservation, connectivity (console report) | OK (T-019) |
| Assignment balance | `node tests/assignment_balance_eval.mjs` | historical old-vs-new heuristic comparison (console report) | OK (T-016) |

Syntax gate: extract all `<script>` blocks, `new vm.Script(block)` each.

**Extraction gotchas** (breaking these breaks the tests):
- Keep top-level `function name(...)` declarations (no arrow-const rewrites)
  for everything in the suites' `FNS` lists.
- Keep signatures of: `hexDumpsInZone(zone, mask, filled, dumpRadius)`,
  `coverageGapSpots(zone, mask, filled, dumpRadius)`,
  `boustrophedonOrder(dumps, zone)`, `assignZonesWeighted(zones, trucks,
  costOf, weightOf, entryXY)`, `laneRoute(pathways, from, to)`, `opsTick(dt)`,
  `buildMask(V, nogo?)` (second arg optional — legacy callers pass one arg).
- `buildHaulRoads` must keep accepting a single `[x,y]` gate (legacy form).
- Zones without `verts` (from legacy `buildZones`) must keep working —
  `hexDumpsInZone`/`coverageGapSpots`/`zoneAt`/`zoneEntryPoint` fall back to bbox.
- Consts extracted by regex `const NAME = ...;` — keep them single-statement
  (`LOAD_MIN`/`DUMP_MIN` are in the suites' CONSTS lists; `REAL_MINING` is a
  multi-line object and must NOT be added to a CONSTS list).
- `opsTick` must keep completing legacy serpentine routes (no `"load"`
  waypoints) — the older suites build those.
- `laneRoute` must KEEP its full legacy Dijkstra body after the typeof-guarded
  graph delegation — `haulroad_zone_check.mjs` extracts `laneRoute` without
  `buildRoadGraph`/`routeOnGraph` and relies on the fallback.
- New congestion fns/consts live in the modern suites' FNS/CONSTS lists:
  `buildRoadGraph, routeOnGraph, smoothPathBezier, roadOccupancyTick,
  congestionSpeedFactor, rerouteNextLeg` / `BPR_ALPHA, BPR_BETA, ASTAR_EPS,
  HEADWAY_L, OCC_TICK_MIN, REROUTE_UTIL, FLOW_DECAY` (all single-statement;
  `HEADWAY_L` is a literal 3.75 on purpose — referencing TRUCK_RAD_LOGICAL
  would break sandboxes whose CONSTS order differs).
- Everything called from `opsTick`/`laneRoute`/`runPlan` that is NOT in every
  suite's FNS list must stay `typeof`-guarded.

## 8. Conventions & pitfalls

- One HTML file; JS sections delimited by `// ====` banner comments.
- Canvas Y is flipped (`P.py`), headings rotate `-heading` on screen.
- `STATE.plan.mainGate` is a legacy alias (first gate) — prefer `plan.gates` +
  `plan.truckGate`; keep the alias for old dashboards/exports.
- `hexSpots` (`buildFieldSpots(verts, mask)`) are visual only; coverage uses
  `ops.filled`. No-go cells get no visual spots either.
- Don't reintroduce a cross-zone gap-fill pass — strict per-zone ownership is a
  product decision (2026-06-11). The 2026-06-12 `coverageGapSpots` pass is
  IN-zone (same assigned truck), which is allowed and required.
- The LOAD-HAUL-DUMP shuttle (one load per trip, exit via the gate nearest the
  dump, reload at the gate) is a product decision (2026-06-12) — don't collapse
  routes back to in-zone serpentine marathons.
- No-go markers must stay REAL exclusions (mask carve-outs), not decoration.
- UI redesigns must keep all class names / IDs / CSS variables (inline styles
  and JS-injected HTML depend on them).
- New page versions go in new files (`indexV5.html`…), older ones move to
  `older versions/`.
