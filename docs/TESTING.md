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

## Notes

- No application runtime tests were executed in this pass.
- The validation performed here was structural and documentation-focused.
- The live page changes were verified by file inspection and diff sanity checks, not by browser automation.
