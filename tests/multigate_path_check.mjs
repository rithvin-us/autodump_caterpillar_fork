// ============================================================================
// Validation for the multi-gate / per-zone-path / equal-allocation redesign of
// runPlan Steps 3-4 in site/indexV4.html.
//
// Extracts the real functions out of the page (brace-counted slices, vm
// sandbox) and mirrors the new pipeline:
//   gates[] -> buildHaulRoads (spine per gate + branch per zone)
//   -> assignZonesWeighted (priority-weighted zone-count cap)
//   -> home gate per truck -> one boustrophedon path per zone
//   -> per-truck route: home gate -> zones -> nearest exit gate.
//
// Checks:
//   A1 multi-gate road network shape (spine per gate, accessPt/gateIdx set)
//   A2 every gate can route to every zone access point over the network
//   A3 one path per zone; all dumps inside the zone's true polygon AND site
//   A4 per-zone path is a true serpentine (rows ascend, x-direction alternates)
//   A5 equal allocation: zone counts differ by <= 1 for an equal-priority fleet
//   A6 zone ownership: every dump waypoint of a truck lies in its own zones;
//      route starts at its home gate and ends at some gate
//
// Run:  node tests/multigate_path_check.mjs
// ============================================================================
import { readFileSync } from "fs";
import vm from "vm";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "site", "indexV4.html"), "utf8");

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
function extractConst(name) {
  const m = new RegExp(`const ${name}\\s*=[^;]+;`).exec(html);
  if (!m) throw new Error("const not found: " + name);
  return m[0];
}

const FNS = ["pip","polyArea","cleanPoly","clipPolyHalfplane","polyCentroid",
  "scanlineSpans","stripSpans",
  "autoDecomposeZones","zoneEntryPoint","buildHaulRoads","haulRoadsToSegments",
  "laneRoute","_ld","_lkey","_projSeg","_segInt",
  "buildMask","maskInsideCount","getScale","metresToLogical",
  "pointInPoly","buildHexSpots","hexDumpsInZone","boustrophedonOrder",
  "zoneCentroidOf","assignZonesWeighted","orderZonesNearestNeighbour","truckWeight",
  // live sim (for the end-to-end run on the real multi-gate plan)
  "timeToMin","isOnShift","fmtTime","setText","opsLog","renderTokens",
  "zoneAt","grantToken","resetActiveSpots","releaseToken","releaseTokensHeldBy",
  "brokerTick","deferLockedZone","stuckWatchdog","stealableZoneBlocks",
  "rebalanceIdleTruck","moveTruckWithAvoidance","moveTruckWithTurning",
  "applyDump","opsTick",
  // congestion-aware routing (2026-06-12)
  "buildRoadGraph","routeOnGraph","smoothPathBezier",
  "roadOccupancyTick","congestionSpeedFactor","rerouteNextLeg"];
const CONSTS = ["FIELD_W","GRID_RES","HW","HH",
  "TRUCK_RAD_LOGICAL","CAT793_TURN_M","TOKEN_TTL_MIN","STUCK_RECOVER_MIN","REBALANCE_MIN_DUMPS",
  "LOAD_MIN","DUMP_MIN",
  "BPR_ALPHA","BPR_BETA","ASTAR_EPS","HEADWAY_L","OCC_TICK_MIN","REROUTE_UTIL","FLOW_DECAY"];
const modelsMatch = /const TRUCK_MODELS = \{[\s\S]*?\};/.exec(html);
if (!modelsMatch) throw new Error("TRUCK_MODELS not found");

const fakeEl = () => ({
  style: {}, textContent: "", innerHTML: "", disabled: false,
  children: [], firstChild: null,
  classList: { add() {}, remove() {}, toggle() {} },
  insertBefore() {}, removeChild() {}, appendChild() {},
  setAttribute() {}, getAttribute() { return null; },
});
const sb = { console, Math, Map, Set, Infinity, NaN,
  Uint8Array, Float32Array, Uint16Array, Float64Array, Int32Array,
  Array, Object, String, Number, parseFloat, parseInt, isNaN,
  document: {
    getElementById: () => fakeEl(), createElement: () => fakeEl(),
    querySelector: () => fakeEl(), querySelectorAll: () => [],
  },
  performance: { now: () => 0 },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  drawOps() {}, finalizeReport() {},
  STATE: { site: { realWidthM: 500 }, fleet: { trucks: [] }, plan: null,
           ops: { running: false, t: 0, speedMul: 60, estop: false } } };
