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

## Notes

- No application runtime tests were executed in this pass.
- The validation performed here was structural and documentation-focused.
- The live page changes were verified by file inspection and diff sanity checks, not by browser automation.
