# Testing Log

## Format

- `ID`: test or issue identifier
- `Scope`: area under test
- `Command` or `Action`: exact command or manual check performed
- `Expected`: what should happen
- `Result`: what happened
- `Status`: `PASS` or `FIXED`
- `Error` and `Rectification`: only for failures or corrections

## Log

### T-001
- Scope: Repository layout cleanup
- Action: moved root files into folders
- Expected: repository root contains folders only
- Result: root files were moved into `site/`, `docs/`, `archive/`, `older versions/`, and `references/`
- Status: PASS

### T-002
- Scope: Docs and deploy paths
- Action: updated docs and GitHub Pages workflow to point at `site/`
- Expected: documentation and deployment instructions reference the new folder layout
- Result: `docs/README.md`, `docs/DEPLOY.md`, and `.github/workflows/pages.yml` now point to `site/`
- Status: PASS

### T-003
- Scope: Tilt simulator integration
- Action: added the interactive pile simulator to the About / Method page in `site/index.html`
- Expected: canvas, sliders, ratio bar, and animation render without the formula panel
- Result: the interactive sidebar and animated canvas were added successfully
- Status: PASS

### T-004
- Scope: Patch application
- Action: attempted an initial patch for the tilt simulator
- Expected: patch tool accepts the edit payload
- Result: patch tool rejected the first payload because the required `explanation` field was missing
- Error: invalid tool input schema
- Rectification: resent the patch with a valid `explanation` field
- Status: FIXED

### T-005
- Scope: Whitespace and diff sanity
- Command: `git diff --check`
- Expected: no whitespace or patch-format errors
- Result: command completed with no output
- Status: PASS

### T-006
- Scope: Workspace cleanup
- Command: repository root check
- Expected: no files remain at the repository root
- Result: root now contains folders only
- Status: PASS

### T-007
- Scope: Documentation content check
- Command: read `docs/README.md`, `docs/DEPLOY.md`, and `older versions/README.md`
- Expected: wording matches the new folder layout
- Result: docs reference `site/` and the archived folder structure correctly
- Status: PASS

### T-008
- Scope: Git hook setup
- Command: `powershell -ExecutionPolicy Bypass -File .\config\setup-git-hooks.ps1`
- Expected: local clone uses `config/git-hooks` as the active hooks path
- Result: `core.hooksPath` was configured to `E:\caterpillar\caterpillar-dashboard-final\autodump_caterpillar\config\git-hooks`
- Status: PASS

### T-009
- Scope: Git hook files
- Command: read `config/git-hooks/README.md`, `config/git-hooks/pre-commit`, and `config/git-hooks/post-commit`
- Expected: hook files and usage notes are present and consistent
- Result: hook files and setup notes were created successfully
- Status: PASS

### T-010
- Scope: Git hook activation
- Command: `git config --local core.hooksPath` and `git diff --check`
- Expected: hooks path points to `config/git-hooks` and the workspace diff is clean
- Result: `core.hooksPath` resolved to `E:\caterpillar\caterpillar-dashboard-final\autodump_caterpillar\config\git-hooks`; `git diff --check` returned no output
- Status: PASS

### T-011
- Scope: Sync commit wrapper
- Command: parse `config/sync-commit.ps1` with `System.Management.Automation.Language.Parser`
- Expected: the new wrapper script is syntactically valid PowerShell
- Result: parser completed with no syntax errors
- Status: PASS

### T-012
- Scope: Git alias wiring
- Command: `git config --local alias.ccommit`
- Expected: alias points at the sync wrapper
- Result: alias resolved to `!powershell -ExecutionPolicy Bypass -File E:\caterpillar\caterpillar-dashboard-final\autodump_caterpillar\config\sync-commit.ps1`
- Status: PASS

### T-013
- Scope: GitHub Pages entry point
- Action: restored `site/index.html` as the deploy root and repointed the public README link to the Pages root
- Expected: clicking the deployed link opens the live AutoDump app in a browser
- Result: the site now has a root entry file again, so Pages can resolve the published app without relying on a dead `/site/` path
- Status: FIXED

### T-014
- Scope: `site/indexV4.html` inline JavaScript syntax (2026-06-11)
- Command: extracted all 4 `<script>` blocks via Node regex, then `node --check` on each block
- Expected: every script block parses without syntax errors
- Result: all 4 blocks reported OK (`block0 OK` … `block3 OK`)
- Status: PASS