sb.opsToggle = () => { sb.STATE.ops.running = false; };
vm.createContext(sb);
sb.FIELD_H = 26;
vm.runInContext([modelsMatch[0], ...CONSTS.map(extractConst), ...FNS.map(extractFn)].join("\n\n"), sb);

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? "  — " + detail : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// demo polygon + two gates (same as the page's demo preset)
const verts = [[5,2],[18,1],[25,5],[28,10],[26,18],[22,22],[15,24],[8,23],[3,18],[2,12]];
const gates = [{ x: 5, y: 8, name: "G1" }, { x: 26, y: 17, name: "G2" }];
const gatesXY = gates.map(g => [g.x, g.y]);
const fleet = [
  { id: "T1", model: "Cat 793", width: 7.6, dumpRadius: 3.2, priority: 1 },
  { id: "T2", model: "Cat 785", width: 6.4, dumpRadius: 2.6, priority: 1 },
  { id: "T3", model: "Cat 797", width: 9.7, dumpRadius: 3.8, priority: 1 },
  { id: "T4", model: "Cat 785", width: 6.4, dumpRadius: 2.6, priority: 1 },
];

// zones — mirror runPlan step 2 with a 20 000 m² target so nZones > nTrucks
const scale = 500 / 30, m2 = scale * scale;
const areaM2 = sb.polyArea(verts) * m2;
const byArea = Math.max(1, Math.ceil(areaM2 / 20000));
const nZones = Math.max(fleet.length, Math.min(fleet.length * 2, byArea, 8));
const zones = sb.autoDecomposeZones(verts, nZones);
zones.forEach((z, i) => { z.id = i; });
console.log(`area ${areaM2.toFixed(0)} m2, nZones=${nZones}, zones=${zones.length}`);

// ── A1: multi-gate road network ──────────────────────────────────────────────
const roads = sb.buildHaulRoads(gatesXY, verts, zones);
const segs = sb.haulRoadsToSegments(roads);
check("A1 spine per gate", roads.length >= gates.length, `${roads.length} polylines`);
check("A1 every zone has accessPt + valid gateIdx",
  zones.every(z => z.accessPt && z.gateIdx >= 0 && z.gateIdx < gates.length));
check("A1 east zones face G2",
  zones.some(z => z.gateIdx === 1), `gateIdx set: ${zones.map(z=>z.gateIdx).join(",")}`);

// ── A2: every gate routes to every zone over the network ────────────────────
let routedOK = true, routedDetail = [];
gates.forEach((g, gi) => zones.forEach(z => {
  const r = sb.laneRoute(segs, [g.x, g.y], z.accessPt);
  const startOK = sb._ld(r[0], [g.x, g.y]) < 1e-6;
  const endOK = sb._ld(r[r.length-1], z.accessPt) < 1e-6;
  if (!(r.length >= 2 && startOK && endOK)) { routedOK = false; routedDetail.push(`G${gi+1}->Z${z.id+1}`); }
}));
check("A2 every gate reaches every zone access point", routedOK,
  routedOK ? `${gates.length * zones.length} routes resolved` : "failed: " + routedDetail.join(" "));

// ── A3/A4/A5/A6: assignment, per-zone paths, ownership ──────────────────────
const HW = vm.runInContext("HW", sb), HH = vm.runInContext("HH", sb);
const mask = sb.buildMask(verts);
const estByRadius = {};
[...new Set(fleet.map(t => t.dumpRadius))].forEach(r => {
  const g = new sb.Uint8Array(HW * HH);
  const drL = sb.metresToLogical(r);
  estByRadius[r] = {};
  zones.forEach(z => { estByRadius[r][z.id] = sb.hexDumpsInZone(z, mask, g, drL).length; });
});
const costOf = (z, t) => estByRadius[t.dumpRadius][z.id];
const entryXY = [gates.reduce((s,g)=>s+g.x,0)/gates.length, gates.reduce((s,g)=>s+g.y,0)/gates.length];
const { assignments, truckZones } = sb.assignZonesWeighted(zones, fleet, costOf, sb.truckWeight, entryXY);

const zoneCounts = fleet.map(t => truckZones[t.id].length);
check("A5 equal allocation: zone counts differ by <= 1",
  Math.max(...zoneCounts) - Math.min(...zoneCounts) <= 1, `zones=${zoneCounts.join("/")}`);

