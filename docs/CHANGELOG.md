# Changelog

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

### Git hook workflow
- Added a repo-tracked Git hook set in `config/git-hooks/`.
- Added `config/setup-git-hooks.ps1` to set `core.hooksPath` for the local clone.
- Documented the hook workflow in `config/git-hooks/README.md` and `docs/README.md`.
- Marked the hook scripts executable in the Git index and confirmed the local hooks path is configured.

### Automatic commit wrapper
- Added `config/sync-commit.ps1` to stage code changes, update the docs logs, and create the commit in one step.
- Added the `git ccommit` alias through `config/setup-git-hooks.ps1`.
- Documented the wrapper so the repo has a single, repeatable commit path that keeps changelog and testing notes in sync.

### Verification
- Confirmed the workspace root contains no files after the reorganization.
- Confirmed the edited HTML and documentation files pass `git diff --check`.
