// ============================================================================
// Zone Decomposition validation harness — old (git HEAD) vs new (working tree)
// implementations extracted verbatim from site/indexV4.html.
//
// Run:  node tests/zone_decomp_validation.mjs
//
// Six tests, one per fixed bug:
//   T1  U-shaped polygon — strip bridging the concave gap
//   T2  Zone area inflation on non-rectangular polygons
//   T3  Thin features missed by 0.4-unit grid sampling (phantom full-width zone)
//   T4  Sliver strip generation + crude sliver merge
//   T5  Degenerate pathway / noisy clipping output
//   T6  Non-deterministic region ordering (pathway direction reversal)
// ============================================================================

const FIELD_W = 30, FIELD_H = 26;

// ---------- shared helpers (unchanged between versions) ----------
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
  for (let i=0; i<n; i++) {
    const j=(i+1)%n; a += V[i][0]*V[j][1] - V[j][0]*V[i][1];
  }
  return Math.abs(a)/2;
}
const getScale = () => 500 / FIELD_W;            // STATE default realWidthM=500
const areaLogicalToM2 = a => a * Math.pow(getScale(), 2);

// ============================================================================
// OLD IMPLEMENTATIONS (verbatim from git HEAD site/indexV4.html)
// ============================================================================
function polyXRange_old(V, y0, y1) {
  let xs = [];
  for (let k=0; k<12; k++) {
    const y = y0 + (y1-y0)*k/11;
    let row = [];
    for (let x=-1; x<=FIELD_W+1; x+=0.4) if (pip(x, y, V)) row.push(x);
    if (row.length) xs.push(Math.min(...row), Math.max(...row));
  }
  if (!xs.length) {
    const xmin = Math.min(...V.map(v=>v[0])), xmax = Math.max(...V.map(v=>v[0]));
    return [xmin, xmax];
  }
  return [Math.min(...xs), Math.max(...xs)];
}

function buildZones_old(V, truckWidth) {
  if (!V || V.length < 3) return [];
  const ymin = Math.min(...V.map(v=>v[1]));
  const ymax = Math.max(...V.map(v=>v[1]));
  const SLIVER = truckWidth * 0.5;
  const Z = []; let y = ymin, idx = 0;
  while (y < ymax) {
    const yt = Math.min(y + truckWidth, ymax);
    const [xmin, xmax] = polyXRange_old(V, y, yt);
    if (xmax - xmin > 0.1) {
      Z.push({ id: idx, y_bot: y, y_top: yt,
               x_min: xmin, x_max: xmax,
               area: (xmax-xmin)*(yt-y), truckWidth });
      idx++;
    }
    y = yt;
  }
  if (Z.length >= 2 && (Z[Z.length-1].y_top - Z[Z.length-1].y_bot) < SLIVER) {
    const last = Z.pop(), prev = Z[Z.length-1];
    prev.y_top = last.y_top;
    prev.x_min = Math.min(prev.x_min, last.x_min);
    prev.x_max = Math.max(prev.x_max, last.x_max);
    prev.area += last.area;
    prev.merged_sliver = true;
    Z.forEach((z,i) => z.id = i);
  }
  return Z;
}

function clipPolyHalfplane_old(poly, p1, p2, keepSign) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const sideOf = p => (p[0] - p1[0]) * dy - (p[1] - p1[1]) * dx;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const sC = sideOf(curr);
    const sP = sideOf(prev);
    const inC = sC * keepSign >= 0;
    const inP = sP * keepSign >= 0;
    if (inC) {
      if (!inP) {
        const t = sP / (sP - sC);
        out.push([prev[0] + t * (curr[0] - prev[0]),
                  prev[1] + t * (curr[1] - prev[1])]);
      }
      out.push(curr.slice());
    } else if (inP) {
      const t = sP / (sP - sC);
      out.push([prev[0] + t * (curr[0] - prev[0]),
                prev[1] + t * (curr[1] - prev[1])]);
    }
  }
  return out;
}

