# Changelog

## Summary (latest changes)

- UI/Branding: switched to a light Caterpillar theme; replaced `Barlow Condensed` with `Arial`; updated logo, favicon, and tab title to "AutoDump".
- Site entry: renamed main entry to `index.html` and moved deployable site into `site/`.
- Layout/graphics: removed scanline background; converted the three-layer architecture SVG into a responsive HTML/CSS flex layout.
- Workspace reorg: moved deploy files into `site/`, docs into `docs/`, and archived older assets into `archive/`.
- Deployment/docs: updated `docs/DEPLOY.md` and GitHub Pages workflow to publish from `./site`.
- Tilt simulator: integrated the interactive tilt pile simulator into the About/Method page (visual layer only).
- Git hooks & automation: added hooks in `config/git-hooks/`, `config/setup-git-hooks.ps1`, and `config/sync-commit.ps1` with `git ccommit` alias.
- Verification: confirmed edits pass `git diff --check`.

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

### Verification
- Confirmed the workspace root contains no files after the reorganization.
- Confirmed the edited HTML and documentation files pass `git diff --check`.



### Dummy change made

