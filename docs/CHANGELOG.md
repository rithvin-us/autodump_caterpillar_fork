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

### Verification
- Confirmed the workspace root contains no files after the reorganization.
- Confirmed the edited HTML and documentation files pass `git diff --check`.
