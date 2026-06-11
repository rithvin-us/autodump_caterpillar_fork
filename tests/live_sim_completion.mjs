// ============================================================================
// Headless live-simulation completion + balance test for site/indexV4.html.
//
// Unlike the earlier verbatim-copy harnesses, this one EXTRACTS the real
// functions out of the page (brace-counted `function NAME(...){...}` slices)
// and runs them in a vm sandbox with a stubbed DOM, so what is tested is the
// exact code the dashboard ships.
//
// Covers:
//   1. weighted assignment spreads zones across the whole fleet (mixed fleet)
//   2. homogeneous fleet stays balanced
//   3. per-truck priority shifts the planned share
//   4. sim completes: all dumps placed, all trucks finished, all tokens free
//   5. forced shared-zone contention drains (no token deadlock / frozen queue)
//   6. idle truck rebalances work from a lagging truck
//   7. edges: single truck completes; zero-dump plan completes
//
// Run:  node tests/live_sim_completion.mjs
// ============================================================================

import { readFileSync } from "fs";
import vm from "vm";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "site", "indexV4.html"), "utf8");

// ---------- extraction ----------
function extractFn(name) {
  const m = new RegExp(`function ${name}\\s*\\(`).exec(html);
  if (!m) throw new Error(`function not found in page: ${name}`);
  const start = m.index;
  let i = html.indexOf("{", start), depth = 0, j = i;
  for (; j < html.length; j++) {
    const ch = html[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) break; }
  }
  return html.slice(start, j + 1);
}
function extractConst(name) {
  const m = new RegExp(`const ${name}\\s*=[^;]+;`).exec(html);
  if (!m) throw new Error(`const not found in page: ${name}`);
  return m[0];
}

const FNS = [
  // geometry / packing / planning
  "pip", "polyArea", "buildMask", "maskInsideCount",
  "getScale", "logicalToMetres", "metresToLogical", "areaLogicalToM2",
  "scanlineSpans", "stripSpans", "polyXRange", "zoneInsideFrac", "cleanPoly",
  "buildZones", "laneRoute", "pointInPoly", "buildHexSpots", "hexDumpsInZone", "boustrophedonOrder",
  "zoneCentroidOf", "assignZonesWeighted", "orderZonesNearestNeighbour", "truckWeight",
  // sim
  "timeToMin", "isOnShift", "fmtTime", "setText", "opsLog", "renderTokens",
  "zoneAt", "grantToken", "resetActiveSpots", "releaseToken", "releaseTokensHeldBy",
  "brokerTick", "deferLockedZone", "stuckWatchdog", "stealableZoneBlocks",
  "rebalanceIdleTruck", "moveTruckWithAvoidance", "moveTruckWithTurning",
  "applyDump", "opsTick",
];
const CONSTS = [
  "FIELD_W", "GRID_RES", "HW", "HH",
  "TRUCK_RAD_LOGICAL", "CAT793_TURN_M",
  "TOKEN_TTL_MIN", "STUCK_RECOVER_MIN", "REBALANCE_MIN_DUMPS",
];
const modelsMatch = /const TRUCK_MODELS = \{[\s\S]*?\};/.exec(html);
if (!modelsMatch) throw new Error("TRUCK_MODELS not found");

const pageCode = [
  modelsMatch[0],
  ...CONSTS.map(extractConst),
  ...FNS.map(extractFn),
].join("\n\n");

// ---------- sandbox ----------
function makeSandbox() {
  const fakeEl = () => ({
    style: {}, textContent: "", innerHTML: "", disabled: false,
    children: [], firstChild: null,
    classList: { add() {}, remove() {}, toggle() {} },
    insertBefore() {}, removeChild() {}, appendChild() {},
    setAttribute() {}, getAttribute() { return null; },
  });
  const sb = {
    console, Math, Infinity, NaN,
    Uint8Array, Float32Array, Array, Object, String, Number, parseFloat, parseInt, isNaN,
    document: {
      getElementById: () => fakeEl(), createElement: () => fakeEl(),
      querySelector: () => fakeEl(), querySelectorAll: () => [],
    },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    drawOps() {}, finalizeReport() {}, opsToggle() { sb.STATE.ops.running = false; },
    STATE: {
      site: { verts: [], entries: [], exits: [], nogo: [], pathways: [], realWidthM: 500 },
      fleet: { trucks: [] },
      plan: null,
      ops: { running: false, t: 0, speedMul: 60, estop: false },
    },
  };
  vm.createContext(sb);
  vm.runInContext(pageCode, sb, { filename: "page-extract.js" });
  return sb;
}

