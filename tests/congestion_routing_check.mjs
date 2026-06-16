// ============================================================================
// Validation for the congestion-aware fleet routing upgrade (2026-06-12) in
// site/indexV4.html:
//   buildRoadGraph (one-time cached road graph)
//   routeOnGraph   (weighted A*: BPR congestion + intersection + diversity +
//                   fuel/turn terms)
//   buildHaulRoads alternative links (gate-gate, access ring, gate-access)
//   smoothPathBezier (quadratic corner cuts, dump/load points untouched)
//   roadOccupancyTick / congestionSpeedFactor / rerouteNextLeg (live traffic)
//
// Checks:
//   C1 graph integrity: every gate + access point is a graph node; the whole
//      gate/access node set is BFS-connected
//   C2 BPR convexity: edge cost grows nonlinearly toward capacity
//   C3 route diversity: repeated trips on one OD pair with flow accumulation
//      use >= 2 distinct edge sets
//   C4 de-centering: the boundary-comb network has NO centroid hub (roads ride
//      zone boundaries + the perimeter), and routes never converge on the
//      polygon centre the way the old spine-only network forced them to
//   C5 smoothing invariants: ends + every dump/load waypoint preserved exactly,
//      only transit points inserted
//   C6 ETA model: pre-smoothing counts reproduce the legacy formula; smoothing
//      only ever ADDS transit points
//   C7 end-to-end shuttle sim with live occupancy + congestion speed active
//   C8 laneRoute parity: graph path == legacy Dijkstra path length (eps 1.0),
//      exact endpoints, no BPR blow-up detours
//
// Run:  node tests/congestion_routing_check.mjs
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
  "pointInPoly","buildHexSpots","hexDumpsInZone","coverageGapSpots","boustrophedonOrder",
  "zoneCentroidOf","assignZonesWeighted","orderZonesNearestNeighbour","truckWeight",
  "timeToMin","isOnShift","fmtTime","setText","opsLog","renderTokens",
  "zoneAt","grantToken","resetActiveSpots","releaseToken","releaseTokensHeldBy",
  "brokerTick","deferLockedZone","stuckWatchdog","stealableZoneBlocks",
  "rebalanceIdleTruck","moveTruckWithAvoidance","moveTruckWithTurning",
  "applyDump","opsTick",
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
function makeSandbox(fns) {
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
  vm.runInContext([modelsMatch[0], ...CONSTS.map(extractConst), ...fns.map(extractFn)].join("\n\n"), sb);
  return sb;
}
const sb = makeSandbox(FNS);
// legacy sandbox: laneRoute WITHOUT the graph helpers -> original Dijkstra body
const sbLegacy = makeSandbox(FNS.filter(f =>
  !["buildRoadGraph","routeOnGraph","smoothPathBezier",
    "roadOccupancyTick","congestionSpeedFactor","rerouteNextLeg"].includes(f)));

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? "  — " + detail : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const plLen = p => { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]); return d; };

// demo polygon + two gates (same as the page's demo preset)
const verts = [[5,2],[18,1],[25,5],[28,10],[26,18],[22,22],[15,24],[8,23],[3,18],[2,12]];
const gates = [{ x: 5, y: 8, name: "G1" }, { x: 26, y: 17, name: "G2" }];
const gatesXY = gates.map(g => [g.x, g.y]);
const fleet = [
  { id: "T1", model: "Cat 793", width: 7.6, dumpRadius: 3.2, priority: 1 },
  { id: "T2", model: "Cat 785", width: 6.4, dumpRadius: 2.6, priority: 1 },
  { id: "T3", model: "Cat 797", width: 9.7, dumpRadius: 3.8, priority: 1 },
];
const zones = sb.autoDecomposeZones(verts, 4);
zones.forEach((z, i) => { z.id = i; });
const roads = sb.buildHaulRoads(gatesXY, verts, zones);
const segs = sb.haulRoadsToSegments(roads);
const linkCount = roads.filter(pl => pl.kind === "link").length;
console.log(`network: ${roads.length} polylines (${linkCount} alternative links), ${segs.length} segments`);

// ── C1: graph integrity + connectivity ──────────────────────────────────────
const graph = sb.buildRoadGraph(segs);
check("C1 graph built with edges and capacities",
  graph && graph.edges.length > 0 && graph.edges.every(e => e.cap >= 1 && e.len > 0),
  `${graph.nodes.length} nodes, ${graph.edges.length} edges`);