function splitPolyByLine_old(poly, p1, p2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const sideOf = p => (p[0] - p1[0]) * dy - (p[1] - p1[1]) * dx;
  const sides = poly.map(sideOf);
  const hasPos = sides.some(s => s > 1e-6);
  const hasNeg = sides.some(s => s < -1e-6);
  if (!hasPos || !hasNeg) return [poly.slice()];
  const pos = clipPolyHalfplane_old(poly, p1, p2, +1);
  const neg = clipPolyHalfplane_old(poly, p1, p2, -1);
  return [pos, neg];
}

function splitPolygonByPathways_old(mainPoly, pathways) {
  if (!Array.isArray(mainPoly) || mainPoly.length < 3) return [];
  if (!pathways || pathways.length === 0) {
    return [{ verts: mainPoly.slice(), id: 0, label: "Region A",
              areaM2: areaLogicalToM2(polyArea(mainPoly)) }];
  }
  let regions = [mainPoly.slice()];
  for (const [p1, p2] of pathways) {
    const next = [];
    for (const r of regions) {
      const pieces = splitPolyByLine_old(r, p1, p2);
      for (const pc of pieces) if (pc.length >= 3) next.push(pc);
    }
    regions = next;
  }
  return regions.map((verts, i) => ({
    verts, id: i,
    label: "Region " + String.fromCharCode(65 + (i % 26)) + (i < 26 ? "" : Math.floor(i/26)),
    areaM2: areaLogicalToM2(polyArea(verts))
  }));
}

// ============================================================================
// NEW IMPLEMENTATIONS (verbatim from working-tree site/indexV4.html)
// ============================================================================
function scanlineSpans(V, y) {
  if (!V || V.length < 3) return [];
  let n = V.length;
  if (Math.abs(V[0][0]-V[n-1][0])<1e-9 && Math.abs(V[0][1]-V[n-1][1])<1e-9) n--;
  const xs = [];
  for (let i=0, j=n-1; i<n; j=i++) {
    const yi = V[i][1], yj = V[j][1];
    if ((yi > y) !== (yj > y)) {
      xs.push(V[i][0] + (y - yi) / (yj - yi) * (V[j][0] - V[i][0]));
    }
  }
  xs.sort((a,b)=>a-b);
  const spans = [];
  for (let k=0; k+1 < xs.length; k+=2)
    if (xs[k+1] - xs[k] > 1e-9) spans.push([xs[k], xs[k+1]]);
  return spans;
}

function stripSpans(V, y0, y1) {
  const K = 7, all = [];
  for (let k=1; k<=K; k++) {
    all.push(...scanlineSpans(V, y0 + (y1-y0)*k/(K+1)));
  }
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

function clipPolyHalfplane_new(poly, p1, p2, keepSign) {
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
    const sC = sideOf(curr);
    const sP = sideOf(prev);
    const inC = sC * keepSign >= 0;
    const inP = sP * keepSign >= 0;
    if (inC) {
      if (!inP) push(cross(prev, curr, sP, sC));
      push(curr.slice());
    } else if (inP) {
      push(cross(prev, curr, sP, sC));
    }
  }
  return out;
}

function splitPolyByLine_new(poly, p1, p2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const sideOf = p => (p[0] - p1[0]) * dy - (p[1] - p1[1]) * dx;
  const sides = poly.map(sideOf);
  const hasPos = sides.some(s => s > 1e-6);
  const hasNeg = sides.some(s => s < -1e-6);
  if (!hasPos || !hasNeg) return [poly.slice()];
  const pos = clipPolyHalfplane_new(poly, p1, p2, +1);
  const neg = clipPolyHalfplane_new(poly, p1, p2, -1);
  return [pos, neg];
}

