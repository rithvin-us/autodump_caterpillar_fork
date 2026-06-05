import sys
import re

file_path = r'e:\caterpillar\caterpillar-dashboard-final\autodump_caterpillar\site\index_v3.0.2.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace drawPlanPreview
drawPlan_match = re.search(r'function drawPlanPreview\(\) \{.*?(?=\nfunction exportPlan\(\) \{)', content, re.DOTALL)
if not drawPlan_match:
    print('Could not find drawPlanPreview')
    sys.exit(1)

new_drawPlan = """let planPreview = null;
function drawPlanPreview() {
  const c = document.getElementById("planCanvas");
  if (!c || !STATE.plan) return;
  
  const P = fit(c);
  const currentPoly = STATE.site.verts.map(v => ({ x: P.px(v[0]), y: P.py(v[1]) }));

  if (!planPreview) {
    planPreview = new HexPackSim(c, {
      poly: currentPoly,
      spotRadius: 16,
      numTrucks: 0,
      autoPlay: false,
    });
  } else {
    planPreview.setPoly(currentPoly);
  }
  planPreview._drawStatic();
  
  const { total } = planPreview.stats;
  const el = document.getElementById('p-waypoints');
  if (el) el.textContent = total + ' dump spots';
}
"""
content = content[:drawPlan_match.start()] + new_drawPlan + content[drawPlan_match.end():]

# 2. Replace everything from function opsReset() to the end of renderTokens()
ops_match = re.search(r'function opsReset\(\) \{.*?(?=\n// ============================================================================[\r\n]+//  PAGE 5: REPORT & EXPORT)', content, re.DOTALL)
if not ops_match:
    print('Could not find ops logic')
    sys.exit(1)

new_ops = """let activeSim = null;

function opsReset() {
  const c = document.getElementById("opsCanvas");
  if (!c || !STATE.plan) return;

  if (activeSim) {
    activeSim.destroy();
    activeSim = null;
  }

  const P = fit(c);
  const currentPoly = STATE.site.verts.map(v => ({ x: P.px(v[0]), y: P.py(v[1]) }));
  
  activeSim = new HexPackSim(c, {
    poly: currentPoly,
    spotRadius: 16,
    numTrucks: STATE.fleet.trucks.length || 1,
    numEntries: STATE.site.entries.length || 1,
    autoPlay: false,
    speed: parseFloat(document.getElementById('ops-speed').value) || 1,
    onProgress: (filled, total, pct) => {
      setText("kpi-cov", pct.toFixed(1) + '%');
      setText("kpi-dumps", filled + '/' + total);
      setText("ops-canvas-sub", `sim running · ${filled} dumps · ${pct.toFixed(1)}% coverage`);
      const pbar = document.getElementById("ops-pbar");
      if(pbar) pbar.style.width = pct+"%";
      const pbarText = document.getElementById("ops-pbar-text");
      if(pbarText) pbarText.textContent = pct.toFixed(0)+"% complete";
    },
    onComplete: () => {
      opsLog("All spots filled — shift complete!", "green");
      document.querySelector('.nav-item[data-page="ops"]').classList.add("done");
      document.getElementById("btn-ops-play").textContent = "▶ Start";
      STATE.ops.running = false;
      // trigger report generation
      finalizeReport();
    }
  });

  STATE.ops.running = false;
  document.getElementById("btn-ops-play").textContent = "▶ Start";
  setText("kpi-time", "00:00");
  setText("kpi-active", 0);
  setText("kpi-cov", "0.0%");
  setText("kpi-dumps", "0");
  document.getElementById("ops-log").innerHTML = "";
  document.getElementById("ops-pbar").style.width = "0%";
  document.getElementById("ops-pbar-text").textContent = "0% complete";
  opsLog("Simulation reset — ready", "amber");
}

function opsToggle() {
  if (!STATE.plan || !activeSim) return;
  if (STATE.ops.running) {
    STATE.ops.running = false;
    activeSim.pause();
    document.getElementById("btn-ops-play").textContent = "▶ Resume";
    opsLog("Simulation paused", "amber");
  } else {
    STATE.ops.running = true;
    activeSim.resume();
    document.getElementById("btn-ops-play").textContent = "❚❚ Pause";
    opsLog("Simulation started", "amber");
    setText("kpi-active", STATE.fleet.trucks.length);
  }
}

function opsSpeed() {
  if (activeSim) {
    activeSim.speed = parseFloat(document.getElementById("ops-speed").value);
  }
}

function opsLog(msg, cls) {
  const log = document.getElementById("ops-log"); if (!log) return;
  const line = document.createElement("div"); line.className = "log-line " + (cls || "");
  line.textContent = `> ${msg}`;
  log.insertBefore(line, log.firstChild);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}

// Dummy functions to satisfy references in existing code
function opsTick() {}
function drawOps() {
  if (activeSim) activeSim._drawStatic();
}
function renderTokens() {}
"""
content = content[:ops_match.start()] + new_ops + content[ops_match.end():]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Patched successfully!')