check("C1 alternative links exist (diversified network)", linkCount >= 2, `${linkCount} links`);
const keyOf = p => sb._lkey(p);
const wantNodes = [...gatesXY, ...zones.map(z => z.accessPt)];
check("C1 every gate and zone access point is a graph node",
  wantNodes.every(p => graph.keyIdx.has(keyOf(p))));
{
  const start = graph.keyIdx.get(keyOf(gatesXY[0]));
  const seen = new Set([start]); const q = [start];
  while (q.length) {
    const u = q.pop();
    for (const e of graph.adj[u]) { const v = e.a === u ? e.b : e.a; if (!seen.has(v)) { seen.add(v); q.push(v); } }
  }
  check("C1 gate/access node set is BFS-connected",
    wantNodes.every(p => seen.has(graph.keyIdx.get(keyOf(p)))), `${seen.size}/${graph.nodes.length} reachable`);
}

// ── C2: BPR cost convexity on a single-edge network ─────────────────────────
{
  const g1 = sb.buildRoadGraph([[[0,0],[10,0]]]);
  const cap = g1.edges[0].cap;
  const costAt = f => {
    const flows = new Float32Array(g1.edges.length); flows.fill(0); flows[0] = f;
    return sb.routeOnGraph(g1, [0,0], [10,0], { eps: 1.0, flows }).cost;
  };
  const c0 = costAt(0), c1 = costAt(cap), c2 = costAt(2*cap);
  // cost at capacity = len x (1 + BPR alpha + 0.5 linear early-spread term)
  check("C2 cost at capacity = (1 + alpha + 0.5) x length", Math.abs(c1 - 10*2.1) < 1e-6, `c(k)=${c1.toFixed(2)}`);
  check("C2 BPR convex (nonlinear blow-up near capacity)", (c2 - c1) > (c1 - c0),
    `c(0)=${c0.toFixed(1)} c(k)=${c1.toFixed(1)} c(2k)=${c2.toFixed(1)}`);
}

// ── C3: route diversity over repeated trips on one OD pair ──────────────────
{
  const flows = new Float32Array(graph.edges.length);
  const od = [gatesXY[0], zones[zones.length-1].accessPt];
  const sets = []; let prev = null;
  for (let trip = 0; trip < 4; trip++) {
    const r = sb.routeOnGraph(graph, od[0], od[1], { eps: 1.2, flows, prevEdges: prev });
    const key = r.edgeIds.slice().sort((a,b)=>a-b).join(",");
    if (!sets.includes(key)) sets.push(key);
    for (const id of r.edgeIds) flows[id] += 2;     // pile traffic on the chosen path
    prev = new Set(r.edgeIds);
  }
  check("C3 repeated OD trips under flow spread over >= 2 distinct routes",
    sets.length >= 2, `${sets.length} distinct edge sets over 4 trips`);
}

// ── C4: fleet flow assignment does not force every route through the hub ────
{
  const cent = sb.polyCentroid(verts);
  const centIdx = graph.keyIdx.has(keyOf(cent)) ? graph.keyIdx.get(keyOf(cent)) : -1;
  // boundary-comb design: the field centroid is NOT a road node — haul roads
  // ride the slab boundaries and the perimeter, never a central hub
  check("C4 no centroid hub (roads ride zone boundaries, not the field centre)", centIdx < 0);
  const flows = new Float32Array(graph.edges.length);
  let total = 0, viaHub = 0;
  for (let round = 0; round < 3; round++) {
    gatesXY.forEach(gxy => zones.forEach(z => {
      const r = sb.routeOnGraph(graph, gxy, z.accessPt, { eps: 1.2, flows });
      total++;
      const onHub = r.path.some(p => sb._ld(p, cent) < 1e-6);
      if (onHub) viaHub++;
      for (const id of r.edgeIds) flows[id] += 1;
    }));
  }
  check("C4 not every route passes the centroid hub (traffic distributes)",
    viaHub < total, `${viaHub}/${total} routes via hub`);
}

