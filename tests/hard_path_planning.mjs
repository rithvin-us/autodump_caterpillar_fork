// ============================================================================
// Rigid difficult-terrain path-planning validation for site/indexV4.html.
//
// Mirrors the FULL 2026-06-12 pipeline (no-go mask carve-outs, coverage
// completion pass, LOAD-HAUL-DUMP shuttle routes with per-trip nearest-exit
// gates) using functions extracted live from the page, and drives the real
// opsTick headlessly on the hard scenarios.
//
//   H1 demo polygon, 2 gates, mixed fleet — shuttle-cycle invariants:
//        one load per trip, exit via the gate nearest each dump, a gate visit
//        between any two dumps, ~full workable coverage, end-to-end sim.
//   H2 rectangle + 2 no-go circles — exclusion really excludes; coverage of
//        the WORKABLE area still ~full; no dump inside a no-go circle.
//   H3 U-shaped site (concave), gates at both arm tips — dumps stay inside
//        the polygon, every gate routes to every zone access, sim completes.
//   H4 dumbbell site (two lobes + 1.2-unit corridor) — planning survives a
//        near-degenerate neck and keeps all dumps in-polygon.
//
// Run:  node tests/hard_path_planning.mjs
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
  "autoDecomposeZones","zoneEntryPoint","buildHaulRoads","haulRoadsToSegments",
  "laneRoute","_ld","_lkey","_projSeg","_segInt",
  "buildMask","maskInsideCount","getScale","metresToLogical",
  "pointInPoly","buildHexSpots","hexDumpsInZone","coverageGapSpots","boustrophedonOrder",
  "zoneCentroidOf","assignZonesWeighted","orderZonesNearestNeighbour","truckWeight",
  "timeToMin","isOnShift","fmtTime","setText","opsLog","renderTokens",
  "zoneAt","grantToken","resetActiveSpots","releaseToken","releaseTokensHeldBy",
  "brokerTick","deferLockedZone","stuckWatchdog","stealableZoneBlocks",
  "rebalanceIdleTruck","moveTruckWithAvoidance","moveTruckWithTurning",
  "applyDump","opsTick"];
const CONSTS = ["FIELD_W","GRID_RES","HW","HH",
  "TRUCK_RAD_LOGICAL","CAT793_TURN_M","TOKEN_TTL_MIN","STUCK_RECOVER_MIN","REBALANCE_MIN_DUMPS",
  "LOAD_MIN","DUMP_MIN"];
const modelsMatch = /const TRUCK_MODELS = \{[\s\S]*?\};/.exec(html);
if (!modelsMatch) throw new Error("TRUCK_MODELS not found");

