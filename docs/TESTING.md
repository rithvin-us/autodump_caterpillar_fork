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

## Notes

- No application runtime tests were executed in this pass.
- The validation performed here was structural and documentation-focused.
- The live page changes were verified by file inspection and diff sanity checks, not by browser automation.