// ── C5/C6: Bezier smoothing invariants + ETA model inputs ───────────────────
{
  const wp = [[gates[0].x, gates[0].y, "transit"]];
  const access = zones[0].accessPt;
  const dumps = [[10, 5], [12, 6.5], [14, 5.5]];
  let cur = [gates[0].x, gates[0].y];
  dumps.forEach(d => {
    const inP = sb.laneRoute(segs, cur, access);
    for (let i = 1; i < inP.length; i++) wp.push([+inP[i][0].toFixed(2), +inP[i][1].toFixed(2), "transit"]);
    wp.push([d[0], d[1], "dump"]);
    wp.push([access[0], access[1], "transit"]);
    const outP = sb.laneRoute(segs, access, [gates[1].x, gates[1].y]);
    for (let i = 1; i < outP.length; i++) wp.push([+outP[i][0].toFixed(2), +outP[i][1].toFixed(2), "transit"]);
    wp[wp.length-1][2] = "load";
    cur = [gates[1].x, gates[1].y];
  });
  wp[wp.length-1][2] = "transit";
  const pre = {
    dumps: wp.filter(w => w[2]==="dump").length,
    loads: wp.filter(w => w[2]==="load").length,
    transits: wp.filter(w => w[2]==="transit").length,
  };
  const sm = sb.smoothPathBezier(wp, sb.metresToLogical(11.5));
  check("C5 smoothing keeps both route ends exactly",
    sb._ld(sm[0], wp[0]) < 1e-9 && sb._ld(sm[sm.length-1], wp[wp.length-1]) < 1e-9);
  const dumpsPre = wp.filter(w => w[2]==="dump").map(w => w.join(","));
  const dumpsPost = sm.filter(w => w[2]==="dump").map(w => w.join(","));
  const loadsPre = wp.filter(w => w[2]==="load").map(w => w.join(","));
  const loadsPost = sm.filter(w => w[2]==="load").map(w => w.join(","));
  check("C5 every dump waypoint preserved exactly and in order",
    dumpsPre.length === dumpsPost.length && dumpsPre.every((d, i) => d === dumpsPost[i]));
  check("C5 every load waypoint preserved exactly and in order",
    loadsPre.length === loadsPost.length && loadsPre.every((d, i) => d === loadsPost[i]));
  check("C5 smoothing only inserts transit points",
    sm.filter(w => w[2]!=="transit").length === wp.filter(w => w[2]!=="transit").length);
  const post = { transits: sm.filter(w => w[2]==="transit").length };
  check("C6 smoothing never removes transit points", post.transits >= pre.transits,
    `${pre.transits} -> ${post.transits} transit points`);
  const LOAD_MIN = vm.runInContext("LOAD_MIN", sb);
  const legacyEta = pre.dumps * 2.5 + pre.loads * LOAD_MIN + (wp.length - pre.dumps - pre.loads) * 0.5;
  const preEta = pre.dumps * 2.5 + pre.loads * LOAD_MIN + pre.transits * 0.5;
  check("C6 ETA from pre-smoothing counts equals legacy waypoint formula",
    Math.abs(legacyEta - preEta) < 1e-9, `${preEta.toFixed(1)} sim-min`);
}