function splitPolygonByPathways_new(mainPoly, pathways) {
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
      for (const r of regions) {
        for (const pc of splitPolyByLine_new(r, p1, p2)) {
          const cp = cleanPoly(pc);
          if (cp.length >= 3 && polyArea(cp) > MIN_FRAG) next.push(cp);
        }
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
    verts, id: i,
    label: "Region " + String.fromCharCode(65 + (i % 26)) + (i < 26 ? "" : Math.floor(i/26)),
    areaM2: areaLogicalToM2(polyArea(verts))
  }));
}

function buildZones_new(V, truckWidth) {
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
               area: (x1-x0) * (yt-y) * frac,
               insideFrac: +frac.toFixed(3),
               narrow: (x1 - x0) < truckWidth,
               truckWidth });
    }
  }
  Z.sort((a,b)=> (a.y_bot - b.y_bot) || (a.x_min - b.x_min));
  Z.forEach((z,i) => z.id = i);
  return Z;
}

// ============================================================================
// TEST RUNNER
// ============================================================================
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
  cond ? pass++ : fail++;
};
const fmt = n => +n.toFixed(3);

// ---------------------------------------------------------------------------
// T1 — U-shaped polygon: strips across the arms must NOT bridge the gap
// ---------------------------------------------------------------------------
console.log("\nT1  U-shape gap bridging  (buildZones / stripSpans vs polyXRange)");
{
  // U: arms x[0..8] and x[16..24], base y[0..4], arms rise to y=20, gap x[8..16]
  const U = [[0,0],[24,0],[24,20],[16,20],[16,4],[8,4],[8,20],[0,20]];
  const tw = 4;
  const zOld = buildZones_old(U, tw);
  const zNew = buildZones_new(U, tw);
  // gap probe (12, 10) is OUTSIDE the polygon and not on a strip boundary
  const covers = z => z.x_min < 12 && z.x_max > 12 && z.y_bot < 10 && z.y_top > 10;
  const oldBridging = zOld.filter(covers).length;
  const newBridging = zNew.filter(covers).length;
  console.log(`  old zones=${zOld.length} bridging-gap=${oldBridging} | new zones=${zNew.length} bridging-gap=${newBridging}`);
  check("old bridges the gap (bug reproduced)", oldBridging > 0, `${oldBridging} zone(s) span gap centre`);
  check("new never bridges the gap", newBridging === 0);
  // arm strips must produce 2 zones per strip in new version
  const armStrip = zNew.filter(z => z.y_bot >= 4 - 1e-6);
  const perStrip = {};
  armStrip.forEach(z => { const k = fmt(z.y_bot); perStrip[k] = (perStrip[k]||0)+1; });
  check("new: 2 zones per arm strip", Object.values(perStrip).every(c => c === 2),
        JSON.stringify(perStrip));
}

// ---------------------------------------------------------------------------
// T2 — Zone area must track real in-polygon area, not bounding-rect area
// ---------------------------------------------------------------------------
console.log("\nT2  Area inflation on triangle  (zoneInsideFrac)");
{
  const T = [[0,0],[24,0],[12,20]];   // triangle, true area = 240
  const tw = 4;
  const trueA = polyArea(T);
  const sum = zs => zs.reduce((a,z)=>a+z.area, 0);
  const oldSum = sum(buildZones_old(T, tw));
  const newSum = sum(buildZones_new(T, tw));
  const oldErr = Math.abs(oldSum - trueA) / trueA;
  const newErr = Math.abs(newSum - trueA) / trueA;
  console.log(`  true=${fmt(trueA)} oldSum=${fmt(oldSum)} (err ${fmt(oldErr*100)}%) newSum=${fmt(newSum)} (err ${fmt(newErr*100)}%)`);
  check("old overestimates by >15% (bug reproduced)", oldErr > 0.15);
  check("new within 10% of true area", newErr < 0.10);
}