// ---------- plan builder (mirrors runPlan step 3+4 with the extracted fns) ----------
function buildPlan(sb, verts, fleet) {
  const S = sb.STATE;
  S.site.verts = verts;
  S.site.entries = [{ x: verts[0][0] + 0.5, y: (verts[0][1] + verts[2][1]) / 2, name: "E0" }];
  S.site.exits = [{ x: verts[1][0] - 0.5, y: (verts[0][1] + verts[2][1]) / 2, name: "X0" }];
  S.fleet.trucks = fleet;

  const mask = sb.buildMask(verts);
  const insideCells = sb.maskInsideCount(mask);
  const widestTW = sb.metresToLogical(Math.max(...fleet.map(t => t.width)));
  const zones = sb.buildZones(verts, widestTW).map((z, i) => ({ ...z, id: i }));

  const entry = S.site.entries[0], exit = S.site.exits[0];
  const entryXY = [entry.x, entry.y], exitXY = [exit.x, exit.y];
  const pathways = [];

  const maxDR = Math.max(...fleet.map(t => t.dumpRadius));
  const gapTrucks = fleet.filter(t => t.dumpRadius < maxDR);
  const HW = vm.runInContext("HW", sb), HH = vm.runInContext("HH", sb);
  const filled = new sb.Uint8Array(HW * HH);
  const waypoints = {}; fleet.forEach(t => waypoints[t.id] = []);
  let totalDumps = 0;
  const pushLane = (wp, cur, dest) => {
    const poly = sb.laneRoute(pathways, cur, dest);
    for (let i = 1; i < poly.length; i++) wp.push([+poly[i][0].toFixed(2), +poly[i][1].toFixed(2), "transit"]);
    return dest;
  };

  const estByRadius = {};
  [...new Set(fleet.map(t => t.dumpRadius))].forEach(r => {
    const g = new sb.Uint8Array(HW * HH);
    const drL = sb.metresToLogical(r);
    estByRadius[r] = {};
    zones.forEach(z => { estByRadius[r][z.id] = sb.hexDumpsInZone(z, mask, g, drL).length; });
  });
  const costOf = (z, t) => estByRadius[t.dumpRadius][z.id];

  const { assignments, truckZones } = sb.assignZonesWeighted(zones, fleet, costOf, sb.truckWeight, entryXY);
  fleet.forEach(t => { truckZones[t.id] = sb.orderZonesNearestNeighbour(truckZones[t.id], zones, entryXY); });

  const zoneSpots = {};
  zones.forEach(z => {
    const t = fleet.find(tt => tt.id === assignments[z.id]);
    zoneSpots[z.id] = sb.hexDumpsInZone(z, mask, filled, sb.metresToLogical(t.dumpRadius));
  });

  fleet.forEach(t => {
    const wp = waypoints[t.id];
    let cur = entryXY;
    wp.push([entry.x, entry.y, "transit"]);
    truckZones[t.id].forEach(zid => {
      const z = zones.find(zz => zz.id === zid);
      const spots = zoneSpots[zid];
      if (!spots.length) return;
      const access = sb.zoneCentroidOf(z);
      cur = pushLane(wp, cur, access);
      const dumps = sb.boustrophedonOrder(spots, z);
      dumps.forEach(d => wp.push([d[0], d[1], "dump"]));
      totalDumps += dumps.length;
      cur = pushLane(wp, cur, access);
    });
  });
  if (gapTrucks.length) {
    const gapLoad = {}; gapTrucks.forEach(t => gapLoad[t.id] = 0);
    zones.forEach(z => {
      const t = gapTrucks.reduce((b, tt) =>
        gapLoad[tt.id] / sb.truckWeight(tt) < gapLoad[b.id] / sb.truckWeight(b) ? tt : b, gapTrucks[0]);
      const rawGaps = sb.hexDumpsInZone(z, mask, filled, sb.metresToLogical(t.dumpRadius));
      const gaps = sb.boustrophedonOrder(rawGaps, z);
      if (!gaps.length) return;
      gapLoad[t.id] += gaps.length;
      const wp = waypoints[t.id];
      if (!wp.length) wp.push([entry.x, entry.y, "transit"]);
      let cur = [wp[wp.length - 1][0], wp[wp.length - 1][1]];
      const access = sb.zoneCentroidOf(z);
      cur = pushLane(wp, cur, access);
      gaps.forEach(d => wp.push([d[0], d[1], "dump"]));
      totalDumps += gaps.length;
      pushLane(wp, cur, access);
      if (!truckZones[t.id].includes(z.id)) truckZones[t.id].push(z.id);
    });
  }
  fleet.forEach(t => {
    const wp = waypoints[t.id];
    if (!wp.length) wp.push([entry.x, entry.y, "transit"]);
    pushLane(wp, [wp[wp.length - 1][0], wp[wp.length - 1][1]], exitXY);
    wp.push([exit.x, exit.y, "transit"]);
  });

  S.plan = {
    zones, mask, insideCells, assignments, truckZones, waypoints,
    totalDumps, projectedCov: 0.7, hexSpots: [],
  };
  return S.plan;
}

