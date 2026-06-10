# Graph Report - .  (2026-06-10)

## Corpus Check
- 27 files · ~67,787 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 44 nodes · 71 edges · 11 communities (7 shown, 4 thin omitted)
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Project Status Badges|Project Status Badges]]
- [[_COMMUNITY_Dump Algorithms & Geometry|Dump Algorithms & Geometry]]
- [[_COMMUNITY_Changelog Sync Workflow|Changelog Sync Workflow]]
- [[_COMMUNITY_AutoDump Core Architecture|AutoDump Core Architecture]]
- [[_COMMUNITY_Docs Enforcement & Testing|Docs Enforcement & Testing]]
- [[_COMMUNITY_VS Code Debug Config|VS Code Debug Config]]
- [[_COMMUNITY_Site & Version History|Site & Version History]]
- [[_COMMUNITY_Git Hooks Setup|Git Hooks Setup]]
- [[_COMMUNITY_GitHub Pages Deployment|GitHub Pages Deployment]]
- [[_COMMUNITY_Version 1 (Archive)|Version 1 (Archive)]]
- [[_COMMUNITY_Version 2 (Archive)|Version 2 (Archive)]]

## God Nodes (most connected - your core abstractions)
1. `AutoDump Changelog` - 9 edges
2. `AutoDump Site Entry indexV4 (HTML)` - 9 edges
3. `AutoDump Testing Log` - 8 edges
4. `Sweep-Line Zone Decomposition` - 8 edges
5. `AutoDump Root README` - 7 edges
6. `Docs Maintainer Agent` - 4 edges
7. `GitHub Pages Deploy Workflow` - 4 edges
8. `Git Hooks README` - 4 edges
9. `AutoDump Docs README` - 4 edges
10. `AutoDump Three-Layer System` - 4 edges

## Surprising Connections (you probably didn't know these)
- `GitHub Pages Deploy Workflow` --references--> `AutoDump Site Entry indexV4 (HTML)`  [INFERRED]
  .github/workflows/pages.yml → site/indexV4.html
- `AutoDump Changelog` --references--> `Tilt Design Reference HTML`  [EXTRACTED]
  docs/CHANGELOG.md → references/tilt_design.html
- `AutoDump Index v3.0.2 (HTML)` --implements--> `Sweep-Line Zone Decomposition`  [INFERRED]
  older versions/index_v3.0.2.html → README.md
- `AutoDump Site Entry indexV4 (HTML)` --implements--> `Hex-Spot Dump Packing (hexDumpsInZone)`  [INFERRED]
  site/indexV4.html → docs/CHANGELOG.md
- `AutoDump Site Entry indexV4 (HTML)` --implements--> `Q-Learning Agent (Tabular ε-greedy)`  [INFERRED]
  site/indexV4.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Documentation Sync Enforcement System** — git_hooks_pre_commit, git_hooks_post_commit, config_sync_commit, github_agents_docs_maintainer [INFERRED 0.90]
- **AutoDump Three-Layer Pipeline** — zone_decomposition_concept, q_learning_agent_concept, token_broker_concept [EXTRACTED 1.00]
- **Site Deployment Chain** — site_indexv4, github_workflows_pages, github_pages_deployment [EXTRACTED 1.00]

## Communities (11 total, 4 thin omitted)

### Community 0 - "Project Status Badges"
Cohesion: 0.28
Nodes (9): Coverage Improvement: 62% to 75%, New Hardware: ZERO (no new hardware required), Project Metadata Badges, Stack: Single-File HTML, Status: Prototype, Badge: new hardware ZERO, Badge: stack single-file HTML, Badge: status prototype (+1 more)

### Community 1 - "Dump Algorithms & Geometry"
Cohesion: 0.47
Nodes (6): Patch Report 1 - Polygon Roads Sub-regions, Hex-Spot Dump Packing (hexDumpsInZone), AutoDump Index v3.0.2 (HTML), AutoDump Index v3.0.3 (HTML), Sutherland-Hodgman Polygon Clipping, Sweep-Line Zone Decomposition

### Community 3 - "AutoDump Core Architecture"
Cohesion: 0.83
Nodes (4): AutoDump Three-Layer System, Q-Learning Agent (Tabular ε-greedy), AutoDump Root README, Token Broker (Coffman-1971 Deadlock-Free)

### Community 4 - "Docs Enforcement & Testing"
Cohesion: 0.83
Nodes (4): AutoDump Testing Log, Docs-Sync Commit Workflow, Pre-Commit Git Hook, Docs Maintainer Agent

### Community 5 - "VS Code Debug Config"
Cohesion: 0.50
Nodes (3): AutoDump Index v3.0.1 (HTML), configurations, version

### Community 6 - "Site & Version History"
Cohesion: 0.50
Nodes (4): Archived Versions README, Tilt Design Reference HTML, AutoDump 404 Page, AutoDump Site Entry indexV4 (HTML)

### Community 8 - "GitHub Pages Deployment"
Cohesion: 1.00
Nodes (3): Deploy Instructions, GitHub Pages Static Deployment, GitHub Pages Deploy Workflow

## Knowledge Gaps
- **7 isolated node(s):** `version`, `configurations`, `Archived Versions README`, `AutoDump Index v1 (HTML)`, `AutoDump Index v2 (HTML)` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AutoDump Changelog` connect `Changelog Sync Workflow` to `Dump Algorithms & Geometry`, `AutoDump Core Architecture`, `Docs Enforcement & Testing`, `Site & Version History`, `Git Hooks Setup`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `AutoDump Site Entry indexV4 (HTML)` connect `Site & Version History` to `GitHub Pages Deployment`, `Dump Algorithms & Geometry`, `AutoDump Core Architecture`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `Sweep-Line Zone Decomposition` connect `Dump Algorithms & Geometry` to `Changelog Sync Workflow`, `AutoDump Core Architecture`, `Site & Version History`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `AutoDump Site Entry indexV4 (HTML)` (e.g. with `GitHub Pages Deploy Workflow` and `Hex-Spot Dump Packing (hexDumpsInZone)`) actually correct?**
  _`AutoDump Site Entry indexV4 (HTML)` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `Sweep-Line Zone Decomposition` (e.g. with `Hex-Spot Dump Packing (hexDumpsInZone)` and `AutoDump Index v3.0.2 (HTML)`) actually correct?**
  _`Sweep-Line Zone Decomposition` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `version`, `configurations`, `Archived Versions README` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._