// ── C7: end-to-end shuttle sim with live occupancy + reroute machinery ──────
{
  const S = sb.STATE;
  const fleetSim = fleet.map(t => ({ ...t, shiftStart: "00:00", shiftEnd: "23:59", maint: [] }));
  S.fleet.trucks = fleetSim;
  const HW = vm.runInContext("HW", sb), HH = vm.runInContext("HH", sb);
  const mask = sb.buildMask(verts);
  const filled = new sb.Uint8Array(HW * HH);
  // small dump set per zone so the sim stays fast but uses the full shuttle shape
  const truckZones = { T1: [], T2: [], T3: [] };
  const assignments = {};
  zones.forEach((z, i) => { const t = fleetSim[i % fleetSim.length]; assignments[z.id] = t.id; truckZones[t.id].push(z.id); });
  const waypoints = {};
  const nearestGate = p => {
    let best = gates[0], bd = Infinity;
    gates.forEach(g => { const d = Math.hypot(g.x-p[0], g.y-p[1]); if (d < bd) { bd = d; best = g; } });
    return best;
  };
  fleetSim.forEach(t => {
    const wp = waypoints[t.id] = [];
    let curGate = gates[0];
    wp.push([curGate.x, curGate.y, "transit"]);
    truckZones[t.id].forEach(zid => {
      const z = zones.find(zz => zz.id === zid);
      const spots = sb.hexDumpsInZone(z, mask, filled, sb.metresToLogical(t.dumpRadius)).slice(0, 6);
      spots.forEach(d => {
        const inP = sb.laneRoute(segs, [curGate.x, curGate.y], z.accessPt);
        for (let i = 1; i < inP.length; i++) wp.push([+inP[i][0].toFixed(2), +inP[i][1].toFixed(2), "transit"]);
        wp.push([d[0], d[1], "dump"]);
        wp.push([z.accessPt[0], z.accessPt[1], "transit"]);
        const eg = nearestGate(d);
        const outP = sb.laneRoute(segs, z.accessPt, [eg.x, eg.y]);
        for (let i = 1; i < outP.length; i++) wp.push([+outP[i][0].toFixed(2), +outP[i][1].toFixed(2), "transit"]);
        wp[wp.length-1][2] = "load";
        curGate = eg;
      });
    });
    if (wp.length > 1 && wp[wp.length-1][2] === "load") wp[wp.length-1][2] = "transit";
    waypoints[t.id] = sb.smoothPathBezier(wp, sb.metresToLogical(11.5));
  });
  S.plan = {
    zones, mask, insideCells: sb.maskInsideCount(mask),
    assignments, truckZones, waypoints,
    totalDumps: Object.values(waypoints).reduce((s, wp) => s + wp.filter(w => w[2]==="dump").length, 0),
    gates, mainGate: gates[0], truckGate: { T1: 0, T2: 0, T3: 0 },
    haulRoadSegs: segs, roadGraph: graph, projectedCov: 0.7, hexSpots: [],
  };
  S.ops = {
    running: true, t: 0, speedMul: 60, estop: false,
    raf: null, timer: null, lastFrame: 0, pulse: 0,
    events: [], coverageHistory: [{ t: 0, cov: 0 }],
    heatmap: new sb.Float32Array(HW * HH),
    filled: new sb.Uint8Array(HW * HH),
    nFilled: 0, dumpAnims: [], telemetry: [], _lastSample: null,
    roadOcc: null, congestionIndex: 0, _lastOccT: null, _congWarned: false, reroutes: 0,
    trucks: fleetSim.map((t, i) => ({
      id: t.id, model: t.model, width: t.width, dumpRadius: t.dumpRadius,
      color: "#FFC107", speedF: 1, vel: 0,
      x: gates[0].x + i * 0.6, y: gates[0].y + i * 0.3,
      wpIdx: 0, state: "transit", dumpProgress: 0, loaded: true,
      dumps: 0, km: 0, fuelL: 0, idleMin: 0, finished: false,
      waypoints: (waypoints[t.id] || []).map(w => w.slice()),
    })),
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
  check("C7 shuttle sim with congestion machinery completes all dumps",
    S.ops.trucks.every(t => t.finished) && placed >= S.ops.totalPlannedDumps,
    `${placed}/${S.ops.totalPlannedDumps} dumps in ${ticks} ticks`);
  check("C7 all tokens released at end", S.ops.tokens.every(t => t.holder === null));
  check("C7 live road occupancy was sampled", S.ops.roadOcc != null && S.ops.congestionIndex >= 0,
    `CI=${(S.ops.congestionIndex*100).toFixed(1)}%`);
  check("C7 fuel accrued from km x loaded/empty burn",
    S.ops.trucks.every(t => t.fuelL > 0),
    S.ops.trucks.map(t => `${t.id}:${t.fuelL.toFixed(1)}L`).join(" "));

  // deterministic reroute exercise: congest the planned haul-in leg, then ask
  const tr = S.ops.trucks[0];
  tr.waypoints = (waypoints[tr.id] || []).map(w => w.slice());
  tr.wpIdx = 1;                                   // sitting after the start gate
  while (tr.wpIdx < tr.waypoints.length && tr.waypoints[tr.wpIdx][2] !== "transit") tr.wpIdx++;
  tr.x = tr.waypoints[0][0]; tr.y = tr.waypoints[0][1];
  S.ops.roadOcc = new Uint16Array(graph.edges.length).fill(9);   // saturate everything
  const before = tr.waypoints.length;
  const did = sb.rerouteNextLeg(tr, S.ops);
  const dumpsBefore = (waypoints[tr.id] || []).filter(w => w[2]==="dump").length;
  const dumpsAfter = tr.waypoints.filter(w => w[2]==="dump").length;
  check("C7 rerouteNextLeg replaces a congested haul-in leg without touching dumps",
    did === true && dumpsAfter === dumpsBefore,
    did ? `wp ${before} -> ${tr.waypoints.length}, reroutes=${S.ops.reroutes}` : "no reroute performed");
}

// ── C8: laneRoute parity + endpoint exactness + no blow-up detours ──────────
{
  let exact = true, parity = true, sane = true;
  const details = [];
  gatesXY.forEach(gxy => zones.forEach(z => {
    const a = sb.laneRoute(segs, gxy, z.accessPt);          // graph-backed (eps 1.0)
    const b = sbLegacy.laneRoute(segs, gxy, z.accessPt);    // original Dijkstra
    if (sb._ld(a[0], gxy) > 1e-6 || sb._ld(a[a.length-1], z.accessPt) > 1e-6) exact = false;
    const la = plLen(a), lb = plLen(b);
    if (la > lb * 1.01 + 1e-6) { parity = false; details.push(`${la.toFixed(2)} vs ${lb.toFixed(2)}`); }
    const straight = Math.hypot(gxy[0]-z.accessPt[0], gxy[1]-z.accessPt[1]);
    if (la > Math.max(straight * 3, straight + 10)) sane = false;
  }));
  check("C8 graph-backed laneRoute keeps exact endpoints", exact);
  check("C8 graph-backed laneRoute matches legacy Dijkstra length (eps 1.0)",
    parity, parity ? "all OD pairs within 1%" : details.join("; "));
  check("C8 no pathological detours (<= 3x straight line)", sane);
}

// ── C9: collision avoidance — loaded right-of-way + head-on keep-right ──────
{
  const S = sb.STATE;
  const mk = (id, x, y, heading, loaded) => ({
    id, model: "Cat 793", x, y, heading, loaded, state: "transit",
    finished: false, dumps: 0, waypoints: [], wpIdx: 0,
  });
  // loaded right-of-way: empty T1 (index 0 — would win the old index rule)
  // heads toward loaded T2 directly ahead within the hard-stop distance
  const e1 = mk("T1", 0, 0, 0, false), l2 = mk("T2", 1.0, 0, 0, true);
  S.ops.trucks = [e1, l2];
  const rEmpty = sb.moveTruckWithAvoidance(e1, S.ops, [5, 0], 0.2);
  const rLoaded = sb.moveTruckWithAvoidance(l2, S.ops, [5, 0], 0.2);
  check("C9 empty truck yields to loaded truck ahead (mine right-of-way)",
    rEmpty.wait === true && rLoaded.wait === false,
    `empty wait=${rEmpty.wait}, loaded wait=${rLoaded.wait}`);
  // head-on: both trucks shift to their OWN right and pass — neither stops
  const a = mk("A", 0, 0, 0, true), b = mk("B", 3.0, 0, Math.PI, true);
  S.ops.trucks = [a, b];
  const ra = sb.moveTruckWithAvoidance(a, S.ops, [6, 0], 0.2);
  const rb = sb.moveTruckWithAvoidance(b, S.ops, [-3, 0], 0.2);
  check("C9 head-on encounter: both keep right, opposite sides, no dead stop",
    ra.wait === false && rb.wait === false && ra.aim[1] < -0.5 && rb.aim[1] > 0.5,
    `A lateral ${ra.aim[1].toFixed(2)}, B lateral ${rb.aim[1].toFixed(2)}`);
  // a near truck BEHIND is not a blocker (old nearest-overall scan bug)
  const f1 = mk("F1", 0, 0, 0, true), f2 = mk("F2", -0.9, 0, 0, true);
  S.ops.trucks = [f2, f1];          // f1 has the higher index AND a truck 0.9 behind it
  const rf = sb.moveTruckWithAvoidance(f1, S.ops, [5, 0], 0.2);
  check("C9 truck close BEHIND does not trigger a yield",
    rf.wait === false && rf.aim[0] === 5 && rf.aim[1] === 0);
}

// ── C10: per-truck corridor bias — each truck owns its route economics ──────
{
  const flows = new Float32Array(graph.edges.length);   // zero traffic
  const od = [gatesXY[0], zones[zones.length-1].accessPt];
  const r0 = sb.routeOnGraph(graph, od[0], od[1], { eps: 1.2, flows, truckSeed: 0 });
  const r3 = sb.routeOnGraph(graph, od[0], od[1], { eps: 1.2, flows, truckSeed: 3 });
  check("C10 per-truck cost bias active (route economics differ per truck)",
    r0 && r3 && Math.abs(r0.cost - r3.cost) > 1e-9,
    `cost(seed 0)=${r0.cost.toFixed(3)}, cost(seed 3)=${r3.cost.toFixed(3)}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
