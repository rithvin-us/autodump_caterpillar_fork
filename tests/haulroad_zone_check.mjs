// Validation for the Main Gate / haul road / auto-zone redesign:
// extracts autoDecomposeZones, buildHaulRoads, zoneEntryPoint, laneRoute from
// site/indexV4.html and checks zone balance, area conservation, road
// connectivity (gate -> every zone access point), and degenerate inputs.
// Run: node tests/haulroad_zone_check.mjs
import fs from "fs";
import vm from "vm";

const html = fs.readFileSync(new URL("../site/indexV4.html", import.meta.url), "utf8");

function extractFn(name) {
  const m = new RegExp(`function ${name}\\s*\\(`).exec(html);
  if (!m) throw new Error("fn not found: " + name);
  let i = html.indexOf("{", m.index), depth = 0, j = i;
  for (; j < html.length; j++) {
    const ch = html[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) break; }
  }
  return html.slice(m.index, j + 1);
}

const fns = ["pip","polyArea","cleanPoly","clipPolyHalfplane","polyCentroid",
  "autoDecomposeZones","zoneEntryPoint","buildHaulRoads","haulRoadsToSegments",
  "laneRoute","_ld","_lkey","_projSeg","_segInt"];
const sb = { console, Math, Map, Set, Infinity };
vm.createContext(sb);
sb.FIELD_W = 30; sb.FIELD_H = 26;
vm.runInContext(fns.map(extractFn).join("\n\n"), sb);

// demo polygon
const verts = [[5,2],[18,1],[25,5],[28,10],[26,18],[22,22],[15,24],[8,23],[3,18],[2,12]];
const areaLogical = sb.polyArea(verts);
const scale = 500 / 30;
const areaM2 = areaLogical * scale * scale;
console.log("demo polygon area:", areaM2.toFixed(0), "m2");

const nTrucks = 3, thr = 50000;
const byArea = Math.max(1, Math.ceil(areaM2 / thr));
const nZones = Math.max(nTrucks, Math.min(nTrucks * 2, byArea, 8));
console.log("byArea:", byArea, "-> nZones:", nZones);

const zones = sb.autoDecomposeZones(verts, nZones);
console.log("zones produced:", zones.length);
zones.forEach(z => console.log(`  Z${z.id+1} area ${(z.area*scale*scale).toFixed(0)} m2  y:[${z.y_bot.toFixed(1)},${z.y_top.toFixed(1)}] verts:${z.verts.length}`));
const sumZ = zones.reduce((s, z) => s + z.area, 0);
console.log("area conservation:", (sumZ / areaLogical * 100).toFixed(2) + "%");

const gate = [5, 8];
const roads = sb.buildHaulRoads(gate, verts, zones);
console.log("haul polylines:", roads.length);
roads.forEach((pl, i) => console.log("  road", i, JSON.stringify(pl.map(p => p.map(x => +x.toFixed(1))))));
const segs = sb.haulRoadsToSegments(roads);
console.log("road segments:", segs.length);
zones.forEach(z => console.log(`  Z${z.id+1} accessPt: ${z.accessPt.map(x => +x.toFixed(1)).join(",")}`));

zones.forEach(z => {
  const r = sb.laneRoute(segs, gate, z.accessPt);
  console.log(`  route gate->Z${z.id+1}: ${r.length} pts  ${JSON.stringify(r.map(p => p.map(x => +x.toFixed(1))))}`);
});

// edge cases
console.log("\nedge cases:");
console.log("  1 truck rectangle:", sb.autoDecomposeZones([[5,5],[25,5],[25,20],[5,20]], 1).length, "zone(s)");
console.log("  8 zones L-shape:", sb.autoDecomposeZones([[3,3],[20,3],[20,12],[10,12],[10,22],[3,22]], 8).length, "zone(s)");
console.log("  degenerate (2 verts):", sb.autoDecomposeZones([[0,0],[1,1]], 3).length, "zone(s)");
