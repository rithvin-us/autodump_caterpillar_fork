/**
 * hexpack_engine.js
 * =================
 * Extracted & adapted hex-packing simulation engine
 * from the reference team's "Gl0bal_Optima∇" showcase (index-5.html).
 *
 * Compatible with: autodump_caterpillar (preethikakumaravel/autodump_caterpillar)
 * Target stage:    Step 3 · PLAN (dynamic polygon → hex spots) and
 *                  Step 4 · OPERATE (animated truck simulation on canvas).
 *
 * HOW IT WAS EXTRACTED — what changed, what didn't
 * -------------------------------------------------
 * ✅ KEPT AS-IS (pure math, no UI dependencies):
 *    pointInPoly, buildHexSpots, clampToPoly, moveTowards,
 *    segmentIntersection, segmentSegmentDist, cbsSpeedFactor,
 *    updateTruckLogic, all gifDraw* helpers.
 *
 * 🔧 CHANGED to make it dynamic-shape-safe:
 *    - buildHexSpots now takes (poly, spotRadius) only — no hardcoded W/H.
 *    - All draw helpers work on any ctx/W/H passed in.
 *    - Entry detection is automatic (evenly-spaced vertices) or caller-supplied.
 *    - The IIFE per-polygon pattern was replaced with a class: HexPackSim.
 *    - No global `spots`, `trucks` variables — all state lives inside the instance.
 *
 * USAGE (minimal)
 * ---------------
 *   const canvas = document.getElementById('myCanvas');
 *   const sim = new HexPackSim(canvas, {
 *     poly: myPolygon,          // [{x,y}, …]  ← your user-drawn polygon
 *     spotRadius: 14,           // tune to field scale
 *     numTrucks: 1,             // 1–3 for CBS demo
 *     autoPlay: true,
 *   });
 *   // Later:
 *   sim.reset();
 *   sim.pause();
 *   sim.resume();
 *   sim.destroy();             // stops RAF, removes event listener
 *
 * INTEGRATION INTO index_v3.0.2.html  (Step 3 → Step 4 hand-off)
 * ---------------------------------------------------------------
 * See the "Integration guide" comment block at the bottom of this file.
 */

/* ─────────────────────────────────────────────────────────────
   1. PURE MATH LAYER  (zero DOM / canvas deps)
───────────────────────────────────────────────────────────── */

/**
 * Ray-casting point-in-polygon test.
 * Works on any simple (possibly concave) polygon.
 */
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Generate hex-packed dump spots inside any polygon.
 * @param {Array<{x,y}>} poly
 * @param {number}       R          - circle radius (controls density)
 * @returns {Array<{x,y,r,fill,simState}>}
 */
function buildHexSpots(poly, R) {
  const spots = [];

  // Bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const dx = R * 2;
  const dy = R * Math.sqrt(3);

  for (let row = 0; row * dy < (maxY - minY) + R * 2; row++) {
    const offX = (row % 2) ? R : 0;
    for (let col = 0; col * dx < (maxX - minX) + R * 2; col++) {
      const sx = minX + offX + col * dx + R;
      const sy = minY + row * dy + R;
      if (pointInPoly(sx, sy, poly)) {
        spots.push({ x: sx, y: sy, r: R - 2, fill: 0, simState: 'empty' });
      }
    }
  }
  return spots;
}

/**
 * Clamp a point to the closest edge of the polygon.
 */
function clampToPoly(x, y, poly) {
  if (pointInPoly(x, y, poly)) return { x, y };
  let minDist = Infinity, cx = x, cy = y;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const edx = xj - xi, edy = yj - yi;
    const l2 = edx * edx + edy * edy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1,
      ((x - xi) * edx + (y - yi) * edy) / l2));
    const px = xi + t * edx, py = yi + t * edy;
    const d = Math.hypot(x - px, y - py);
    if (d < minDist) { minDist = d; cx = px; cy = py; }
  }
  return { x: cx, y: cy };
}

/**
 * Move truck `t` toward `target` by at most `moveDist` pixels.
 * Stays inside polygon. Returns true when arrived.
 */