// ---------- ops reset (mirrors opsReset runtime fields, no DOM) ----------
function opsResetLite(sb) {
  const S = sb.STATE, HW = vm.runInContext("HW", sb), HH = vm.runInContext("HH", sb);
  const entry = S.site.entries[0];
  S.ops = {
    running: true, t: 0, speedMul: 60, estop: false,
    raf: null, timer: null, lastFrame: 0, pulse: 0,
    events: [], coverageHistory: [{ t: 0, cov: 0 }],
    heatmap: new sb.Float32Array(HW * HH),
    filled: new sb.Uint8Array(HW * HH),
    nFilled: 0, dumpAnims: [],
    trucks: S.fleet.trucks.map((t, i) => ({
      id: t.id, model: t.model, width: t.width, dumpRadius: t.dumpRadius,
      color: "#FFC107",
      x: entry.x + i * 0.6, y: entry.y + i * 0.3,
      wpIdx: 0, state: "transit", dumpProgress: 0, loaded: true,
      dumps: 0, km: 0, idleMin: 0, finished: false,
      waypoints: S.plan.waypoints[t.id] || [],
    })),
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

function runSim(sb, capTicks = 400000) {
  const S = sb.STATE;
  let ticks = 0;
  while (ticks < capTicks && !S.ops.trucks.every(t => t.finished)) {
    sb.opsTick(0.045);
    ticks++;
  }
  return { ticks, done: S.ops.trucks.every(t => t.finished) };
}

const mkTruck = (id, model, priority = 1) => {
  const m = { "Cat 785": { width: 6.4, dumpRadius: 2.6 }, "Cat 793": { width: 7.6, dumpRadius: 3.2 }, "Cat 797": { width: 9.7, dumpRadius: 3.8 } }[model];
  return { id, model, width: m.width, dumpRadius: m.dumpRadius, priority, shiftStart: "00:00", shiftEnd: "23:59", maint: [] };
};
const RECT = [[2, 2], [24, 2], [24, 9], [2, 9]];   // ~370 m × 117 m at 500 m field width

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? "  — " + detail : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const plannedDumps = (S, id) => S.plan.waypoints[id].filter(w => w[2] === "dump").length;

// ── T1: mixed fleet (the reported bug: 1 dominant truck took every zone) ────
{
  const sb = makeSandbox();
  const fleet = [mkTruck("T1", "Cat 797"), mkTruck("T2", "Cat 785"), mkTruck("T3", "Cat 785"), mkTruck("T4", "Cat 785")];
  buildPlan(sb, RECT, fleet);
  const S = sb.STATE;
  const zoneCounts = fleet.map(t => S.plan.truckZones[t.id].length);
  const dumpCounts = fleet.map(t => plannedDumps(S, t.id));
  check("T1 mixed fleet: every truck gets >=1 zone", zoneCounts.every(c => c >= 1), `zones=${zoneCounts.join("/")}`);
  // each dump = 2.5 sim-min regardless of radius, so RAW dump counts are the
  // per-truck workload; fair plan = similar counts across the whole fleet
  const ratio = Math.max(...dumpCounts) / Math.max(Math.min(...dumpCounts), 1e-9);
  check("T1 mixed fleet: dump-count ratio <= 2.0", ratio <= 2.0, `dumps=${dumpCounts.join("/")} ratio=${ratio.toFixed(2)}`);
  opsResetLite(sb);
  const r = runSim(sb);
  const placed = S.ops.trucks.reduce((s, t) => s + t.dumps, 0);
  check("T1 mixed fleet: sim completes all dumps", r.done && placed >= S.ops.totalPlannedDumps,
    `${placed}/${S.ops.totalPlannedDumps} dumps in ${r.ticks} ticks`);
  check("T1 mixed fleet: all tokens released", S.ops.tokens.every(t => t.holder === null));
}

// ── T2: homogeneous fleet balance ────────────────────────────────────────────
{
  const sb = makeSandbox();
  const fleet = [mkTruck("T1", "Cat 793"), mkTruck("T2", "Cat 793"), mkTruck("T3", "Cat 793")];
  buildPlan(sb, RECT, fleet);
  const S = sb.STATE;
  const d = fleet.map(t => plannedDumps(S, t.id));
  const mean = d.reduce((a, b) => a + b) / d.length;
  const cv = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / d.length) / mean;
  check("T2 homogeneous: dump CV <= 0.25", cv <= 0.25, `dumps=${d.join("/")} CV=${cv.toFixed(3)}`);
  opsResetLite(sb);
  const r = runSim(sb);
  check("T2 homogeneous: sim completes", r.done, `${r.ticks} ticks`);
}

// ── T3: priority shifts the planned share ────────────────────────────────────
{
  const sb = makeSandbox();
  const fleet = [mkTruck("T1", "Cat 793", 2), mkTruck("T2", "Cat 793", 1), mkTruck("T3", "Cat 793", 1)];
  buildPlan(sb, RECT, fleet);
  const S = sb.STATE;
  const d = fleet.map(t => plannedDumps(S, t.id));
  const others = (d[1] + d[2]) / 2;
  const ratio = d[0] / Math.max(others, 1e-9);
  check("T3 priority=2 truck gets ~2x planned share", ratio >= 1.4 && ratio <= 2.8,
    `dumps=${d.join("/")} ratio=${ratio.toFixed(2)}`);
}

// ── T4: forced shared-zone contention drains (token deadlock regression) ────
{
  const sb = makeSandbox();
  const fleet = [mkTruck("T1", "Cat 793"), mkTruck("T2", "Cat 793")];
  buildPlan(sb, RECT, fleet);
  const S = sb.STATE;
  // force contention: prepend T1's first 5 dump waypoints onto T2's route so
  // both trucks fight for the same zone token at the same time
  const t1Dumps = S.plan.waypoints["T1"].filter(w => w[2] === "dump").slice(0, 5);
  S.plan.waypoints["T2"] = [S.plan.waypoints["T2"][0], ...t1Dumps.map(w => [w[0], w[1], "dump"]), ...S.plan.waypoints["T2"].slice(1)];
  opsResetLite(sb);
  const r = runSim(sb);
  const queued = S.ops.events.some(e => /queued for Z/.test(e.msg));
  check("T4 contention: both trucks finish (no token freeze)", r.done, `${r.ticks} ticks`);
  check("T4 contention: contention actually occurred", queued, queued ? "queue events seen" : "no queue event — scenario too weak");
  check("T4 contention: all tokens released", S.ops.tokens.every(t => t.holder === null));
}

// ── T5: idle truck rebalances work from a lagging truck ─────────────────────
{
  const sb = makeSandbox();
  const fleet = [mkTruck("T1", "Cat 793"), mkTruck("T2", "Cat 793")];
  buildPlan(sb, RECT, fleet);
  const S = sb.STATE;
  // T1 gets a trivial route; T2 keeps both trucks' worth of work
  const entry = S.site.entries[0], exit = S.site.exits[0];
  const t1Work = S.plan.waypoints["T1"];
  S.plan.waypoints["T2"] = [...S.plan.waypoints["T2"].slice(0, -1), ...t1Work.slice(1)];
  S.plan.waypoints["T1"] = [[entry.x, entry.y, "transit"], [exit.x, exit.y, "transit"]];
  opsResetLite(sb);
  const r = runSim(sb);
  const rebal = S.ops.events.filter(e => /REBALANCE/.test(e.msg));
  check("T5 rebalance: idle truck steals pending zone block", rebal.length >= 1, `${rebal.length} rebalance events`);
  check("T5 rebalance: sim still completes everything", r.done, `${r.ticks} ticks`);
}

// ── T6: single truck completes ───────────────────────────────────────────────
{
  const sb = makeSandbox();
  const fleet = [mkTruck("T1", "Cat 793")];
  buildPlan(sb, RECT, fleet);
  opsResetLite(sb);
  const r = runSim(sb);
  const S = sb.STATE;
  const placed = S.ops.trucks[0].dumps;
  check("T6 single truck: completes all dumps", r.done && placed >= S.ops.totalPlannedDumps,
    `${placed}/${S.ops.totalPlannedDumps} dumps in ${r.ticks} ticks`);
}

// ── T7: zero-dump plan completes immediately ─────────────────────────────────
{
  const sb = makeSandbox();
  const fleet = [mkTruck("T1", "Cat 793"), mkTruck("T2", "Cat 793")];
  buildPlan(sb, RECT, fleet);
  const S = sb.STATE;
  const entry = S.site.entries[0], exit = S.site.exits[0];
  fleet.forEach(t => S.plan.waypoints[t.id] = [[entry.x, entry.y, "transit"], [exit.x, exit.y, "transit"]]);
  opsResetLite(sb);
  const r = runSim(sb, 50000);
  check("T7 zero-dump plan: trucks drive entry->exit and finish", r.done, `${r.ticks} ticks`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
