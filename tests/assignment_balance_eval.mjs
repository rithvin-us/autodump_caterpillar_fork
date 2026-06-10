// ============================================================================
// Truck-assignment balance evaluation — OLD heuristic (working tree before
// this change) vs NEW heuristic (locality-aware, payload-normalized, gap-dump
// balanced). All geometry/packing/routing functions are verbatim copies from
// site/indexV4.html so the numbers match what the dashboard computes.
//
// Run:  node tests/assignment_balance_eval.mjs
// ============================================================================

const FIELD_W = 30, FIELD_H = 26;
const GRID_RES = 0.5;
const HW = Math.floor(FIELD_W / GRID_RES) + 2;
const HH = Math.floor(FIELD_H / GRID_RES) + 2;
const REAL_WIDTH_M = 500;

const TRUCK_MODELS = {
  "Cat 785": { width: 6.4, dumpRadius: 2.6, payload: 136 },
  "Cat 793": { width: 7.6, dumpRadius: 3.2, payload: 240 },
  "Cat 797": { width: 9.7, dumpRadius: 3.8, payload: 363 }
};

const getScale = () => REAL_WIDTH_M / FIELD_W;
const metresToLogical = m => m / getScale();
const areaLogicalToM2 = a => a * Math.pow(getScale(), 2);

