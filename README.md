# AutoDump

> **Reinforcement-learning optimal dump packing for autonomous Cat 793 mining trucks.**
> Caterpillar Innovation Challenge 2026 — Problem Statement 4
> Team **Techiva@26** · PSG Institute of Technology

[![Status](https://img.shields.io/badge/status-prototype-FFC107)]()
[![Stack](https://img.shields.io/badge/stack-single--file%20HTML-3DB5F7)]()
[![Coverage](https://img.shields.io/badge/coverage-62%25%20→%2075%25-00D26A)]()
[![Hardware](https://img.shields.io/badge/new%20hardware-ZERO-00D26A)]()

## 🌐 [▶ Open the live demo](https://YOUR-USERNAME.github.io/autodump/)

A three-layer software system that raises field coverage of autonomous Cat 793 dump trucks
on irregular mining polygons from **62.18 %** (current Cat practice) to **74.84 %** (trained
RL agent) — a **+12.66 percentage-point** improvement with **zero new hardware**.

The site is a single self-contained HTML file. The trained Q-table, the training history,
the polygon math, the token broker, and the greedy circle-packer are all embedded inline as
JavaScript. The only network call is to `fonts.googleapis.com` for the typeface (with system
font fallbacks if that fails).

Older standalone builds are kept in the `older versions/` folder for reference. The live
site entry point is `site/index.html`.

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — summary of the repo reorganization and feature updates.
- [TESTING.md](TESTING.md) — testing log with errors, fixes, and verification results.

## What's inside

| Page | What it shows |
|---|---|
| **Problem Statement** | KPIs · the 62 % baseline · three-layer architecture |
| **Zone Decomposition** | Animated sweep-line algorithm · O(n log n) |
| **Live RL Simulation** | Trained Q-agent placing dumps in real time |
| **ML Training Results** | Hand-drawn SVG charts of reward + coverage curves |
| **Before vs After** | Side-by-side rigid grid vs RL policy |
| **Token Protocol** | 4 live Coffman-1971 scenarios |
| **Custom Field** | Judge draws their own polygon · pipeline rebuilds live |
| **Architecture** | Pipeline SVG · in-browser modules · deployment notes |

## Architecture (3 layers)

1. **Zone Decomposition** — Sweep-line in O(n log n). Sliver-merge + MultiPolygon handling.
2. **Q-Learning Agent** — Tabular ε-greedy, 60 states × 3 actions, trained 1500 episodes.
3. **Token Broker** — FIFO + heartbeat watchdog + physical-clearance flag.
   Provably deadlock-free against all four Coffman-1971 conditions.

## Measured results

| Metric | Baseline (current Cat) | AutoDump RL | Theoretical ceiling |
|---|---|---|---|
| Coverage | 62.18 % | 74.84 % | 99.41 % |
| Dumps placed | 10 | 72 | 27 |
| Decision time | manual | < 1 ms / step | — |
| Deadlock-free | no | **yes** (Coffman proof + 4 live scenarios) | — |
| New hardware | — | **ZERO** | — |

## Local development

You don't actually need a web server — `site/index.html` opens directly in any browser.
But during development a local server helps with cache busting:

```bash
cd site/
python3 -m http.server 8000
# open http://localhost:8000/
```

## Full source code

This repo contains only the deployable static site. The full Python source — including
the Q-learning trainer, the Flask-style backend, and the test suite — lives at:

[github.com/YOUR-USERNAME/autodump-source](https://github.com/YOUR-USERNAME/autodump-source)

## Citation

```bibtex
@misc{techiva2026autodump,
  title  = {AutoDump: Reinforcement-Learning Optimal Dump Packing for Autonomous Mining Trucks},
  author = {Team Techiva@26},
  year   = {2026},
  note   = {Caterpillar Innovation Challenge 2026, Problem Statement 4},
  institution = {PSG Institute of Technology}
}
```

## License

Prototype built for the Caterpillar Innovation Challenge 2026.
Independent research — not affiliated with Caterpillar Inc.