function moveTowards(t, target, moveDist, poly) {
  const dx = target.x - t.x, dy = target.y - t.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= moveDist || dist < 3) {
    t.x = target.x; t.y = target.y; return true;
  }
  let nx = t.x + (dx / dist) * moveDist;
  let ny = t.y + (dy / dist) * moveDist;
  const clamped = clampToPoly(nx, ny, poly);
  const stuckDist = Math.hypot(clamped.x - t.x, clamped.y - t.y);
  if (stuckDist < 0.1 && moveDist > 0.1) {
    t.stuckTimer = (t.stuckTimer || 0) + 1;
    if (t.stuckTimer > 5) { t.x = target.x; t.y = target.y; t.stuckTimer = 0; return true; }
  } else { t.stuckTimer = 0; }
  t.x = clamped.x; t.y = clamped.y;
  return false;
}

/* CBS (Conflict-Based Search) helpers */

function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  const abx = bx - ax, aby = by - ay;
  const cdx = dx - cx, cdy = dy - cy;
  const denom = abx * cdy - aby * cdx;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((cx - ax) * cdy - (cy - ay) * cdx) / denom;
  const s = ((cx - ax) * aby - (cy - ay) * abx) / denom;
  if (t < 0 || t > 1 || s < 0 || s > 1) return null;
  return { x: ax + t * abx, y: ay + t * aby };
}

const PATH_LOOK = 90;
function pathEndpoint(t) {
  if (!t.target || t.x === undefined) return null;
  const dx = t.target.x - t.x, dy = t.target.y - t.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: t.x, y: t.y };
  const ratio = Math.min(1, PATH_LOOK / dist);
  return { x: t.x + dx * ratio, y: t.y + dy * ratio };
}

function cbsSpeedFactor(t, allTrucks) {
  if (!allTrucks || allTrucks.length < 2) return 1;
  const BASE_SPEED = 60;
  const CONFLICT_RADIUS = 28;
  const SLOW_RADIUS = 70;
  const tEnd = pathEndpoint(t);
  if (!tEnd) return 1;
  let minFactor = 1;
  for (const o of allTrucks) {
    if (o === t || o.x === undefined ||
        o.state === 'dumping' || o.state === 'spawning') continue;
    const oEnd = pathEndpoint(o);
    if (!oEnd) continue;
    const ix = segmentIntersection(t.x, t.y, tEnd.x, tEnd.y, o.x, o.y, oEnd.x, oEnd.y);
    if (!ix) continue;
    const tDistToIx = Math.hypot(ix.x - t.x, ix.y - t.y);
    const oDistToIx = Math.hypot(ix.x - o.x, ix.y - o.y);
    if (Math.abs(tDistToIx / BASE_SPEED - oDistToIx / BASE_SPEED) > 1.2) continue;
    const tHasPriority = (tDistToIx < oDistToIx - 8) ||
                         (Math.abs(tDistToIx - oDistToIx) <= 8 && t.id < o.id);
    if (tHasPriority) continue;
    const factor = Math.max(0, (tDistToIx - CONFLICT_RADIUS) / (SLOW_RADIUS - CONFLICT_RADIUS));
    minFactor = Math.min(minFactor, factor);
  }
  return minFactor;
}

