# AutoDump v3 patches — Site polygon → roads → sub-regions → per-region zones

Drop `index.html` into your repo's `site/` folder, replacing the current one.

## What's new

### Step 1 — Real-world scale
- **New input on Site Setup**: "Canvas width" (default 500 m). Sets how many real metres
  the full canvas represents.
- **Area now shows m² + hectares + acres** in three KPI tiles.
- All downstream calculations use this scale: truck widths get converted from metres
  to logical units, dump radii get converted, and route distances are reported in km.

### Step 2 — Pathway / road drawing
- **New drawing mode**: "Pathway / Road" (purple ━ icon). Two-click line segments.
- **Hover preview** while drawing the second point.
- Pathways render with purple dashed strokes + `R1`, `R2`, … labels.
- **Undo** in pathway mode removes the in-progress endpoint, or the last pathway.
- **New KPI tiles**: "roads" count + live "regions" count (computed on every click).

### Step 3 — Polygon splitting (Sutherland-Hodgman, ANY angle)
- The original plan used pathway Y-midpoints to split horizontally — broken for
  diagonal roads.
- New: each pathway acts as an arbitrary line cutter. `clipPolyHalfplane` clips the
  polygon twice (once for each side of the line) using proper Sutherland-Hodgman.
- **Plan Generation** now:
  1. Splits the field into sub-regions using all pathways
  2. For each region: small (`<5000 m²`) → single zone; large → strip decomposition
  3. Truck width (metres) converted to logical units before decomposition
  4. Distance in km converted via real-world scale
- **Plan preview canvas** also shows the road dashes + `R1`/`R2` labels overlaid on the zones.

## Verified

```
Polygon: [[5,5],[25,5],[25,20],[5,20]] @ 500 m canvas (83,333 m²)

  no pathways                 → 1 region · 83333 m²
  1 horizontal road  y=12     → 2 regions · 38889 + 44444 m²
  1 diagonal road    (5,5)→(25,20) → 2 regions · 41667 + 41667 m²  ← any angle works
  2 crossing roads (H + V)    → 4 quadrant regions
  road outside polygon        → 1 region (no-op)

Scale-aware decomposition:
  500 m canvas, 7.6 m Cat 793 → 33 zones
  200 m canvas, 7.6 m truck   → 13 zones
  100 m canvas, 7.6 m truck   →  7 zones
```

## Demo flow (60 seconds)

1. Site Setup → preset "L-shape"
2. Drawing mode → **Pathway / Road**
3. Click two points anywhere on the polygon, at any angle
4. Click two more points for a second road
5. Watch the "regions" KPI update to 3 or 4
6. Fleet Config → load demo
7. Plan Generation → ⚙ Generate plan
8. Plan canvas shows zones colored per region with road overlays

## Files NOT touched

- About page (your tilt simulator integration unchanged)
- Live Operations multi-truck sim (unchanged — still works on the new zones)
- Report & Export (unchanged — auto-picks up the new plan structure)
- Fleet Config (unchanged)

So everything you already shipped keeps working; this only adds new capability on top.