// ---------------------------------------------------------------------------
// T3 — Thin chimney (0.26 wide, off the 0.4 sampling grid) must not produce
//      a phantom full-width zone via the polyXRange bbox fallback
// ---------------------------------------------------------------------------
console.log("\nT3  Thin-feature handling  (scanlineSpans exact edge intersections)");
{
  // body y[0..4] x[0..20]; chimney x[10.25..10.51] (width .26, no 0.4-grid pt:
  // samples are -1+0.4k -> 10.2, 10.6 both miss it) rising y[4..12]
  const P = [[0,0],[20,0],[20,4],[10.51,4],[10.51,12],[10.25,12],[10.25,4],[0,4]];
  const tw = 4;
  const zOld = buildZones_old(P, tw);
  const zNew = buildZones_new(P, tw);
  const chimneyOld = zOld.filter(z => z.y_bot >= 4 - 1e-6);
  const chimneyNew = zNew.filter(z => z.y_bot >= 4 - 1e-6);
  const wOld = chimneyOld.map(z => fmt(z.x_max - z.x_min));
  const wNew = chimneyNew.map(z => fmt(z.x_max - z.x_min));
  console.log(`  chimney-strip zone widths: old=${JSON.stringify(wOld)} new=${JSON.stringify(wNew)} (true width 0.26)`);
  check("old reports phantom wide zone (bug reproduced)", wOld.some(w => w > 1));
  check("new reports ~0.26-wide zone", wNew.length > 0 && wNew.every(w => Math.abs(w - 0.26) < 0.02));
}

// ---------------------------------------------------------------------------
// T4 — Sliver strips: height 2.4×truckWidth used to give strips [1,1,0.4]
//      then a crude merge; new gives equal strips, no merged_sliver
// ---------------------------------------------------------------------------
console.log("\nT4  Sliver strip generation  (equal-height strip distribution)");
{
  // trapezoid narrowing toward the top, height 9.6 = 2.4 × tw(4)
  const P = [[0,0],[24,0],[15,9.6],[9,9.6]];
  const tw = 4;
  const zOld = buildZones_old(P, tw);
  const zNew = buildZones_new(P, tw);
  const hs = zs => zs.map(z => fmt(z.y_top - z.y_bot));
  console.log(`  strip heights: old=${JSON.stringify(hs(zOld))} new=${JSON.stringify(hs(zNew))}`);
  const oldMerged = zOld.some(z => z.merged_sliver);
  const oldMax = Math.max(...hs(zOld)), oldMin = Math.min(...hs(zOld));
  const newHs = hs(zNew);
  check("old produces merged sliver (bug reproduced)", oldMerged,
        `heights ${oldMin}..${oldMax}, merged_sliver=${oldMerged}`);
  check("new strips equal height, none > 1.5×tw", newHs.every(h => Math.abs(h - newHs[0]) < 1e-6 && h <= tw*1.5),
        `uniform h=${newHs[0]}`);
  // merged zone in old claims rect area; compare each top zone's claimed area
  // against the true polygon area inside its y-band (fine sampling, 200×200)
  const bandArea = (y0, y1) => {
    let n = 0; const N = 200;
    for (let iy=0; iy<N; iy++) for (let ix=0; ix<N; ix++)
      if (pip(0 + 24*(ix+0.5)/N, y0 + (y1-y0)*(iy+0.5)/N, P)) n++;
    return 24 * (y1-y0) * n / (N*N);
  };
  const topOld = zOld[zOld.length-1], topNew = zNew[zNew.length-1];
  const trueOldBand = bandArea(topOld.y_bot, topOld.y_top);
  const trueNewBand = bandArea(topNew.y_bot, topNew.y_top);
  console.log(`  top-zone claimed area: old=${fmt(topOld.area)} (true ${fmt(trueOldBand)}) new=${fmt(topNew.area)} (true ${fmt(trueNewBand)})`);
  check("old top zone overclaims area by >15% (bug reproduced)", (topOld.area - trueOldBand)/trueOldBand > 0.15);
  check("new top zone within 10% of true band area", Math.abs(topNew.area - trueNewBand)/trueNewBand < 0.10);
}

