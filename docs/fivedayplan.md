# AutoDump Dashboard — Five-Day Journal

---

## Day 1 — June 4, 2026

We started by tidying the project so everything has a clear home. Website files moved into their own folder, documents into another, and older builds were archived out of the way. This makes it much easier for anyone on the team to find what they need without digging through a pile of files.

We also added an interactive simulator to the About/Method page. You can drag sliders to tilt a virtual truck and watch the material inside it shift as it fills up — like tilting a glass of water and seeing it lean to one side. The picture updates in real time as you move the sliders.

Finally, we set up a rule that blocks any code save unless it comes with a short note describing what changed. This means the project's history will always be easy to read and no change slips through undocumented.

---

## Day 2 — June 5, 2026

The whole dashboard got a new coat of paint. It used to have a dark background; now it's clean white with Caterpillar's signature yellow accents — much closer to the company's own look and feel.

The logo was updated to show the classic Caterpillar lettering with a yellow triangle, the browser tab now shows a matching icon, and the page title was simplified to just "AutoDump". The font switched to a plain, easy-to-read style, the old diagonal stripe pattern in the background was removed, and the three-layer diagram that explains how the system works was rebuilt so it stretches and shrinks cleanly on any screen size — no more clipping or overflow on smaller displays.

---

## Day 3 — June 5, 2026

This was the day the dump pattern got smarter. The old approach placed dump spots in a regular grid — think of tiles on a bathroom floor. We replaced that with a staggered pattern, like the holes in a beehive: every other row shifts across by half a step, which means the circles pack together more tightly and cover the field with fewer wasted gaps between them.

The live simulation came back to life as well. You can now watch trucks drive across the field to each spot: a circle glows orange while a truck is actively dumping there, then turns green when it finishes and the truck moves on. Each work area gets a dashed border and a short label (Z1, Z2, and so on) so it is easy to see at a glance which truck is working where.

The old coloured heat-map that used to wash over the field was removed in favour of these per-spot circles, which are cleaner and more informative.

---

## Day 4 — June 11, 2026

Today fixed a set of measurement and drawing problems that had been quietly giving wrong answers on any field that is not a simple rectangle.

On U-shaped or L-shaped fields, the system used to draw work zones straight across the empty notch in the middle — essentially telling trucks to dump in thin air. That is fixed: zones now trace the actual outline of the field and leave the notch empty.

Zone sizes were also being exaggerated. If a zone's strip extended even partly outside the field boundary, the old code still counted the full strip. On a triangular field this inflated the capacity numbers by about 17%. The new code measures only the part of each strip that actually sits inside the field, bringing the error down to about 0.1%.

Very narrow parts of a field — a sliver as thin as a quarter of a metre — used to be missed entirely, sometimes causing the system to claim the entire field width as one enormous phantom zone. That is now measured exactly.

All the strips within a region are now the same height, the way you would cut a cake into equal slices. Before, the last slice could end up noticeably thicker than the rest.

Drawing a road that just grazes a corner no longer creates a useless crumb-sized region on one side, and a badly drawn road can no longer accidentally erase the whole field.

Region labels (Region A, Region B, and so on) now stay consistent every time you regenerate the plan. Before, drawing the same road in the opposite direction could swap the names, which confused the schedule and the summary table.

All six of these fixes were verified with an automated side-by-side test comparing the old and new code across six different field shapes. Every single check passed — 18 out of 18.

---

## Day 5 — June 11, 2026

The last day focused on making sure work is shared fairly when more than one big truck is on the field.

The old planner divided the field by zone area on paper, but the real measure of how hard a truck works is how many dumps it makes. This meant two identical trucks could end up with noticeably unequal workloads — in one test, one truck was assigned 664 dumps while the other got only 560.

The new planner counts the actual dump spots in each zone first, then hands zones out one by one so each truck ends up with a nearly equal number of dumps. That same test now gives 584, 588, and 636 — much closer together.

Each truck also visits its zones in a sensible order, going to the nearest zone next rather than jumping across the field to the biggest one. This cuts the total distance driven by two to seven percent depending on the field shape.

Small support trucks that clean up any missed spots also share that remaining work by the number of spots, not just the number of zones.

On screen, these changes are visible: when two or more identical trucks are assigned, the coloured zones in the plan preview now form neat clusters rather than a scattered patchwork, the assignments table shows nearly equal dump counts and travel distances, and the estimated finish time drops a few percent.

---

On a plain rectangular field with a single big truck, the picture looks almost the same as before — all of these improvements become noticeable on irregular field shapes and larger fleets.