function updateTruckLogic(t, dt, speedMult, poly, spots, entries, onDumpComplete, allTrucks, entryLocks) {
  const BASE_SPEED = 60;

  if (t.state === 'spawning' || !t.state) {
    const freeEntries = entryLocks
      ? entries.filter(e => !entryLocks.has(e.id) || entryLocks.get(e.id) === t.id)
      : entries;
    const pool = freeEntries.length > 0 ? freeEntries : entries;
    const e = pool[Math.floor(Math.random() * pool.length)];
    if (entryLocks) entryLocks.set(e.id, t.id);
    t.entryId = e.id;
    t.x = e.x; t.y = e.y;
    const avail = spots.filter(s => s.simState === 'empty');
    if (!avail.length) return;
    const spot = avail[Math.floor(Math.random() * avail.length)];
    spot.simState = 'active';
    t.target = spot;
    t.state = 'to_spot';

  } else if (t.state === 'to_spot' || t.state === 'to_exit') {
    if (entryLocks && t.entryId) {
      const entryRef = entries.find(e => e.id === t.entryId);
      if (entryRef && Math.hypot(t.x - entryRef.x, t.y - entryRef.y) > 30) {
        if (entryLocks.get(t.entryId) === t.id) entryLocks.delete(t.entryId);
        t.entryId = null;
      }
    }
    const factor = cbsSpeedFactor(t, allTrucks);
    const moveDist = BASE_SPEED * speedMult * dt * factor;
    if (moveTowards(t, t.target, moveDist, poly)) {
      if (t.state === 'to_spot') {
        t.state = 'dumping'; t.dumpTimer = 0;
      } else {
        if (entryLocks && t.entryId) {
          if (entryLocks.get(t.entryId) === t.id) entryLocks.delete(t.entryId);
          t.entryId = null;
        }
        t.state = 'spawning'; t.target = null;
      }
    }

  } else if (t.state === 'dumping') {
    t.dumpTimer += dt;
    if (t.dumpTimer >= 0.5) {
      t.target.simState = 'filled';
      if (onDumpComplete) onDumpComplete(t);
      let bestExit = entries[0], minDist = Infinity;
      for (const e of entries) {
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        const lockedByOther = entryLocks && entryLocks.has(e.id) && entryLocks.get(e.id) !== t.id;
        if (!lockedByOther && d < minDist) { minDist = d; bestExit = e; }
      }
      if (entryLocks) entryLocks.set(bestExit.id, t.id);
      t.entryId = bestExit.id;
      t.target = bestExit;
      t.state = 'to_exit';
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   2. CANVAS DRAW HELPERS  (ctx, W, H passed explicitly)
───────────────────────────────────────────────────────────── */

function drawBackground(ctx, W, H) {
  ctx.fillStyle = '#0d1b2e';
  ctx.fillRect(0, 0, W, H);
}

function drawPolyOutline(ctx, poly) {
  ctx.strokeStyle = '#1faee8';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  poly.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.stroke();
}

function drawSpots(ctx, spots) {
  spots.forEach(s => {
    if (s.simState === 'empty') {
      ctx.strokeStyle = 'rgba(160,190,220,0.45)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (s.simState === 'filled') {
      ctx.fillStyle = 'rgba(100,160,200,0.7)';
      ctx.strokeStyle = 'rgba(100,160,200,0.9)';
      ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (s.simState === 'active') {
      ctx.fillStyle = 'rgba(245,166,35,0.4)';
      ctx.strokeStyle = '#f5a623';
      ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  });
}

function drawEntry(ctx, e) {
  const sz = 7;
  ctx.fillStyle = '#e8a020';
  ctx.strokeStyle = '#f0b030';
  ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - sz); ctx.lineTo(e.x + sz, e.y);
  ctx.lineTo(e.x, e.y + sz); ctx.lineTo(e.x - sz, e.y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e.id, e.x, e.y + 0.5);
  ctx.textBaseline = 'alphabetic';
}

function drawTruck(ctx, t) {
  if (t.target) {
    ctx.strokeStyle = t.color || '#3a7fd4';
    ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.target.x, t.target.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.shadowColor = t.color || '#3a7fd4';
  ctx.shadowBlur = 10;
  ctx.fillStyle = t.color || '#3a7fd4';
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(t.id), t.x, t.y + 0.5);
  ctx.textBaseline = 'alphabetic';
}

function drawHUD(ctx, W, H, spots, fleetLabel) {
  // Fleet badge (top-left)
  const done  = spots.filter(s => s.simState === 'filled').length;
  const total = spots.length;
  const pct   = total > 0 ? Math.round(done / total * 100) : 0;
  const text  = `${fleetLabel}: ${done}/${total} (${pct}%)`;
  const pad = 6, th = 20;
  ctx.font = '10px monospace';
  const bw = ctx.measureText(text).width + pad * 2;
  ctx.fillStyle = 'rgba(5,15,30,0.82)';
  ctx.strokeStyle = '#4ab8d8';
  ctx.lineWidth = 1.2; ctx.setLineDash([]);
  ctx.beginPath(); ctx.rect(8, 8, bw, th); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4ab8d8';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 8 + pad, 8 + th / 2);
  ctx.textBaseline = 'alphabetic';

  // Overall badge (bottom-right)
  const ov    = total > 0 ? (done / total * 100).toFixed(1) : '0.0';
  const ovTxt = `Overall: ${ov}%`;
  ctx.font = '11px monospace';
  const obw = ctx.measureText(ovTxt).width + 16;
  const bx = W - obw - 10, by = H - 32;
  ctx.fillStyle = 'rgba(5,15,30,0.82)';
  ctx.strokeStyle = '#2ed573'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(bx, by, obw, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2ed573';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(ovTxt, bx + 8, by + 11);
  ctx.textBaseline = 'alphabetic';
}

/* ─────────────────────────────────────────────────────────────
   3. AUTO-ENTRY GENERATION  (no fixed vertex indices needed)
───────────────────────────────────────────────────────────── */

/**
 * Pick `n` evenly-spaced polygon vertices as entry/exit gates.
 * Or supply your own array of {x,y} objects.
 */
function autoEntries(poly, n) {
  n = Math.min(n, poly.length);
  const step = Math.floor(poly.length / n);
  return Array.from({ length: n }, (_, i) => ({
    x: poly[i * step].x,
    y: poly[i * step].y,
    id: 'E' + (i + 1)
  }));
}

/* ─────────────────────────────────────────────────────────────
   4. HexPackSim CLASS  — the main integration surface
───────────────────────────────────────────────────────────── */

class HexPackSim {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   * @param {Array<{x,y}>}  opts.poly        - polygon vertices (scaled to canvas pixels)
   * @param {number}        [opts.spotRadius=14]
   * @param {number}        [opts.numTrucks=1]   - 1, 2 or 3
   * @param {Array}         [opts.entries]       - custom entry gates; auto if omitted
   * @param {number}        [opts.numEntries=6]  - used only when auto-generating
   * @param {boolean}       [opts.autoPlay=false]
   * @param {number}        [opts.speed=1]       - initial speed multiplier
   * @param {string[]}      [opts.truckColors]
   * @param {function}      [opts.onProgress]    - called with (filled, total, pct) each frame
   * @param {function}      [opts.onComplete]    - called when all spots filled
   */
  constructor(canvas, opts = {}) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.opts     = Object.assign({
      spotRadius:   14,
      numTrucks:    1,
      numEntries:   6,
      autoPlay:     false,
      speed:        1,
      truckColors:  ['#3a7fd4', '#f5a623', '#2ed573'],
    }, opts);

    this._raf     = null;
    this._running = false;
    this.speed    = this.opts.speed;

    this._resizeHandler = () => this._onResize();
    window.addEventListener('resize', this._resizeHandler);

    this._build();
    this._drawStatic();
    if (this.opts.autoPlay) this.resume();
  }

  /* ── Public API ── */

  /** Replace polygon mid-session (e.g. user edits boundary). */
  setPoly(poly) {
    this.opts.poly = poly;
    this._build();
    this._drawStatic();
  }

  resume() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(t => this._step(t));
  }

  pause() {
    this._running = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  reset() {
    this.pause();
    this._build();
    this._drawStatic();
  }

  destroy() {
    this.pause();
    window.removeEventListener('resize', this._resizeHandler);
  }

  get stats() {
    const filled = this.spots.filter(s => s.simState === 'filled').length;
    const total  = this.spots.length;
    return { filled, total, pct: total > 0 ? (filled / total * 100) : 0 };
  }

  /* ── Private ── */

  _build() {
    const { poly, spotRadius, numTrucks, numEntries, truckColors } = this.opts;
    if (!poly || poly.length < 3) return;

    this.spots      = buildHexSpots(poly, spotRadius);
    this.entries    = this.opts.entries || autoEntries(poly, numEntries);
    this.entryLocks = new Map();
    this._resetting = false;

    this.trucks = Array.from({ length: numTrucks }, (_, i) => ({
      id:    i + 1,
      color: truckColors[i % truckColors.length],
      state: 'spawning',
      x: undefined, y: undefined,
      target: null, dumpTimer: 0,
    }));
  }

  _drawStatic() {
    const { canvas, ctx, opts, spots, entries } = this;
    if (!opts.poly) return;
    const W = canvas.width, H = canvas.height;
    drawBackground(ctx, W, H);
    drawPolyOutline(ctx, opts.poly);
    if (spots) drawSpots(ctx, spots);
    if (entries) entries.forEach(e => drawEntry(ctx, e));
    if (spots) drawHUD(ctx, W, H, spots, 'F1');
  }

  _step(time) {
    if (!this._running) return;
    let dt = (time - this._lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    this._lastTime = time;

    if (!this._resetting) {
      const { opts, spots, entries, trucks, entryLocks } = this;
      for (const t of trucks) {
        updateTruckLogic(t, dt, this.speed, opts.poly, spots, entries,
          null, trucks, entryLocks);
      }

      const { filled, total, pct } = this.stats;
      if (this.opts.onProgress) this.opts.onProgress(filled, total, pct);

      if (total > 0 && spots.every(s => s.simState === 'filled')) {
        this._resetting = true;
        if (this.opts.onComplete) this.opts.onComplete();
        setTimeout(() => {
          spots.forEach(s => { s.simState = 'empty'; s.fill = 0; });
          trucks.forEach(t => { t.state = 'spawning'; t.x = undefined; t.y = undefined; t.target = null; });
          this.entryLocks.clear();
          this._resetting = false;
        }, 2000);
      }
    }

    this._draw();
    this._raf = requestAnimationFrame(t => this._step(t));
  }

  _draw() {
    const { canvas, ctx, opts, spots, entries, trucks } = this;
    const W = canvas.width, H = canvas.height;
    drawBackground(ctx, W, H);
    drawPolyOutline(ctx, opts.poly);
    drawSpots(ctx, spots);
    entries.forEach(e => drawEntry(ctx, e));
    trucks.forEach(t => { if (t.x !== undefined) drawTruck(ctx, t); });
    drawHUD(ctx, W, H, spots, 'F1');
  }

  _onResize() {
    // Only auto-resize if canvas is inside a flex/grid parent
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const newW = parent.clientWidth;
    if (Math.abs(newW - this.canvas.width) > 10) {
      // Caller should re-scale the polygon and call setPoly() themselves,
      // because the polygon coordinates are user-defined in page-space.
      // We just redraw without rebuild to avoid coordinate mismatch.
      this._drawStatic();
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   5. EXPORT (works as ES module or plain <script>)
───────────────────────────────────────────────────────────── */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HexPackSim, buildHexSpots, pointInPoly, autoEntries };
} else if (typeof window !== 'undefined') {
  window.HexPackSim   = HexPackSim;
  window.buildHexSpots = buildHexSpots;
  window.pointInPoly  = pointInPoly;
  window.autoEntries  = autoEntries;
}

/* ─────────────────────────────────────────────────────────────
   6. INTEGRATION GUIDE — autodump_caterpillar / index_v3.0.2.html
   ──────────────────────────────────────────────────────────────

WHERE TO INSERT IN YOUR PROJECT
────────────────────────────────
Your site has 5 workflow steps. The simulation belongs in:
  • Step 3 · PLAN  → show hex-packing preview (static, no trucks)
  • Step 4 · OPERATE → animate trucks filling spots

STEP 1: Add this file to your repo
  /site/hexpack_engine.js   (or inline the JS into index_v3.0.2.html)

STEP 2: Add the <script> tag in index_v3.0.2.html before your closing </body>:
  <script src="hexpack_engine.js"></script>

STEP 3: In Step 3 (PLAN tab), after the user draws / confirms the polygon, show the hex preview.

  Your current code probably stores the user polygon in a variable.
  Find where it's defined (likely something like `currentPoly` or `sitePolygon`).
  Then:

  ──────────────────────────────────────────────
  // Inside your Step 3 "generatePlan" handler:
  const planCanvas  = document.getElementById('planCanvas'); // add this canvas to your HTML
  planCanvas.width  = planCanvas.parentElement.clientWidth;
  planCanvas.height = 340;

  // currentPoly is your user-drawn polygon, already in canvas pixel coords
  const planPreview = new HexPackSim(planCanvas, {
    poly:        currentPoly,
    spotRadius:  16,           // adjust to your scale
    numTrucks:   0,            // static preview — no trucks yet
    autoPlay:    false,
  });
  planPreview._drawStatic();   // one-shot draw, no animation

  // Show spot count in your UI:
  const { total } = planPreview.stats;
  document.getElementById('spotCountDisplay').textContent = total + ' dump spots';
  ──────────────────────────────────────────────

STEP 4: In Step 4 (OPERATE tab), reuse the same polygon with trucks:

  ──────────────────────────────────────────────
  let activeSim = null;

  function startOperation() {
    const opCanvas  = document.getElementById('operationCanvas');
    opCanvas.width  = opCanvas.parentElement.clientWidth;
    opCanvas.height = 380;

    if (activeSim) activeSim.destroy();

    activeSim = new HexPackSim(opCanvas, {
      poly:       currentPoly,
      spotRadius: 16,
      numTrucks:  fleetSize,  // from your Step 2 fleet config
      numEntries: gateCount,  // from your site config
      autoPlay:   true,
      speed:      1,
      onProgress: (filled, total, pct) => {
        document.getElementById('coveragePct').textContent = pct.toFixed(1) + '%';
        document.getElementById('spotsFilledCount').textContent = filled + '/' + total;
      },
      onComplete: () => {
        console.log('All spots filled — shift complete!');
        // trigger your Step 5 report generation here
      },
    });
  }

  // Wire your PLAY/PAUSE buttons:
  document.getElementById('playBtn').onclick  = () => activeSim?.resume();
  document.getElementById('pauseBtn').onclick = () => activeSim?.pause();
  document.getElementById('resetBtn').onclick = () => activeSim?.reset();

  // Wire your speed slider:
  document.getElementById('speedSlider').oninput = e => {
    if (activeSim) activeSim.speed = parseFloat(e.target.value);
  };
  ──────────────────────────────────────────────

POLYGON COORDINATE HANDLING
────────────────────────────
The other team's polygons use relative coords [0..1] scaled to W/H like:
  verts.map(([rx, ry]) => ({ x: rx * W, y: ry * H }))

Your project likely uses an SVG or canvas polygon drawn by the user.
Make sure your polygon is scaled to the canvas pixel dimensions BEFORE
passing it to HexPackSim. If your polygon is in a different coordinate
space (e.g. GPS or SVG units), transform it first:

  function scalePoly(poly, srcW, srcH, dstW, dstH) {
    return poly.map(p => ({
      x: (p.x / srcW) * dstW,
      y: (p.y / srcH) * dstH
    }));
  }

WHAT NOT TO COPY FROM index-5.html
────────────────────────────────────
❌ The CBS poly-specific polygon definitions (buildCbsPoly, etc.)
   — those are hardcoded demo shapes, not needed.
❌ The fleet-stats HTML panel (fleetStat100, etc.)
   — replace with your own UI elements.
❌ The nav, hero, section, tilt, heatmap sections
   — those are the other team's pitch page, unrelated to your ops tool.
❌ Global `spots`, `trucks` variables
   — HexPackSim encapsulates all state per-instance.

WHAT WAS KEPT (already in this file)
──────────────────────────────────────
✅ pointInPoly            (ray-casting, exact)
✅ buildHexSpots          (hex lattice packing, dynamic poly)
✅ clampToPoly            (boundary collision)
✅ moveTowards            (smooth truck movement)
✅ cbsSpeedFactor         (CBS conflict avoidance between trucks)
✅ updateTruckLogic       (full state machine: spawn→move→dump→exit)
✅ All draw helpers        (background, poly outline, spots, entries, trucks, HUD)
✅ autoEntries            (auto gate placement for any polygon)

───────────────────────────────────────────────────────────────── */