// ---------------------------------------------------------------------------
// T5 — Degenerate pathways and noisy clipping output
// ---------------------------------------------------------------------------
console.log("\nT5  Degenerate pathway / noisy clipping  (guards + MIN_FRAG filter)");
{
  const SQ = [[0,0],[20,0],[20,20],[0,20]];
  // 5a: null pathway entry — old crashed, new skips
  let oldThrew = false, oldMsg = "";
  try { splitPolygonByPathways_old(SQ, [null, [[5,0],[5,20]]]); }
  catch (e) { oldThrew = true; oldMsg = e.message; }
  const newRes = splitPolygonByPathways_new(SQ, [null, [[5,0],[5,20]]]);
  console.log(`  null pathway: old threw=${oldThrew} ("${oldMsg}") | new regions=${newRes.length}`);
  check("old throws on null pathway (bug reproduced)", oldThrew);
  check("new skips null pathway, still cuts with valid one", newRes.length === 2);
  // 5b: corner-grazing cut leaves a micro-fragment (~0.005 units², 0.00125% of field)
  const graze = [[19.9,0],[20,0.1]];
  const oldG = splitPolygonByPathways_old(SQ, [graze]);
  const newG = splitPolygonByPathways_new(SQ, [graze]);
  const minOld = Math.min(...oldG.map(r => polyArea(r.verts)));
  console.log(`  corner graze: old regions=${oldG.length} (min area ${minOld.toExponential(2)}) | new regions=${newG.length}`);
  check("old keeps micro-fragment region (bug reproduced)", oldG.length === 2 && minOld < 0.01);
  check("new drops fragment below 0.05% of field", newG.length === 1);
  // 5c: duplicate-vertex polygon through the clipper — cleanPoly + dedup push
  const dirty = [[0,0],[0,0],[20,0],[20,0.0000001],[20,20],[10,20],[10,20],[0,20],[0,0]];
  const cut = splitPolyByLine_new(dirty, [10,0],[10,20]).map(cleanPoly);
  const dupFree = cut.every(p => p.every((v,i) =>
    Math.hypot(v[0]-p[(i+1)%p.length][0], v[1]-p[(i+1)%p.length][1]) > 1e-6));
  check("new clip output has no duplicate/collinear vertices", dupFree,
        `piece sizes ${cut.map(p=>p.length).join(",")}`);
}

// ---------------------------------------------------------------------------
// T6 — Region ordering must be stable when pathway direction is reversed
// ---------------------------------------------------------------------------
console.log("\nT6  Deterministic region ordering  (centroid sort)");
{
  const SQ = [[0,0],[20,0],[20,20],[0,20]];
  const fwd = [[[0,8],[20,12]]];                 // slanted cut, A->B
  const rev = [[[20,12],[0,8]]];                 // same cut, B->A
  const cen = r => r.verts.reduce((a,v)=>[fmt(a[0]+v[0]/r.verts.length), fmt(a[1]+v[1]/r.verts.length)], [0,0]);
  const oldF = splitPolygonByPathways_old(SQ, fwd).map(cen);
  const oldR = splitPolygonByPathways_old(SQ, rev).map(cen);
  const newF = splitPolygonByPathways_new(SQ, fwd).map(cen);
  const newR = splitPolygonByPathways_new(SQ, rev).map(cen);
  console.log(`  old RegionA centroid: fwd=${JSON.stringify(oldF[0])} rev=${JSON.stringify(oldR[0])}`);
  console.log(`  new RegionA centroid: fwd=${JSON.stringify(newF[0])} rev=${JSON.stringify(newR[0])}`);
  const eq = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]) < 1e-3;
  check("old labels flip with pathway direction (bug reproduced)", !eq(oldF[0], oldR[0]));
  check("new labels stable regardless of direction", eq(newF[0], newR[0]) && eq(newF[1], newR[1]));
}

// ---------------------------------------------------------------------------
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