// home gates + per-zone paths (mirror of the page's step 4)
const truckGate = {};
fleet.forEach(t => {
  const zids = truckZones[t.id];
  if (!zids.length) { truckGate[t.id] = 0; return; }
  let gi = 0, bd = Infinity;
  gates.forEach((g, i) => {
    const d = Math.min(...zids.map(zid => {
      const c = sb.zoneCentroidOf(zones.find(zz => zz.id === zid));
      return Math.hypot(c[0]-g.x, c[1]-g.y);
    }));
    if (d < bd) { bd = d; gi = i; }
  });
  truckGate[t.id] = gi;
  truckZones[t.id] = sb.orderZonesNearestNeighbour(zids, zones, [gates[gi].x, gates[gi].y]);
});
check("A6 home gate index valid for every truck",
  fleet.every(t => truckGate[t.id] >= 0 && truckGate[t.id] < gates.length),
  fleet.map(t => `${t.id}:G${truckGate[t.id]+1}`).join(" "));

const filled = new sb.Uint8Array(HW * HH);
const zonePaths = {};
zones.forEach(z => {
  const t = fleet.find(tt => tt.id === assignments[z.id]);
  const spots = sb.hexDumpsInZone(z, mask, filled, sb.metresToLogical(t.dumpRadius));
  zonePaths[z.id] = { truck: t.id, access: z.accessPt, dumps: sb.boustrophedonOrder(spots, z) };
});

check("A3 one path per zone, every zone has dumps",
  zones.every(z => zonePaths[z.id] && zonePaths[z.id].dumps.length > 0),
  zones.map(z => `Z${z.id+1}:${zonePaths[z.id].dumps.length}`).join(" "));

let inZone = true, inSite = true;
zones.forEach(z => zonePaths[z.id].dumps.forEach(d => {
  if (!sb.pip(d[0], d[1], z.verts)) inZone = false;
  if (!sb.pip(d[0], d[1], verts)) inSite = false;
}));
check("A3 all dump spots inside their zone's true polygon", inZone);
check("A3 all dump spots inside the site polygon", inSite);

// serpentine: row y values ascend in visit order; x-direction alternates.
// Single-dump rows have no observable direction but still consume a sweep, so
// the expected direction flips after EVERY row (matches boustrophedonOrder).
let rowsAscend = true, serpOK = true;
zones.forEach(z => {
  const dumps = zonePaths[z.id].dumps;
  const rows = [];
  dumps.forEach(d => {
    const y = +d[1].toFixed(3);
    if (!rows.length || rows[rows.length-1].y !== y) rows.push({ y, xs: [] });
    rows[rows.length-1].xs.push(d[0]);
  });
  for (let i = 1; i < rows.length; i++) if (rows[i].y <= rows[i-1].y) rowsAscend = false;
  let expect = null;                      // unknown until the first multi-dump row
  rows.forEach(r => {
    if (r.xs.length >= 2) {
      const dir = Math.sign(r.xs[r.xs.length-1] - r.xs[0]);
      const mono = r.xs.every((x, i) => i === 0 || Math.sign(x - r.xs[i-1]) === dir);
      if (!mono) serpOK = false;
      if (expect !== null && dir !== expect) serpOK = false;
      expect = -dir;
    } else if (expect !== null) {
      expect = -expect;                   // single-dump row still flips the sweep
    }
  });
});
check("A4 row y values strictly ascend within each zone path", rowsAscend);
check("A4 sweep direction alternates row to row (true serpentine)", serpOK);

// routes: home gate start, gate end, dumps only in own zones
const pushLane = (wp, cur, dest) => {
  const poly = sb.laneRoute(segs, cur, dest);
  for (let i = 1; i < poly.length; i++) wp.push([poly[i][0], poly[i][1], "transit"]);
  return dest;
};
const waypoints = {};
fleet.forEach(t => {
  const wp = waypoints[t.id] = [];
  const home = gates[truckGate[t.id]];
  let cur = [home.x, home.y];
  wp.push([home.x, home.y, "transit"]);
  truckZones[t.id].forEach(zid => {
    const zp = zonePaths[zid];
    if (!zp.dumps.length) return;
    cur = pushLane(wp, cur, zp.access);
    zp.dumps.forEach(d => wp.push([d[0], d[1], "dump"]));
    wp.push([zp.access[0], zp.access[1], "transit"]);
    cur = zp.access;
  });
  const last = [wp[wp.length-1][0], wp[wp.length-1][1]];
  let eg = gates[0], bd = Infinity;
  gates.forEach(g => { const d = Math.hypot(g.x-last[0], g.y-last[1]); if (d < bd) { bd = d; eg = g; } });
  pushLane(wp, last, [eg.x, eg.y]);
  wp.push([eg.x, eg.y, "transit"]);
});