### T-015
- Scope: Zone Decomposition rewrite validation — old (git HEAD) vs new (working tree) implementations of `buildZones`, `polyXRange`/`scanlineSpans`/`stripSpans`, `zoneInsideFrac`, `cleanPoly`, `splitPolygonByPathways`, `clipPolyHalfplane` (2026-06-11)
- Command: `node tests/zone_decomp_validation.mjs`
- Expected: each of the 6 tests reproduces the old bug on the HEAD implementation and confirms the fix on the new implementation
- Result: `=== 18 passed, 0 failed ===`
  - T1 U-shape: old produced 1 zone bridging the concave gap (probe point (12,10) outside polygon but inside zone); new produced 0 bridging zones and 2 zones per arm strip.
  - T2 Triangle area: old sum of zone areas = 280 vs true 240 (16.7% over); new = 239.76 (0.1% error).
  - T3 Thin chimney (0.26 wide, off the 0.4 sampling grid): old reported phantom 20-unit-wide zones via the bbox fallback; new reported 0.26-wide zones.
  - T4 Sliver strips (height 2.4×truckWidth): old strips [4, 5.6] with `merged_sliver=true`, top zone claimed area 79.04 vs true 63 (25% over); new uniform strips [4.8, 4.8], top zone area 49.95 vs true 50.39 (0.9% error).
  - T5 Degenerate pathway: old threw `".for is not iterable"` on a null pathway entry; new skipped it and still produced 2 regions. Corner-grazing cut: old kept a 5.0e-3-area micro-fragment region; new dropped it (1 region). Dirty polygon through new clipper: no duplicate/collinear vertices.
  - T6 Ordering: old Region A centroid flipped (10,5)→(10,15) when the pathway direction was reversed; new stayed (10,5) in both directions.
- Status: PASS

### T-016
- Scope: Truck assignment workload rebalance — Step 4 of `runPlan` in `site/indexV4.html` (2026-06-11)
- Command: `node tests/assignment_balance_eval.mjs` (old vs new heuristic, real functions extracted from the page) and `node --check` on all 4 extracted `<script>` blocks after the edit
- Expected: new heuristic (LPT on precomputed dump counts + locality tie-break + nearest-neighbour visit order + small-truck gap-dump balancing) reduces total distance and tightens per-truck dump spread without changing total dumps materially
- Result:
  - Scenario A (L-field + road, 2× Cat 797 + 2× Cat 785): total km 40.88 → 38.92 (−4.8%), dump CV 0.02 preserved, totalDumps 1808 both.
  - Scenario B (L-field + road, 3× Cat 793): dumps 664/560/584 → 584/588/636 (CV 0.07 → 0.04), makespan 1700 → 1628.5 min (−4.2%), total km 42.30 → 39.51 (−6.6%).
  - Scenario C (rectangle, 1 big + 3 small): total km 35.03 → 34.33 (−2.0%), everything else unchanged.
  - Post-edit syntax check: `ALL SCRIPT BLOCKS OK`.
- Status: PASS

### T-017
- Scope: Priority-weighted zone assignment across the whole fleet — replaces the big/small payload gate in Step 4 of `runPlan` (`site/indexV4.html`) (2026-06-11)
- Command: `node tests/live_sim_completion.mjs` (assignment assertions; functions extracted live from the page via brace-counted slices and run in a `vm` sandbox)
- Expected: mixed fleet no longer funnels all zones to the dominant truck; homogeneous fleets stay balanced; the new Priority column shifts the planned share
- Result:
  - Mixed fleet (1× Cat 797 + 3× Cat 785, rectangle site): zones 3/3/3/3, planned dumps 132/176/176/132 (max/min ratio 1.33 ≤ 2.0). Before the fix the Cat 797 received every zone.
  - Homogeneous (3× Cat 793): planned dumps 220/220/176, CV 0.101 ≤ 0.25.
  - Priority (3× Cat 793, T1 priority = 2): planned dumps 308/132/176 — T1 gets 2.00× the mean of the others.
- Status: PASS

