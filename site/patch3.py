import sys

with open(r'e:\caterpillar\caterpillar-dashboard-final\autodump_caterpillar\older versions\index_v3.0.2.html', 'r', encoding='utf-8') as f:
    old_html = f.read()

with open(r'e:\caterpillar\caterpillar-dashboard-final\autodump_caterpillar\site\index_v3.0.3.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Replace greedyDumpsInZone with hexDumpsInZone
greedy_def = """function greedyDumpsInZone(zone, mask, filled, dumpRadius) {
  const dumps = [];
  const rc = Math.ceil(dumpRadius / GRID_RES);
  const cands = [];
  for (let gy = Math.floor(zone.y_bot/GRID_RES); gy <= Math.floor(zone.y_top/GRID_RES); gy++) {
    if (gy < 0 || gy >= HH) continue;
    for (let gx = Math.floor(zone.x_min/GRID_RES); gx <= Math.floor(zone.x_max/GRID_RES); gx++) {
      if (gx < 0 || gx >= HW) continue;
      if (mask[gy*HW+gx]) cands.push([gx*GRID_RES, gy*GRID_RES]);
    }
  }
  while (true) {
    let best = 0, bestXY = null;
    for (let i=0; i<cands.length; i+=4) {
      const [x,y] = cands[i];
      let ok = true;
      for (const d of dumps) if (Math.hypot(d[0]-x,d[1]-y) < dumpRadius*0.6) { ok=false; break; }
      if (!ok) continue;
      const cgx = Math.floor(x/GRID_RES), cgy = Math.floor(y/GRID_RES);
      let gain = 0;
      for (let dy=-rc; dy<=rc; dy++) {
        const ny=cgy+dy; if (ny<0||ny>=HH) continue;
        for (let dx=-rc; dx<=rc; dx++) {
          const nx=cgx+dx; if (nx<0||nx>=HW) continue;
          if (Math.hypot(dx,dy)*GRID_RES <= dumpRadius) {
            const idx = ny*HW+nx;
            if (mask[idx] && !filled[idx]) gain++;
          }
        }
      }
      if (gain > best) { best = gain; bestXY = [x,y]; }
    }
    if (!bestXY || best < 3) break;
    // commit
    const [x,y] = bestXY;
    const cgx = Math.floor(x/GRID_RES), cgy = Math.floor(y/GRID_RES);
    for (let dy=-rc; dy<=rc; dy++) {
      const ny=cgy+dy; if (ny<0||ny>=HH) continue;
      for (let dx=-rc; dx<=rc; dx++) {
        const nx=cgx+dx; if (nx<0||nx>=HW) continue;
        if (Math.hypot(dx,dy)*GRID_RES <= dumpRadius) {
          const idx = ny*HW+nx;
          if (mask[idx] && !filled[idx]) { filled[idx]=1; }
        }
      }
    }
    dumps.push(bestXY);
    if (dumps.length > 60) break;
  }
  return dumps;
}"""

hex_def = """function hexDumpsInZone(zone, mask, filled, dumpRadius) {
  const poly = [
    {x: zone.x_min, y: zone.y_bot},
    {x: zone.x_max, y: zone.y_bot},
    {x: zone.x_max, y: zone.y_top},
    {x: zone.x_min, y: zone.y_top}
  ];
  const spots = buildHexSpots(poly, dumpRadius);
  const dumps = [];
  const rc = Math.ceil(dumpRadius / GRID_RES);

  spots.forEach(s => {
    const cgx = Math.floor(s.x / GRID_RES);
    const cgy = Math.floor(s.y / GRID_RES);
    let isFilled = false;
    if (cgy >= 0 && cgy < HH && cgx >= 0 && cgx < HW) {
      if (mask[cgy * HW + cgx] && filled[cgy * HW + cgx]) {
        isFilled = true;
      } else if (!mask[cgy * HW + cgx]) {
        isFilled = true;
      }
    } else {
      isFilled = true;
    }

    if (!isFilled) {
      for (let dy = -rc; dy <= rc; dy++) {
        const ny = cgy + dy; if (ny < 0 || ny >= HH) continue;
        for (let dx = -rc; dx <= rc; dx++) {
          const nx = cgx + dx; if (nx < 0 || nx >= HW) continue;
          if (Math.hypot(dx, dy) * GRID_RES <= dumpRadius) {
            const idx = ny * HW + nx;
            if (mask[idx]) filled[idx] = 1;
          }
        }
      }
      dumps.push([s.x, s.y]);
    }
  });
  return dumps;
}"""

if greedy_def in html:
    html = html.replace(greedy_def, hex_def)
else:
    print("Could not find greedyDumpsInZone definition!")

# 2. Replace calls
html = html.replace("greedyDumpsInZone(z, mask, filled, drLogical)", "hexDumpsInZone(z, mask, filled, drLogical)")

# 3. Replace drawPlanPreview and ops functions from the older version
start_marker = "function drawPlanPreview() {"
end_marker = "function renderReportPage() {"

# Extract from older version
s_idx_old = old_html.find(start_marker)
e_idx_old = old_html.find(end_marker)

# Find in new version
s_idx_new = html.find(start_marker)
e_idx_new = html.find(end_marker)

if s_idx_old != -1 and e_idx_old != -1 and s_idx_new != -1 and e_idx_new != -1:
    old_section = old_html[s_idx_old:e_idx_old]
    html = html[:s_idx_new] + old_section + html[e_idx_new:]
else:
    print("Could not find sections to replace!")

with open(r'e:\caterpillar\caterpillar-dashboard-final\autodump_caterpillar\site\index_v3.0.3.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Patched successfully!")