// ---------- geometry (verbatim from site/indexV4.html) ----------
function pip(x, y, V) {
  if (!V || V.length < 3) return false;
  let inside = false;
  let n = V.length;
  if (Math.abs(V[0][0]-V[n-1][0])<1e-9 && Math.abs(V[0][1]-V[n-1][1])<1e-9) n--;
  for (let i=0, j=n-1; i<n; j=i++) {
    const xi=V[i][0], yi=V[i][1], xj=V[j][0], yj=V[j][1];
    if (((yi>y)!=(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)+1e-12)+xi)) inside = !inside;
  }
  return inside;
}
function polyArea(V) {
  if (!V || V.length < 3) return 0;
  let n = V.length;
  if (Math.abs(V[0][0]-V[n-1][0])<1e-9 && Math.abs(V[0][1]-V[n-1][1])<1e-9) n--;
  let a = 0;
  for (let i=0; i<n; i++) { const j=(i+1)%n; a += V[i][0]*V[j][1] - V[j][0]*V[i][1]; }
  return Math.abs(a)/2;
}
function scanlineSpans(V, y) {
  if (!V || V.length < 3) return [];
  let n = V.length;
  if (Math.abs(V[0][0]-V[n-1][0])<1e-9 && Math.abs(V[0][1]-V[n-1][1])<1e-9) n--;
  const xs = [];
  for (let i=0, j=n-1; i<n; j=i++) {
    const yi = V[i][1], yj = V[j][1];
    if ((yi > y) !== (yj > y)) xs.push(V[i][0] + (y - yi) / (yj - yi) * (V[j][0] - V[i][0]));
  }
  xs.sort((a,b)=>a-b);
  const spans = [];
  for (let k=0; k+1 < xs.length; k+=2)
    if (xs[k+1] - xs[k] > 1e-9) spans.push([xs[k], xs[k+1]]);
  return spans;
}
function stripSpans(V, y0, y1) {
  const K = 7, all = [];
  for (let k=1; k<=K; k++) all.push(...scanlineSpans(V, y0 + (y1-y0)*k/(K+1)));
  if (!all.length) return [];
  all.sort((a,b)=>a[0]-b[0]);
  const merged = [all[0].slice()];
  for (let i=1; i<all.length; i++) {
    const last = merged[merged.length-1];
    if (all[i][0] <= last[1] + 1e-6) last[1] = Math.max(last[1], all[i][1]);
    else merged.push(all[i].slice());
  }
  return merged;
}
function zoneInsideFrac(V, x0, x1, y0, y1) {
  const NX = 10, NY = 4; let n = 0;
  for (let iy=0; iy<NY; iy++)
    for (let ix=0; ix<NX; ix++)
      if (pip(x0 + (x1-x0)*(ix+0.5)/NX, y0 + (y1-y0)*(iy+0.5)/NY, V)) n++;
  return n / (NX * NY);
}
function cleanPoly(V) {
  if (!V || V.length < 3) return [];
  const out = [];
  for (const p of V) {
    const q = out[out.length-1];
    if (!q || Math.hypot(p[0]-q[0], p[1]-q[1]) > 1e-6) out.push([p[0], p[1]]);
  }
  while (out.length >= 2 &&
         Math.hypot(out[0][0]-out[out.length-1][0], out[0][1]-out[out.length-1][1]) <= 1e-6) out.pop();
  if (out.length < 3) return [];
  const res = [];
  for (let i=0; i<out.length; i++) {
    const a = out[(i-1+out.length) % out.length], b = out[i], c = out[(i+1) % out.length];
    const cr = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    if (Math.abs(cr) > 1e-9) res.push(b);
  }
  return res.length >= 3 ? res : out;
}
function clipPolyHalfplane(poly, p1, p2, keepSign) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const sideOf = p => (p[0] - p1[0]) * dy - (p[1] - p1[1]) * dx;
  const out = [];
  const push = p => {
    const q = out[out.length-1];
    if (!q || Math.hypot(p[0]-q[0], p[1]-q[1]) > 1e-9) out.push(p);
  };
  const cross = (a, b, sA, sB) => {
    const denom = sA - sB;
    const t = Math.abs(denom) < 1e-12 ? 0.5 : Math.max(0, Math.min(1, sA / denom));
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const sC = sideOf(curr), sP = sideOf(prev);
    const inC = sC * keepSign >= 0, inP = sP * keepSign >= 0;
    if (inC) { if (!inP) push(cross(prev, curr, sP, sC)); push(curr.slice()); }
    else if (inP) push(cross(prev, curr, sP, sC));
  }
  return out;
}
function splitPolyByLine(poly, p1, p2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const sideOf = p => (p[0] - p1[0]) * dy - (p[1] - p1[1]) * dx;
  const sides = poly.map(sideOf);
  if (!sides.some(s => s > 1e-6) || !sides.some(s => s < -1e-6)) return [poly.slice()];
  return [clipPolyHalfplane(poly, p1, p2, +1), clipPolyHalfplane(poly, p1, p2, -1)];
}
function splitPolygonByPathways(mainPoly, pathways) {
  if (!Array.isArray(mainPoly) || mainPoly.length < 3) return [];
  const base = cleanPoly(mainPoly);
  if (base.length < 3) return [];
  const totalArea = polyArea(base);
  const MIN_FRAG = Math.max(1e-6, totalArea * 5e-4);
  let regions = [base];
  if (pathways && pathways.length) {
    for (const seg of pathways) {
      if (!seg || !seg[0] || !seg[1]) continue;
      const [p1, p2] = seg;
      if (Math.hypot(p2[0]-p1[0], p2[1]-p1[1]) < 1e-6) continue;
      const next = [];
      for (const r of regions)
        for (const pc of splitPolyByLine(r, p1, p2)) {
          const cp = cleanPoly(pc);
          if (cp.length >= 3 && polyArea(cp) > MIN_FRAG) next.push(cp);
        }
      if (next.length) regions = next;
    }
  }
  const seen = new Set();
  regions = regions.filter(r => {
    const k = r.map(v => v[0].toFixed(3)+","+v[1].toFixed(3)).sort().join("|");
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  const cen = r => r.reduce((a,v)=>[a[0]+v[0]/r.length, a[1]+v[1]/r.length], [0,0]);
  regions.sort((a,b)=>{ const ca=cen(a), cb=cen(b); return (ca[1]-cb[1]) || (ca[0]-cb[0]); });
  return regions.map((verts, i) => ({
    verts, id: i, label: "Region " + String.fromCharCode(65 + (i % 26)),
    areaM2: areaLogicalToM2(polyArea(verts))
  }));
}
function buildZones(V, truckWidth) {
  if (!V || V.length < 3 || !(truckWidth > 0)) return [];
  const P = cleanPoly(V);
  if (P.length < 3) return [];
  const ymin = Math.min(...P.map(v=>v[1]));
  const ymax = Math.max(...P.map(v=>v[1]));
  const span = ymax - ymin;
  if (span <= 1e-9) return [];
  const nStrips = Math.max(1, Math.round(span / truckWidth));
  const stripH = span / nStrips;
  const MIN_W = 0.1;
  const Z = [];
  for (let s=0; s<nStrips; s++) {
    const y  = ymin + s * stripH;
    const yt = (s === nStrips-1) ? ymax : ymin + (s+1) * stripH;
    for (const [x0, x1] of stripSpans(P, y, yt)) {
      if (x1 - x0 <= MIN_W) continue;
      const frac = zoneInsideFrac(P, x0, x1, y, yt);
      if (frac <= 0) continue;
      Z.push({ id: 0, y_bot: y, y_top: yt, x_min: x0, x_max: x1,
               area: (x1-x0) * (yt-y) * frac, insideFrac: +frac.toFixed(3),
               narrow: (x1 - x0) < truckWidth, truckWidth });
    }
  }
  Z.sort((a,b)=> (a.y_bot - b.y_bot) || (a.x_min - b.x_min));
  Z.forEach((z,i) => z.id = i);
  return Z;
}
function buildMask(V) {
  const m = new Uint8Array(HW * HH);
  for (let gy=0; gy<HH; gy++)
    for (let gx=0; gx<HW; gx++)
      if (pip(gx*GRID_RES, gy*GRID_RES, V)) m[gy*HW + gx] = 1;
  return m;
}

// ---------- routing (verbatim) ----------
function _ld(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
function _lkey(p){ return p[0].toFixed(3)+","+p[1].toFixed(3); }
function _projSeg(P,A,B){
  const dx=B[0]-A[0], dy=B[1]-A[1], L2=dx*dx+dy*dy||1e-9;
  let t=((P[0]-A[0])*dx+(P[1]-A[1])*dy)/L2; t=Math.max(0,Math.min(1,t));
  return [A[0]+t*dx, A[1]+t*dy];
}
function _segInt(p1,p2,p3,p4){
  const d=(p2[0]-p1[0])*(p4[1]-p3[1])-(p2[1]-p1[1])*(p4[0]-p3[0]);
  if(Math.abs(d)<1e-9) return null;
  const t=((p3[0]-p1[0])*(p4[1]-p3[1])-(p3[1]-p1[1])*(p4[0]-p3[0]))/d;
  const u=((p3[0]-p1[0])*(p2[1]-p1[1])-(p3[1]-p1[1])*(p2[0]-p1[0]))/d;
  if(t<-1e-6||t>1+1e-6||u<-1e-6||u>1+1e-6) return null;
  return [p1[0]+t*(p2[0]-p1[0]), p1[1]+t*(p2[1]-p1[1])];
}
function laneRoute(pathways, from, to){
  if(!pathways || !pathways.length) return [from.slice(), to.slice()];
  const nodes=new Map();
  const add=p=>{ const k=_lkey(p); if(!nodes.has(k)) nodes.set(k,p.slice()); return k; };
  const seg=pathways.map(s=>[s[0].slice(), s[1].slice()]);
  seg.forEach(s=>{ add(s[0]); add(s[1]); });
  for(let i=0;i<seg.length;i++) for(let j=i+1;j<seg.length;j++){
    const x=_segInt(seg[i][0],seg[i][1],seg[j][0],seg[j][1]); if(x) add(x);
  }
  const access=P=>{ let best=null,bd=Infinity; seg.forEach(s=>{ const q=_projSeg(P,s[0],s[1]); const d=_ld(P,q); if(d<bd){bd=d;best=q;} }); return add(best); };
  const aFrom=access(from), aTo=access(to);
  const adj=new Map();
  const edge=(k1,k2)=>{ const w=_ld(nodes.get(k1),nodes.get(k2)); if(w<1e-9)return;
    (adj.get(k1)||adj.set(k1,[]).get(k1)).push({k:k2,w});
    (adj.get(k2)||adj.set(k2,[]).get(k2)).push({k:k1,w}); };
  seg.forEach(s=>{
    const on=[...nodes.entries()].filter(([k,p])=>_ld(p,_projSeg(p,s[0],s[1]))<1e-6).map(([k])=>k);
    on.sort((k1,k2)=>_ld(s[0],nodes.get(k1))-_ld(s[0],nodes.get(k2)));
    for(let i=1;i<on.length;i++) edge(on[i-1],on[i]);
  });
  const kFrom=add(from), kTo=add(to);
  edge(kFrom,aFrom); edge(kTo,aTo);
  const D=new Map(), prev=new Map(), seen=new Set();
  nodes.forEach((_,k)=>D.set(k,Infinity)); D.set(kFrom,0);
  while(true){
    let u=null,ud=Infinity; D.forEach((d,k)=>{ if(!seen.has(k)&&d<ud){ud=d;u=k;} });
    if(u===null||u===kTo) break; seen.add(u);
    (adj.get(u)||[]).forEach(e=>{ const nd=ud+e.w; if(nd<D.get(e.k)){D.set(e.k,nd); prev.set(e.k,u);} });
  }
  if(D.get(kTo)===Infinity) return [from.slice(), to.slice()];
  const path=[]; let c=kTo; while(c!==undefined){ path.unshift(nodes.get(c)); c=prev.get(c); }
  return path;
}

// ---------- hex packing (verbatim) ----------
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function buildHexSpots(poly, R) {
  const spots = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const dx = R * 2, dy = R * Math.sqrt(3);
  for (let row = 0; row * dy < (maxY - minY) + R * 2; row++) {
    const offX = (row % 2) ? R : 0;
    for (let col = 0; col * dx < (maxX - minX) + R * 2; col++) {
      const sx = minX + offX + col * dx + R;
      const sy = minY + row * dy + R;
      if (pointInPoly(sx, sy, poly)) spots.push({ x: sx, y: sy });
    }
  }
  return spots;
}
function hexDumpsInZone(zone, mask, filled, dumpRadius) {
  const poly = [
    {x: zone.x_min, y: zone.y_bot}, {x: zone.x_max, y: zone.y_bot},
    {x: zone.x_max, y: zone.y_top}, {x: zone.x_min, y: zone.y_top}
  ];
  const spots = buildHexSpots(poly, dumpRadius);
  const dumps = [];
  const rc = Math.ceil(dumpRadius / GRID_RES);
  spots.forEach(s => {
    const cgx = Math.floor(s.x / GRID_RES), cgy = Math.floor(s.y / GRID_RES);
    let isFilled = false;
    if (cgy >= 0 && cgy < HH && cgx >= 0 && cgx < HW) {
      if (mask[cgy * HW + cgx] && filled[cgy * HW + cgx]) isFilled = true;
      else if (!mask[cgy * HW + cgx]) isFilled = true;
    } else isFilled = true;
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
}
function boustrophedonOrder(dumps, zone) {
  if (dumps.length === 0) return [];
  const yRows = {};
  const rowH = (zone.y_top - zone.y_bot) / 3;
  dumps.forEach(d => {
    const row = Math.floor((d[1] - zone.y_bot) / rowH);
    (yRows[row] ||= []).push(d);
  });
  let out = [];
  Object.keys(yRows).sort((a,b)=>+a-+b).forEach((r,i) => {
    const sorted = yRows[r].sort((a,b) => i%2===0 ? a[0]-b[0] : b[0]-a[0]);
    out = out.concat(sorted);
  });
  return out;
}

// ============================================================================
// Step 3 replica — zones from polygon + pathways (matches runPlan)
// ============================================================================
function buildPlanZones(verts, pathways, widestTWLogical) {
  const regions = splitPolygonByPathways(verts, pathways);
  const ZONE_THRESHOLD_M2 = 5000, MIN_ZONE_AREA_M2 = 500;
  let zones = [], zoneCounter = 0;
  regions.forEach((region, ri) => {
    if (region.areaM2 < ZONE_THRESHOLD_M2 && region.verts.length >= 3) {
      const xs = region.verts.map(v => v[0]), ys = region.verts.map(v => v[1]);
      zones.push({ id: zoneCounter++, regionId: ri,
        x_min: Math.min(...xs), x_max: Math.max(...xs),
        y_bot: Math.min(...ys), y_top: Math.max(...ys),
        area: polyArea(region.verts), truckWidth: widestTWLogical, isSingleZone: true });
    } else {
      buildZones(region.verts, widestTWLogical).forEach(s =>
        zones.push({ ...s, id: zoneCounter++, regionId: ri }));
    }
  });
  const zSeen = new Set();
  zones = zones.filter(z =>
    z.x_max - z.x_min > 1e-6 && z.y_top - z.y_bot > 1e-6 && (z.area || 0) > 0
  ).filter(z => {
    const k = [z.regionId, z.x_min.toFixed(2), z.x_max.toFixed(2), z.y_bot.toFixed(2), z.y_top.toFixed(2)].join("|");
    if (zSeen.has(k)) return false;
    zSeen.add(k); return true;
  });
  zones.sort((a,b) => (a.regionId - b.regionId) || (a.y_bot - b.y_bot) || (a.x_min - b.x_min));
  const m2 = getScale() * getScale();
  zones = zones.filter(z => (z.area * m2) >= 500);
  zones.forEach((z, i) => z.id = i);
  return zones;
}

// ============================================================================
// Step 4 replica — OLD vs NEW heuristic
// ============================================================================
function step4(zones, trucks, pathways, entry, exit, mask, variant) {
  const entryXY = [entry.x, entry.y], exitXY = [exit.x, exit.y];
  const payloadOf = t => (TRUCK_MODELS[t.model]?.payload) || t.width || 1;
  const ranked = [...trucks].sort((a,b)=> payloadOf(b)-payloadOf(a));
  const maxPay = payloadOf(ranked[0]);
  let bigTrucks   = ranked.filter(t => payloadOf(t) >= maxPay*0.85);
  let smallTrucks = ranked.filter(t => !bigTrucks.includes(t));
  if (bigTrucks.length === 0) bigTrucks = ranked.slice();

  const assignments = {}, truckZones = {};
  trucks.forEach(t => truckZones[t.id] = []);
  const zoneCentroid = z => [ (z.x_min+z.x_max)/2, (z.y_bot+z.y_top)/2 ];

  const load = {}; bigTrucks.forEach(t => load[t.id] = 0);
  if (variant === "old") {
    // area-only least-loaded, no locality, visit order = descending area
    [...zones].sort((a,b)=> b.area - a.area).forEach(z => {
      const t = bigTrucks.reduce((best,tt)=> load[tt.id] < load[best.id] ? tt : best, bigTrucks[0]);
      assignments[z.id] = t.id;
      truckZones[t.id].push(z.id);
      load[t.id] += z.area;
    });
  }

  const filled = new Uint8Array(HW*HH);
  const waypoints = {};
  trucks.forEach(t => waypoints[t.id] = []);
  let totalDumps = 0;
  const pushLane = (wp, cur, dest) => {
    const poly = laneRoute(pathways, cur, dest);
    for (let i=1;i<poly.length;i++) wp.push([+poly[i][0].toFixed(2), +poly[i][1].toFixed(2), "transit"]);
    return dest;
  };

  let zoneDumps = null;
  if (variant === "new") {
    // precompute the actual dump waypoints per zone (deterministic zone order)
    // so assignment can balance on real dump counts, not the area proxy
    const drBig = metresToLogical(bigTrucks[0].dumpRadius);
    zoneDumps = {};
    zones.forEach(z => { zoneDumps[z.id] = hexDumpsInZone(z, mask, filled, drBig); });
    // LPT on dump count: busiest zone first to the least-loaded big truck;
    // near-ties (<=8%) break toward the truck whose last zone is closest
    const lastAt = {};
    [...zones].sort((a,b)=> zoneDumps[b.id].length - zoneDumps[a.id].length).forEach(z => {
      const c = zoneCentroid(z);
      const minLoad = bigTrucks.reduce((m,tt)=> Math.min(m, load[tt.id]), Infinity);
      const slack = Math.max(minLoad * 0.08, 1e-9);
      let t = null, bestD = Infinity;
      for (const tt of bigTrucks) {
        if (load[tt.id] > minLoad + slack) continue;
        const p = lastAt[tt.id] || entryXY;
        const d = Math.hypot(c[0]-p[0], c[1]-p[1]);
        if (d < bestD) { bestD = d; t = tt; }
      }
      assignments[z.id] = t.id;
      truckZones[t.id].push(z.id);
      load[t.id] += zoneDumps[z.id].length;
      lastAt[t.id] = c;
    });
    // nearest-neighbour visit order from the entry gate
    bigTrucks.forEach(t => {
      const pool = truckZones[t.id].slice(), route = [];
      let cur = entryXY;
      while (pool.length) {
        let bi = 0, bd = Infinity;
        pool.forEach((zid, i) => {
          const c = zoneCentroid(zones.find(zz => zz.id === zid));
          const d = Math.hypot(c[0]-cur[0], c[1]-cur[1]);
          if (d < bd) { bd = d; bi = i; }
        });
        route.push(pool[bi]);
        cur = zoneCentroid(zones.find(zz => zz.id === pool[bi]));
        pool.splice(bi, 1);
      }
      truckZones[t.id] = route;
    });
  }

  // PASS 1 — big trucks
  bigTrucks.forEach(t => {
    const wp = waypoints[t.id];
    const drLogical = metresToLogical(t.dumpRadius);
    let cur = entryXY;
    wp.push([entry.x, entry.y, "transit"]);
    truckZones[t.id].forEach(zid => {
      const z = zones.find(zz => zz.id === zid);
      const access = zoneCentroid(z);
      cur = pushLane(wp, cur, access);
      const raw = zoneDumps ? zoneDumps[zid] : hexDumpsInZone(z, mask, filled, drLogical);
      const dumps = boustrophedonOrder(raw, z);
      dumps.forEach(d => wp.push([d[0], d[1], "dump"]));
      totalDumps += dumps.length;
      cur = pushLane(wp, cur, access);
    });
    cur = pushLane(wp, cur, exitXY);
    wp.push([exit.x, exit.y, "transit"]);
  });

  // PASS 2 — small trucks gap-fill
  if (smallTrucks.length) {
    if (variant === "old") {
      let si = 0;
      zones.forEach(z => {
        const t = smallTrucks[si % smallTrucks.length];
        const drLogical = metresToLogical(t.dumpRadius);
        const gaps = boustrophedonOrder(hexDumpsInZone(z, mask, filled, drLogical), z);
        if (gaps.length === 0) return;
        si++;
        const wp = waypoints[t.id];
        if (wp.length === 0) wp.push([entry.x, entry.y, "transit"]);
        let cur = [wp[wp.length-1][0], wp[wp.length-1][1]];
        const access = zoneCentroid(z);
        cur = pushLane(wp, cur, access);
        gaps.forEach(d => wp.push([d[0], d[1], "dump"]));
        totalDumps += gaps.length;
        pushLane(wp, cur, access);
        if (!truckZones[t.id].includes(z.id)) truckZones[t.id].push(z.id);
      });
    } else {
      const gapLoad = {}; smallTrucks.forEach(t => gapLoad[t.id] = 0);
      zones.forEach(z => {
        const t = smallTrucks.reduce((best,tt)=> gapLoad[tt.id] < gapLoad[best.id] ? tt : best, smallTrucks[0]);
        const drLogical = metresToLogical(t.dumpRadius);
        const gaps = boustrophedonOrder(hexDumpsInZone(z, mask, filled, drLogical), z);
        if (gaps.length === 0) return;
        gapLoad[t.id] += gaps.length;
        const wp = waypoints[t.id];
        if (wp.length === 0) wp.push([entry.x, entry.y, "transit"]);
        let cur = [wp[wp.length-1][0], wp[wp.length-1][1]];
        const access = zoneCentroid(z);
        cur = pushLane(wp, cur, access);
        gaps.forEach(d => wp.push([d[0], d[1], "dump"]));
        totalDumps += gaps.length;
        pushLane(wp, cur, access);
        if (!truckZones[t.id].includes(z.id)) truckZones[t.id].push(z.id);
      });
    }
    smallTrucks.forEach(t => {
      const wp = waypoints[t.id];
      if (wp.length) { pushLane(wp, [wp[wp.length-1][0], wp[wp.length-1][1]], exitXY); wp.push([exit.x, exit.y, "transit"]); }
    });
  }

  // Steps 5/6 replica — km + ETA per truck
  const scale = getScale();
  const truckKm = {}, etaPerTruck = {}, dumpsPerTruck = {};
  trucks.forEach(t => {
    const wp = waypoints[t.id];
    let d = 0;
    for (let i=1; i<wp.length; i++) d += Math.hypot(wp[i][0]-wp[i-1][0], wp[i][1]-wp[i-1][1]);
    truckKm[t.id] = (d * scale) / 1000;
    const dumps = wp.filter(w => w[2]==="dump").length;
    dumpsPerTruck[t.id] = dumps;
    etaPerTruck[t.id] = dumps * 2.5 + (wp.length-dumps) * 0.5;
  });
  return { truckZones, truckKm, dumpsPerTruck, etaPerTruck, totalDumps,
           bigIds: bigTrucks.map(t=>t.id), smallIds: smallTrucks.map(t=>t.id) };
}

// ============================================================================
// Scenarios + reporting
// ============================================================================
const stats = vals => {
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  const sd = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
  return { mean, cv: mean ? sd/mean : 0, ratio: Math.min(...vals) ? Math.max(...vals)/Math.min(...vals) : Infinity };
};
const f = n => +n.toFixed(2);

function report(label, res, trucks) {
  console.log(`  ${label}`);
  trucks.forEach(t => {
    console.log(`    ${t.id} (${t.model}${res.bigIds.includes(t.id)?",big":",small"}): zones=${res.truckZones[t.id].length} dumps=${res.dumpsPerTruck[t.id]} km=${f(res.truckKm[t.id])} eta=${f(res.etaPerTruck[t.id])}min`);
  });
  const bigKm   = res.bigIds.map(id=>res.truckKm[id]);
  const bigDump = res.bigIds.map(id=>res.dumpsPerTruck[id]);
  const allEta  = trucks.map(t=>res.etaPerTruck[t.id]);
  const totKm   = trucks.reduce((a,t)=>a+res.truckKm[t.id],0);
  const out = {
    totalDumps: res.totalDumps, totalKm: f(totKm),
    makespanMin: f(Math.max(...allEta)),
    bigKmRatio: f(stats(bigKm).ratio), bigDumpCV: f(stats(bigDump).cv),
  };
  if (res.smallIds.length) {
    const sd = res.smallIds.map(id=>res.dumpsPerTruck[id]);
    out.smallDumpRatio = f(stats(sd).ratio);
    out.smallKmRatio = f(stats(res.smallIds.map(id=>res.truckKm[id])).ratio);
  }
  console.log(`    => ${JSON.stringify(out)}`);
  return out;
}

function runScenario(name, verts, pathways, trucks, entry, exit) {
  console.log(`\n=== ${name} ===`);
  const widest = Math.max(...trucks.map(t => t.width));
  const zones = buildPlanZones(verts, pathways, metresToLogical(widest));
  const mask = buildMask(verts);
  console.log(`  zones=${zones.length}`);
  const oldR = report("OLD heuristic", step4(zones, trucks, pathways, entry, exit, mask, "old"), trucks);
  const newR = report("NEW heuristic", step4(zones, trucks, pathways, entry, exit, mask, "new"), trucks);
  const pct = (a,b) => f((a-b)/a*100);
  console.log(`  improvement: totalKm -${pct(oldR.totalKm,newR.totalKm)}%  makespan -${pct(oldR.makespanMin,newR.makespanMin)}%  bigKmRatio ${oldR.bigKmRatio}->${newR.bigKmRatio}` +
    (oldR.smallDumpRatio !== undefined ? `  smallDumpRatio ${oldR.smallDumpRatio}->${newR.smallDumpRatio}` : ""));
}

const mk = (id, model) => ({ id, model, width: TRUCK_MODELS[model].width, dumpRadius: TRUCK_MODELS[model].dumpRadius });

// Scenario A — L-shaped field, one road, mixed fleet (2 big + 2 small)
const L = [[2,2],[28,2],[28,14],[16,14],[16,24],[2,24]];
const roadA = [[[16,2],[16,24]]];
runScenario("A: L-field + road, 2x Cat 797 + 2x Cat 785",
  L, roadA,
  [mk("T1","Cat 797"), mk("T2","Cat 797"), mk("T3","Cat 785"), mk("T4","Cat 785")],
  {x:2, y:13, name:"E0"}, {x:28, y:8, name:"X0"});

// Scenario B — same field, homogeneous fleet (all big): isolates big-truck balance
runScenario("B: L-field + road, 3x Cat 793 (all big)",
  L, roadA,
  [mk("T1","Cat 793"), mk("T2","Cat 793"), mk("T3","Cat 793")],
  {x:2, y:13, name:"E0"}, {x:28, y:8, name:"X0"});

// Scenario C — convex rectangle, no roads, mixed fleet
const R = [[3,3],[27,3],[27,23],[3,23]];
runScenario("C: rectangle, no roads, 1x Cat 797 + 1x Cat 793 + 2x Cat 785",
  R, [],
  [mk("T1","Cat 797"), mk("T2","Cat 793"), mk("T3","Cat 785"), mk("T4","Cat 785")],
  {x:3, y:13, name:"E0"}, {x:27, y:13, name:"X0"});