### T-018
- Scope: Live-simulation robustness — token heartbeat/TTL, queued-truck defer, orbit watchdog, adaptive rebalance, dump-synced progress and completion (`opsTick` and helpers in `site/indexV4.html`) (2026-06-11)
- Command: `node tests/live_sim_completion.mjs` (headless `opsTick(0.045)` loop, 400k-tick budget) and inline-script syntax check via `new vm.Script` on all 3 `<script>` blocks
- Expected: every scenario completes all planned dumps with all trucks finished and all tokens released; forced shared-zone contention drains instead of deadlocking; an idle truck steals pending work from a lagging truck
- Result: 14/14 assertions pass —
  - Mixed fleet: 616/616 dumps in 1,422 ticks; all tokens released.
  - Forced contention (T1's first 5 dump waypoints duplicated into T2's route): queue events observed, both trucks finish in 2,609 ticks, no token freeze, all tokens released.
  - Forced imbalance (T1 given a trivial route, T2 given both trucks' work): 7 REBALANCE events, everything completes in 2,510 ticks.
  - Single truck: 616/616 dumps in 4,929 ticks. Zero-dump plan: completes in 41 ticks.
  - `tests/zone_decomp_validation.mjs` re-run after the edits: `=== 18 passed, 0 failed ===`. Script blocks: `block0 OK`, `block1 OK`, `block2 OK`.
- Status: PASS

### T-019
- Scope: Main Gate → haul roads → auto zones architecture redesign (`autoDecomposeZones`, `buildHaulRoads`, `zoneEntryPoint`, `haulRoadsToSegments`, refactored `runPlan` Steps 2–4 in `site/indexV4.html`) (2026-06-11)
- Command: `node tests/haulroad_zone_check.mjs` (functions extracted live from the page into a `vm` sandbox), `node tests/live_sim_completion.mjs`, plus `new Function(...)` syntax check on all 3 inline `<script>` blocks
- Expected: demo polygon + 3 trucks yields exactly 3 contiguous, roughly balanced zones; zone areas sum to the polygon area; haul road network connects the Main Gate to every zone access point via `laneRoute`; degenerate inputs return no zones; existing simulation suite unaffected
- Result:
  - Demo polygon (129,722 m², 3 trucks, 50,000 m² target): 3 zones of 39,870 / 52,932 / 36,920 m²; area conservation 100.00%.
  - Haul roads: 1 spine + 3 branches (4 segments); routes gate→Z1/Z2/Z3 all resolve over the road network (2–3 points each).
  - Edge cases: 1-truck rectangle → 1 zone; 8-zone L-shape → 8 zones; 2-vertex degenerate input → 0 zones.
  - `tests/live_sim_completion.mjs` after the refactor: `=== 14 passed, 0 failed ===`. Script blocks: all 3 `OK`.
- Status: PASS

### T-020
- Scope: Multi-gate path planning, one-path-per-zone, equal mixed-fleet allocation, live-sim smoothing (`buildHaulRoads` multi-gate, `hexDumpsInZone` zone-polygon packing, `boustrophedonOrder` serpentine rewrite, `assignZonesWeighted` zone-count cap, `zoneAt` polygon test, refactored `runPlan` Steps 3–4, `opsTick` throttle/corner braking, `drawTruck` model-distinct rendering in `site/indexV4.html`) (2026-06-11)
- Command: `node tests/multigate_path_check.mjs` (functions extracted live from the page into a `vm` sandbox; headless `opsTick(0.045)` loop for the end-to-end run), plus re-runs of `node tests/live_sim_completion.mjs`, `node tests/zone_decomp_validation.mjs`, `node tests/haulroad_zone_check.mjs`, and `new vm.Script` syntax check on all 3 inline `<script>` blocks
- Expected: with 2 gates on the demo polygon and a 4-truck mixed fleet (797/793/785/785, 20 000 m² zone target → 7 zones): one spine per gate; every gate routes to every zone access point; one serpentine path per zone with all dump spots inside the zone's true polygon and the site; zone counts per truck differ by ≤ 1; every dump waypoint lies in its truck's own zones; routes start at the home gate and end at a gate; the full sim completes with all tokens released; the legacy single-`[x,y]` gate call form still works; existing suites unaffected
- Result: `=== 16 passed, 0 failed ===`
  - Road network: 9 polylines (2 spines + 7 branches); zone `gateIdx` = 0,0,0,0,1,1,1 (east zones face G2); all 14 gate→zone routes resolved.
  - Zone paths: Z1–Z7 dump counts 182/257/341/350/286/253/185; all spots inside zone polygon and site polygon; rows strictly ascend and sweep direction alternates (true serpentine).
  - Allocation: zones 1/2/2/2 (max−min ≤ 1); home gates T1:G1 T2:G1 T3:G1 T4:G2; every dump waypoint in its truck's own zones; all routes gate-bookended.
  - End-to-end sim: 1854/1854 dumps in 5,339 ticks, all tokens released. Back-compat single-gate call: 4 polylines, all access points set.
  - Re-runs after the edits: `tests/live_sim_completion.mjs` `=== 14 passed, 0 failed ===` (tick counts grew ~40 % from the new throttle ramp/corner braking — expected, well within the 400k budget); `tests/zone_decomp_validation.mjs` `=== 18 passed, 0 failed ===`; `tests/haulroad_zone_check.mjs` zones 3/3, area conservation 100.00 %, all routes resolve; script blocks `block0 OK`, `block1 OK`, `block2 OK`.
- Status: PASS

### T-021
- Scope: Rigid difficult-terrain path planning — load-haul-dump shuttle cycle, coverage completion pass (`coverageGapSpots`), no-go exclusion masking (`buildMask(V, nogo)`), concave-zone access points (`zoneEntryPoint` edge midpoints), end-to-end shuttle sims on hard sites (`site/indexV4.html`) (2026-06-12)
- Command: `node tests/hard_path_planning.mjs` (functions extracted live from the page into a `vm` sandbox; exact mirror of the new runPlan Steps 1–4; headless `opsTick(0.045)` loops, 600k-tick budget)
- Expected: H1 demo polygon + 2 gates + mixed 793/785/797 fleet — one load per trip (loads = dumps − 1 per truck), a gate visit between any two dumps, every trip exits via the gate nearest its dump, all dumps in-polygon, gap pass adds dumps, projected coverage ≥ 98.5 %, sim completes with tokens released and reload cycles counted; H2 rectangle + 2 no-go circles — mask carves the circles, no dump inside any circle, workable coverage ≥ 98.5 %; H3 U-shaped concave site with gates at both arm tips — dumps in-polygon, every gate routes to every zone access, sim completes; H4 dumbbell with a 1.2-unit corridor — zones decompose, dumps in-polygon, coverage ≥ 97 %
- Result: `=== 19 passed, 0 failed ===`
  - H1: 3 zones, 1,880 dumps (87 gap-fill), projected coverage 100.00 %; sim 1,880/1,880 dumps in 86,711 ticks; cycles T1:533 T2:579 T3:550; all tokens released.
  - H2: coverage of workable area 100.00 % with both circles fully excluded (1,274 dumps).
  - H3: 1,304/1,304 dumps in 86,984 ticks; all 4 gate→zone routes resolve; coverage 100.00 %.
  - H4: 2 zones, 830 dumps, coverage 100.00 %.
  - First run exposed 3 findings, fixed before the final pass: (1) REAL BUG — a hex spot just inside a no-go circle could slip through when its grid cell centre sat outside; fixed by inflating the blocking radius by half a cell diagonal in `buildMask`. (2) checker semantics — routes may legitimately pass THROUGH another gate's road node when a zone's haul-road branch starts at that gate; gate visits are now detected via `"load"` waypoints. (3) checker semantics — a zone access point may coincide exactly with a gate, making the route a single point (valid).
- Status: PASS

### T-022
- Scope: Shuttle-cycle + no-go + report + V2V/Telemetry redesign regression sweep — `"load"` waypoints/`loading` state, token release-on-zone-exit, zone-grouped rebalance steal, real-km fix, footprint spot fill, `laneRoute` memoisation, `REAL_MINING` report tables, telemetry ring buffer (`site/indexV4.html`) (2026-06-12)
- Command: re-runs of `node tests/multigate_path_check.mjs`, `node tests/live_sim_completion.mjs`, `node tests/zone_decomp_validation.mjs`, `node tests/haulroad_zone_check.mjs` after all edits, plus `new vm.Script` syntax check on all 3 inline `<script>` blocks (suite const lists extended with `LOAD_MIN`/`DUMP_MIN`)
- Expected: all existing suites unaffected by the workflow redesign (their harnesses build legacy serpentine routes — `opsTick` must keep completing those too)
- Result: `multigate_path_check` `=== 16 passed, 0 failed ===` (A7 end-to-end 1,854/1,854 dumps in 5,370 ticks); `live_sim_completion` `=== 14 passed, 0 failed ===` (T5 rebalance now 3,541 ticks with the zone-grouped steal); `zone_decomp_validation` `=== 18 passed, 0 failed ===`; `haulroad_zone_check` zones 3/3, area conservation 100.00 %, all routes resolve; script blocks `block0 OK`, `block1 OK`, `block2 OK`
- Status: PASS

### T-023
- Scope: Live Operations de-stagnation — off-shift time-warp, coverage/KPI sync (`applyDump` logical-radius + planned-spot painting), coverageHistory throttle, batched hex-spot rendering, O(n) rebalance rebuild with zombie-trip cleanup, dump/reload progress rings (`opsTick`, `drawOps`, `drawTruck`, `rebalanceIdleTruck`, `_dSCls` in `site/indexV4.html`) (2026-06-12)
- Command: `node tests/hard_path_planning.mjs` (suite extended with scenario H5: rectangle, 1 gate, 2 trucks with a deliberately tiny 06:00–07:00 shift on a route needing thousands of sim-minutes; mid-run coverage checkpoint at 50 % of planned dumps), plus re-runs of `node tests/multigate_path_check.mjs`, `node tests/live_sim_completion.mjs`, `node tests/zone_decomp_validation.mjs`, `node tests/haulroad_zone_check.mjs`, and `new vm.Script` syntax check on all 3 inline `<script>` blocks
- Expected: the 1-hour-shift fleet completes all dumps via the off-shift time-warp (with "clock advanced" events) instead of freezing; mid-run coverage equals the dump-progress ratio within 10 pp (no premature 100 %); final coverage ≥ 99 %; `coverageHistory` holds far fewer than one entry per tick; existing suites (including T5 rebalance, which exercises the new O(n) rebuild via the legacy fallback) unaffected
- Result: `=== 24 passed, 0 failed ===`
  - H5: 1,056/1,056 dumps in 62,682 ticks with 84 time-warp events; mid-run coverage 50.0 % at exactly 50.0 % of dumps; final coverage 100.00 %; coverageHistory 8,971 samples over 62,682 ticks (~1 per 7 ticks).
  - Intermediate finding during the fix: correcting only the radius left final coverage at 70.17 % — `applyDump` was painting at the truck's position (up to an arrival radius from the spot); painting at the planned dump waypoint brought mid-run sync to ±0.0 pp and final coverage to 100.00 %.
  - Re-runs: `multigate_path_check` `=== 16 passed, 0 failed ===`; `live_sim_completion` `=== 14 passed, 0 failed ===` (T5: 7 rebalance events, completes in 3,541 ticks on the new rebuild path); `zone_decomp_validation` `=== 18 passed, 0 failed ===`; `haulroad_zone_check` OK; script blocks `block0 OK`, `block1 OK`, `block2 OK`.
- Status: PASS

### T-025
- Scope: Per-truck dynamic path planning + mine-rule collision avoidance — `routeOnGraph` traffic-mode cost terms (linear early-spread `0.5·u`, static hub toll `0.35·(deg−2)`, per-truck ±12 % corridor bias via `truckSeed`), always-on `rerouteNextLeg` (haul-in at every reload AND haul-out after every dump, diversity vs own previous leg, change-gated logging), `moveTruckWithAvoidance` rewrite (nearest-AHEAD blocker, loaded-over-empty right of way, head-on both-keep-right) (`site/indexV4.html`) (2026-06-13)
- Command: `node tests/congestion_routing_check.mjs` (C2 expectation updated for the linear term; new C9 avoidance units + C10 per-truck bias), plus re-runs of `node tests/hard_path_planning.mjs`, `node tests/multigate_path_check.mjs`, `node tests/live_sim_completion.mjs`, `node tests/zone_decomp_validation.mjs`, `node tests/haulroad_zone_check.mjs`, and the 3-script-block `new vm.Script` syntax gate
- Expected: cost at capacity = (1+α+0.5)·len with convexity preserved; laneRoute ε=1.0 parity unaffected (new terms are flows-gated); empty truck yields to a loaded truck ahead while the loaded one proceeds; a head-on pair both shift to their own right with opposite lateral offsets and neither stops; a truck close BEHIND triggers no yield; truckSeed produces truck-specific route costs; all sims still complete
- Result: `congestion_routing_check` `=== 27 passed, 0 failed ===` (first run caught the stale C2 expectation — c(κ)=21.00 vs the old 16.00 — fixed as intended behaviour; C7 reroutes now 38 on the forced-saturation scenario with always-on re-planning; de-centering 3/24 routes via hub; C9 lateral offsets −0.90/+0.90; C10 costs 28.780 vs 28.496). Re-runs: `hard_path_planning` `=== 24 passed, 0 failed ===`, `multigate_path_check` `=== 16 passed, 0 failed ===`, `live_sim_completion` `=== 14 passed, 0 failed ===`, `zone_decomp_validation` `=== 18 passed, 0 failed ===`, `haulroad_zone_check` OK; script blocks `block0 OK`, `block1 OK`, `block2 OK`.
- Status: PASS

## Notes

- No application runtime tests were executed in this pass.
- The validation performed here was structural and documentation-focused.
- The live page changes were verified by file inspection and diff sanity checks, not by browser automation.