function makeSandbox() {
  const fakeEl = () => ({
    style: {}, textContent: "", innerHTML: "", disabled: false,
    children: [], firstChild: null,
    classList: { add() {}, remove() {}, toggle() {} },
    insertBefore() {}, removeChild() {}, appendChild() {},
    setAttribute() {}, getAttribute() { return null; },
  });
  const sb = { console, Math, Map, Set, Infinity, NaN,
    Uint8Array, Float32Array, Array, Object, String, Number, parseFloat, parseInt, isNaN,
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
  return sb;
}

const HWof = sb => vm.runInContext("HW", sb), HHof = sb => vm.runInContext("HH", sb);
const mkTruck = (id, model, priority = 1, shiftStart = "00:00", shiftEnd = "23:59") => {
  const m = { "Cat 785": { width: 6.4, dumpRadius: 2.6 }, "Cat 793": { width: 7.6, dumpRadius: 3.2 }, "Cat 797": { width: 9.7, dumpRadius: 3.8 } }[model];
  return { id, model, width: m.width, dumpRadius: m.dumpRadius, priority, shiftStart, shiftEnd, maint: [] };
};

// ── exact mirror of runPlan Steps 1–4 (2026-06-12 shuttle pipeline) ─────────
function buildShuttlePlan(sb, verts, gatesIn, fleet, thrM2 = 50000, nogo = null) {
  const S = sb.STATE;
  S.site.verts = verts; S.fleet.trucks = fleet;
  const mask = sb.buildMask(verts, nogo || undefined);
  const insideCells = sb.maskInsideCount(mask);
  const m2 = Math.pow(500 / 30, 2);
  const areaM2 = sb.polyArea(verts) * m2;
  const byArea = Math.max(1, Math.ceil(areaM2 / thrM2));
  const nZones = Math.max(fleet.length, Math.min(fleet.length * 2, byArea, 8));
  let zones = sb.autoDecomposeZones(verts, nZones).filter(z => z.area * m2 >= 500);
  zones.forEach((z, i) => z.id = i);
  const gates = gatesIn.map((g, i) => ({ x: g[0], y: g[1], name: "G" + (i + 1) }));
  const roads = sb.buildHaulRoads(gates.map(g => [g.x, g.y]), verts, zones);
  const segs = sb.haulRoadsToSegments(roads);
  const nearestGateIdx = p => {
    let gi = 0, bd = Infinity;
    gates.forEach((g, i) => { const d = Math.hypot(g.x - p[0], g.y - p[1]); if (d < bd) { bd = d; gi = i; } });
    return gi;
  };
  const entryXY = [gates.reduce((s, g) => s + g.x, 0) / gates.length, gates.reduce((s, g) => s + g.y, 0) / gates.length];
  const HW = HWof(sb), HH = HHof(sb);
  const filled = new sb.Uint8Array(HW * HH);
  const estByRadius = {};
  [...new Set(fleet.map(t => t.dumpRadius))].forEach(r => {
    const g = new sb.Uint8Array(HW * HH);
    const drL = sb.metresToLogical(r);
    estByRadius[r] = {};
    zones.forEach(z => { estByRadius[r][z.id] = sb.hexDumpsInZone(z, mask, g, drL).length; });
  });
  const costOf = (z, t) => estByRadius[t.dumpRadius][z.id];
  const { assignments, truckZones } = sb.assignZonesWeighted(zones, fleet, costOf, sb.truckWeight, entryXY);
  const truckGate = {};
  fleet.forEach(t => {
    const zids = truckZones[t.id];
    if (!zids.length) { truckGate[t.id] = 0; return; }
    let gi = 0, bd = Infinity;
    gates.forEach((g, i) => {
      const d = Math.min(...zids.map(zid => {
        const c = sb.zoneCentroidOf(zones.find(zz => zz.id === zid));
        return Math.hypot(c[0] - g.x, c[1] - g.y);
      }));
      if (d < bd) { bd = d; gi = i; }
    });
    truckGate[t.id] = gi;
    truckZones[t.id] = sb.orderZonesNearestNeighbour(zids, zones, [gates[gi].x, gates[gi].y]);
  });
  const zonePaths = {};
  zones.forEach(z => {
    const t = fleet.find(tt => tt.id === assignments[z.id]);
    const drL = sb.metresToLogical(t.dumpRadius);
    const spots = sb.hexDumpsInZone(z, mask, filled, drL);
    const gaps = sb.coverageGapSpots(z, mask, filled, drL);
    zonePaths[z.id] = {
      zone: z.id, truck: t.id,
      access: (z.accessPt || sb.zoneCentroidOf(z)).map(v => +v.toFixed(2)),
      dumps: sb.boustrophedonOrder(spots, z).concat(sb.boustrophedonOrder(gaps, z)),
      gapDumps: gaps.length,
    };
  });
  const waypoints = {}; let totalDumps = 0;
  const pushLane = (wp, cur, dest) => {
    const poly = sb.laneRoute(segs, cur, dest);
    for (let i = 1; i < poly.length; i++) wp.push([+poly[i][0].toFixed(2), +poly[i][1].toFixed(2), "transit"]);
  };
  fleet.forEach(t => {
    const wp = waypoints[t.id] = [];
    const home = gates[truckGate[t.id]];
    let curGate = home;
    wp.push([home.x, home.y, "transit"]);
    truckZones[t.id].forEach(zid => {
      const zp = zonePaths[zid];
      if (!zp || !zp.dumps.length) return;
      zp.dumps.forEach(d => {
        pushLane(wp, [curGate.x, curGate.y], zp.access);
        wp.push([d[0], d[1], "dump"]);
        totalDumps++;
        wp.push([zp.access[0], zp.access[1], "transit"]);
        const exitGate = gates[nearestGateIdx(d)];
        pushLane(wp, [zp.access[0], zp.access[1]], [exitGate.x, exitGate.y]);
        wp[wp.length - 1][2] = "load";
        curGate = exitGate;
      });
    });
    if (wp.length > 1 && wp[wp.length - 1][2] === "load") wp[wp.length - 1][2] = "transit";
  });
  let nF = 0;
  for (let i = 0; i < filled.length; i++) if (filled[i]) nF++;
  S.plan = {
    zones, mask, insideCells, assignments, truckZones, waypoints, totalDumps,
    gates, mainGate: gates[0], truckGate, zonePaths, haulRoadSegs: segs,
    projectedCov: nF / Math.max(insideCells, 1), hexSpots: [],
  };
  return S.plan;
}

function opsResetLite(sb) {
  const S = sb.STATE, HW = HWof(sb), HH = HHof(sb);
  S.ops = {
    running: true, t: 0, speedMul: 60, estop: false,
    raf: null, timer: null, lastFrame: 0, pulse: 0,
    events: [], coverageHistory: [{ t: 0, cov: 0 }],
    heatmap: new sb.Float32Array(HW * HH),
    filled: new sb.Uint8Array(HW * HH),
    nFilled: 0, dumpAnims: [],
    trucks: S.fleet.trucks.map((t, i) => {
      const home = S.plan.gates[S.plan.truckGate[t.id]];
      return {
        id: t.id, model: t.model, width: t.width, dumpRadius: t.dumpRadius,
        color: "#FFC107", speedF: 1, vel: 0,
        x: home.x + i * 0.6, y: home.y + i * 0.3,
        wpIdx: 0, state: "transit", dumpProgress: 0, loadProgress: 0,
        loaded: true, dumps: 0, cycles: 0, km: 0, idleMin: 0, finished: false,
        waypoints: S.plan.waypoints[t.id] || [],
      };
    }),
    tokens: S.plan.zones.map(z => ({ zone: z.id, holder: null, queue: [], heartbeat: 0 })),
  };
  S.ops.totalPlannedDumps = 0;
  S.ops.zoneRemaining = {};
  S.ops.trucks.forEach(t => t.waypoints.forEach(w => {
    if (w[2] !== "dump") return;
    S.ops.totalPlannedDumps++;
    const z = sb.zoneAt(w[0], w[1]);
    if (z) S.ops.zoneRemaining[z.id] = (S.ops.zoneRemaining[z.id] || 0) + 1;
  }));
}
function runSim(sb, capTicks = 600000) {
  const S = sb.STATE;
  let ticks = 0;
  while (ticks < capTicks && !S.ops.trucks.every(t => t.finished)) { sb.opsTick(0.045); ticks++; }
  return { ticks, done: S.ops.trucks.every(t => t.finished) };
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? "  — " + detail : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const gateAt = (plan, p) => plan.gates.find(g => Math.hypot(g.x - p[0], g.y - p[1]) < 1e-6);

// shared shuttle-invariant checks. Gate VISITS are "load" waypoints (plus the
// terminal gate) — a route may legitimately pass THROUGH another gate's road
// node when a zone's haul-road branch starts at that gate, so coordinate
// matching alone would misread pass-throughs as arrivals.
function checkShuttle(tag, sb, plan, siteVerts) {
  const fleet = sb.STATE.fleet.trucks;
  let loadsOK = true, exitOK = true, gateBetween = true, inPoly = true;
  fleet.forEach(t => {
    const wp = plan.waypoints[t.id];
    const dumps = wp.filter(w => w[2] === "dump");
    const loads = wp.filter(w => w[2] === "load");
    if (dumps.length && loads.length !== dumps.length - 1) loadsOK = false;
    let lastDump = null;
    for (let i = 0; i < wp.length; i++) {
      const w = wp[i];
      const isVisit = w[2] === "load" || (i === wp.length - 1 && gateAt(plan, w));
      if (w[2] === "dump") {
        if (!sb.pip(w[0], w[1], siteVerts)) inPoly = false;
        if (lastDump !== null) gateBetween = false;   // no gate visit since previous dump
        lastDump = w;
      } else if (isVisit) {
        if (!gateAt(plan, w)) exitOK = false;          // a load waypoint must BE a gate
        if (lastDump) {
          let gi = 0, bd = Infinity;
          plan.gates.forEach((g, k) => { const d = Math.hypot(g.x - lastDump[0], g.y - lastDump[1]); if (d < bd) { bd = d; gi = k; } });
          const ng = plan.gates[gi];
          if (Math.hypot(ng.x - w[0], ng.y - w[1]) > 1e-6) exitOK = false;
        }
        lastDump = null;
      }
    }
  });
  check(`${tag} one load per trip (loads = dumps − 1 per truck)`, loadsOK);
  check(`${tag} a gate visit separates every pair of dumps`, gateBetween);
  check(`${tag} every trip exits via the gate nearest its dump`, exitOK);
  check(`${tag} all dumps inside the site polygon`, inPoly);
}

// ── H1: demo polygon, 2 gates, mixed fleet — full shuttle cycle ─────────────
{
  const sb = makeSandbox();
  const verts = [[5,2],[18,1],[25,5],[28,10],[26,18],[22,22],[15,24],[8,23],[3,18],[2,12]];
  const fleet = [mkTruck("T1", "Cat 793"), mkTruck("T2", "Cat 785"), mkTruck("T3", "Cat 797")];
  const plan = buildShuttlePlan(sb, verts, [[5,8],[26,17]], fleet);
  console.log(`H1 demo: zones=${plan.zones.length} dumps=${plan.totalDumps} projCov=${(plan.projectedCov*100).toFixed(1)}%`);
  checkShuttle("H1", sb, plan, verts);
  const gapTotal = Object.values(plan.zonePaths).reduce((s, zp) => s + zp.gapDumps, 0);
  check("H1 coverage completion pass adds gap dumps", gapTotal > 0, `${gapTotal} gap dumps`);
  check("H1 projected coverage ≥ 98.5% of workable cells", plan.projectedCov >= 0.985,
    (plan.projectedCov*100).toFixed(2) + "%");
  opsResetLite(sb);
  const r = runSim(sb);
  const S = sb.STATE;
  const placed = S.ops.trucks.reduce((s, t) => s + t.dumps, 0);
  check("H1 shuttle sim completes all dumps", r.done && placed >= S.ops.totalPlannedDumps,
    `${placed}/${S.ops.totalPlannedDumps} in ${r.ticks} ticks`);
  check("H1 all tokens released", S.ops.tokens.every(t => t.holder === null));
  check("H1 trucks completed reload cycles", S.ops.trucks.every(t => t.dumps < 2 || t.cycles >= 1),
    S.ops.trucks.map(t => `${t.id}:${t.cycles}`).join(" "));
}

// ── H2: rectangle + 2 no-go circles ─────────────────────────────────────────
{
  const sb = makeSandbox();
  const verts = [[4,4],[26,4],[26,20],[4,20]];
  const nogo = [{ x: 12, y: 12, r: 2.2 }, { x: 21, y: 8, r: 1.6 }];   // logical circles
  const fleet = [mkTruck("T1", "Cat 793"), mkTruck("T2", "Cat 785")];
  const plan = buildShuttlePlan(sb, verts, [[4,12]], fleet, 50000, nogo);
  console.log(`H2 no-go: zones=${plan.zones.length} dumps=${plan.totalDumps} projCov=${(plan.projectedCov*100).toFixed(1)}%`);
  // mask really excludes the circles
  const GRID_RES = vm.runInContext("GRID_RES", sb), HW = HWof(sb);
  let maskOK = true;
  nogo.forEach(c => {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const x = c.x + Math.cos(a) * c.r * 0.6, y = c.y + Math.sin(a) * c.r * 0.6;
      if (plan.mask[Math.floor(y / GRID_RES) * HW + Math.floor(x / GRID_RES)]) maskOK = false;
    }
  });
  check("H2 mask carves out no-go circles", maskOK);
  let noDumpInNogo = true;
  Object.values(plan.zonePaths).forEach(zp => zp.dumps.forEach(d => {
    nogo.forEach(c => { if (Math.hypot(d[0] - c.x, d[1] - c.y) < c.r) noDumpInNogo = false; });
  }));
  check("H2 no dump spot inside a no-go circle", noDumpInNogo);
  check("H2 workable-area coverage still ≥ 98.5%", plan.projectedCov >= 0.985,
    (plan.projectedCov*100).toFixed(2) + "%");
}

// ── H3: U-shaped concave site, gates at both arm tips ───────────────────────
{
  const sb = makeSandbox();
  const verts = [[3,3],[27,3],[27,22],[20,22],[20,9],[10,9],[10,22],[3,22]];
  const fleet = [mkTruck("T1", "Cat 793"), mkTruck("T2", "Cat 793")];
  const plan = buildShuttlePlan(sb, verts, [[6.5,22],[23.5,22]], fleet);
  console.log(`H3 U-shape: zones=${plan.zones.length} dumps=${plan.totalDumps} projCov=${(plan.projectedCov*100).toFixed(1)}%`);
  let inPoly = true, outCount = 0;
  Object.values(plan.zonePaths).forEach(zp => zp.dumps.forEach(d => {
    if (!sb.pip(d[0], d[1], verts)) { inPoly = false; outCount++; }
  }));
  check("H3 all dumps inside the concave polygon", inPoly, outCount ? `${outCount} outside` : "");
  // a zone access point may coincide exactly with a gate (edge midpoint at the
  // gate position) — then the route is a single point, which is still valid
  let routesOK = true;
  plan.gates.forEach(g => plan.zones.forEach(z => {
    const r = sb.laneRoute(plan.haulRoadSegs, [g.x, g.y], z.accessPt);
    if (!(r.length >= 1 && sb._ld(r[r.length-1], z.accessPt) < 1e-6)) routesOK = false;
  }));
  check("H3 every gate routes to every zone access point", routesOK);
  check("H3 coverage of the U ≥ 97%", plan.projectedCov >= 0.97, (plan.projectedCov*100).toFixed(2) + "%");
  opsResetLite(sb);
  const r = runSim(sb);
  const S = sb.STATE;
  const placed = S.ops.trucks.reduce((s, t) => s + t.dumps, 0);
  check("H3 concave-site shuttle sim completes", r.done && placed >= S.ops.totalPlannedDumps,
    `${placed}/${S.ops.totalPlannedDumps} in ${r.ticks} ticks`);
}

// ── H4: dumbbell — two lobes joined by a 1.2-unit corridor ──────────────────
{
  const sb = makeSandbox();
  const verts = [[2,8],[12,8],[12,12],[17,12],[17,8],[27,8],[27,18],[17,18],[17,13.2],[12,13.2],[12,18],[2,18]];
  const fleet = [mkTruck("T1", "Cat 793"), mkTruck("T2", "Cat 785")];
  const plan = buildShuttlePlan(sb, verts, [[2,13]], fleet);
  console.log(`H4 dumbbell: zones=${plan.zones.length} dumps=${plan.totalDumps} projCov=${(plan.projectedCov*100).toFixed(1)}%`);
  check("H4 zones decompose on the dumbbell", plan.zones.length >= fleet.length, `${plan.zones.length} zones`);
  let inPoly = true, outCount = 0;
  Object.values(plan.zonePaths).forEach(zp => zp.dumps.forEach(d => {
    if (!sb.pip(d[0], d[1], verts)) { inPoly = false; outCount++; }
  }));
  check("H4 all dumps inside the dumbbell polygon", inPoly, outCount ? `${outCount} outside` : "");
  check("H4 coverage ≥ 97%", plan.projectedCov >= 0.97, (plan.projectedCov*100).toFixed(2) + "%");
}

// ── H5: live-sim stagnation + KPI sync regression ───────────────────────────
//   (a) coverage KPI must track dump progress 1:1 — the old applyDump painted
//       the dump radius in METRES as logical units (~17× oversized footprint),
//       so coverage read 100 % while most dumps were still pending;
//   (b) a fleet whose shift window is far smaller than the route must still
//       complete via the off-shift time-warp instead of freezing silently;
//   (c) coverageHistory must be throttled, not one entry per tick.
{
  const sb = makeSandbox();
  const verts = [[4,6],[26,6],[26,18],[4,18]];
  // 1-hour shift on a route needing thousands of sim-minutes → forces warps
  const fleet = [mkTruck("T1", "Cat 793", 1, "06:00", "07:00"), mkTruck("T2", "Cat 785", 1, "06:00", "07:00")];
  const plan = buildShuttlePlan(sb, verts, [[4,12]], fleet);
  opsResetLite(sb);
  const S = sb.STATE;
  let midCov = null, midRatio = null, ticks = 0;
  while (ticks < 600000 && !S.ops.trucks.every(t => t.finished)) {
    sb.opsTick(0.045); ticks++;
    if (midCov === null) {
      const placed = S.ops.trucks.reduce((s, t) => s + t.dumps, 0);
      if (placed >= S.ops.totalPlannedDumps / 2) {
        midCov = S.ops.nFilled / Math.max(S.plan.insideCells, 1);
        midRatio = placed / S.ops.totalPlannedDumps;
      }
    }
  }
  const placed = S.ops.trucks.reduce((s, t) => s + t.dumps, 0);
  const warps = S.ops.events.filter(e => /clock advanced/.test(e.msg)).length;
  console.log(`H5 shift-warp: dumps=${placed}/${S.ops.totalPlannedDumps} ticks=${ticks} warps=${warps} midCov=${(midCov*100).toFixed(1)}% @ ${(midRatio*100).toFixed(1)}% dumps`);
  check("H5 1-hour-shift fleet completes via off-shift time-warp",
    S.ops.trucks.every(t => t.finished) && placed >= S.ops.totalPlannedDumps, `${ticks} ticks`);
  check("H5 time-warp events observed (no silent off-shift freeze)", warps >= 1, `${warps} warps`);
  check("H5 coverage KPI tracks dump progress (no premature 100%)",
    midCov !== null && Math.abs(midCov - midRatio) <= 0.10,
    `cov ${(midCov*100).toFixed(1)}% at ${(midRatio*100).toFixed(1)}% of dumps`);
  const finalCov = S.ops.nFilled / Math.max(S.plan.insideCells, 1);
  check("H5 final coverage ≥ 99% at completion", finalCov >= 0.99, (finalCov*100).toFixed(2) + "%");
  check("H5 coverageHistory throttled (≪ one entry per tick)",
    S.ops.coverageHistory.length < ticks / 5,
    `${S.ops.coverageHistory.length} samples over ${ticks} ticks`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