let ownership = true, bookends = true;
fleet.forEach(t => {
  const wp = waypoints[t.id];
  const own = truckZones[t.id];
  wp.forEach(w => {
    if (w[2] !== "dump") return;
    const z = zones.find(zz => sb.pip(w[0], w[1], zz.verts));
    if (!z || !own.includes(z.id)) ownership = false;
  });
  const home = gates[truckGate[t.id]];
  if (sb._ld([wp[0][0], wp[0][1]], [home.x, home.y]) > 1e-6) bookends = false;
  const end = wp[wp.length-1];
  if (!gates.some(g => sb._ld([end[0], end[1]], [g.x, g.y]) < 1e-6)) bookends = false;
});
check("A6 every dump waypoint lies in the truck's own zones", ownership);
check("A6 every route starts at its home gate and ends at a gate", bookends);

// ── A7: headless live sim on the REAL multi-gate plan ───────────────────────
{
  const S = sb.STATE;
  const fleetSim = fleet.map(t => ({ ...t, shiftStart: "00:00", shiftEnd: "23:59", maint: [] }));
  S.fleet.trucks = fleetSim;
  const totalDumps = Object.values(zonePaths).reduce((s, zp) => s + zp.dumps.length, 0);
  S.plan = {
    zones, mask, insideCells: sb.maskInsideCount(mask),
    assignments, truckZones, waypoints, totalDumps,
    gates, mainGate: gates[0], truckGate,
    haulRoadSegs: segs, projectedCov: 0.7, hexSpots: [],
  };
  const HWv = vm.runInContext("HW", sb), HHv = vm.runInContext("HH", sb);
  S.ops = {
    running: true, t: 0, speedMul: 60, estop: false,
    raf: null, timer: null, lastFrame: 0, pulse: 0,
    events: [], coverageHistory: [{ t: 0, cov: 0 }],
    heatmap: new sb.Float32Array(HWv * HHv),
    filled: new sb.Uint8Array(HWv * HHv),
    nFilled: 0, dumpAnims: [],
    trucks: fleetSim.map((t, i) => {
      const home = gates[truckGate[t.id]];
      return {
        id: t.id, model: t.model, width: t.width, dumpRadius: t.dumpRadius,
        color: "#FFC107", speedF: 1, vel: 0,
        x: home.x + i * 0.6, y: home.y + i * 0.3,
        wpIdx: 0, state: "transit", dumpProgress: 0, loaded: true,
        dumps: 0, km: 0, idleMin: 0, finished: false,
        waypoints: waypoints[t.id] || [],
      };
    }),
    tokens: zones.map(z => ({ zone: z.id, holder: null, queue: [], heartbeat: 0 })),
  };
  S.ops.totalPlannedDumps = 0;
  S.ops.zoneRemaining = {};
  S.ops.trucks.forEach(t => t.waypoints.forEach(w => {
    if (w[2] !== "dump") return;
    S.ops.totalPlannedDumps++;
    const z = sb.zoneAt(w[0], w[1]);
    if (z) S.ops.zoneRemaining[z.id] = (S.ops.zoneRemaining[z.id] || 0) + 1;
  }));
  let ticks = 0;
  while (ticks < 400000 && !S.ops.trucks.every(t => t.finished)) { sb.opsTick(0.045); ticks++; }
  const placed = S.ops.trucks.reduce((s, t) => s + t.dumps, 0);
  check("A7 multi-gate sim completes all planned dumps",
    S.ops.trucks.every(t => t.finished) && placed >= S.ops.totalPlannedDumps,
    `${placed}/${S.ops.totalPlannedDumps} dumps in ${ticks} ticks`);
  check("A7 all tokens released at end", S.ops.tokens.every(t => t.holder === null));
}

// single-gate back-compat: legacy [x,y] call form still works
const zones1 = sb.autoDecomposeZones(verts, 3);
zones1.forEach((z, i) => z.id = i);
const roads1 = sb.buildHaulRoads([5, 8], verts, zones1);
check("back-compat: single [x,y] gate still builds a network",
  roads1.length >= 1 && zones1.every(z => z.accessPt), `${roads1.length} polylines`);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
