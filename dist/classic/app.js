const state = {
  payload: null,
  activeKey: "iran",
  activeFilter: "all",
  loading: false,
  previousPayload: loadPreviousPayload()
};

const nodes = {
  statusText: document.getElementById("statusText"),
  statusPill: document.getElementById("statusPill"),
  lastRefresh: document.getElementById("lastRefresh"),
  topPairTrade: document.getElementById("topPairTrade"),
  changeList: document.getElementById("changeList"),
  refreshButton: document.getElementById("refreshButton"),
  overviewGrid: document.getElementById("overviewGrid"),
  tabStrip: document.getElementById("tabStrip"),
  scenarioSelect: document.getElementById("scenarioSelect"),
  scenarioTitle: document.getElementById("scenarioTitle"),
  scenarioSubtitle: document.getElementById("scenarioSubtitle"),
  scenarioSummary: document.getElementById("scenarioSummary"),
  heatValue: document.getElementById("heatValue"),
  heatBand: document.getElementById("heatBand"),
  heatDelta: document.getElementById("heatDelta"),
  subScoreGrid: document.getElementById("subScoreGrid"),
  indicatorGrid: document.getElementById("indicatorGrid"),
  effectsList: document.getElementById("effectsList"),
  tradeTableBody: document.getElementById("tradeTableBody"),
  tradeCards: document.getElementById("tradeCards"),
  headlineList: document.getElementById("headlineList"),
  methodologyText: document.getElementById("methodologyText"),
  disclaimerText: document.getElementById("disclaimerText"),
  tradeRowTemplate: document.getElementById("tradeRowTemplate")
};

/* ===================== persistence ===================== */

function loadPreviousPayload() {
  try {
    return JSON.parse(localStorage.getItem("conflict-dashboard-last-payload") || "null");
  } catch {
    return null;
  }
}

function savePayload(payload) {
  localStorage.setItem("conflict-dashboard-last-payload", JSON.stringify(payload));
}

/* ===================== formatting ===================== */

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function formatPct(value) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(value, unit = "") {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value}${unit}`;
}

function formatTime(value) {
  if (!value) return "Waiting";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function relativeTime(value) {
  if (!value) return "—";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "—";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ===================== small UI helpers ===================== */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexAlpha(hex, alpha) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const HEAT_BANDS = [
  { min: 95, label: "Critical", varName: "--heat-critical" },
  { min: 75, label: "High", varName: "--heat-high" },
  { min: 50, label: "Moderate", varName: "--heat-moderate" },
  { min: 0, label: "Low", varName: "--heat-low" }
];

function heatBand(value) {
  return HEAT_BANDS.find((b) => value >= b.min) || HEAT_BANDS[HEAT_BANDS.length - 1];
}

function heatColor(value) {
  return cssVar(heatBand(value).varName) || "#f5a623";
}

function shortLabel(scenario) {
  return (scenario.title || scenario.key || "").split("/")[0].trim().split(/\s+/)[0] || scenario.key;
}

function shortLabelByKey(key) {
  const s = state.payload?.scenarios?.[key];
  return s ? shortLabel(s) : key;
}

function sectorHue(sector) {
  const s = sector || "General";
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function sectorChip(sector) {
  const label = sector || "General";
  return `<span class="sector-chip" style="--chip-h:${sectorHue(label)}">${label}</span>`;
}

function convictionPips(n) {
  const filled = Math.max(0, Math.min(5, Math.round(n || 0)));
  let out = "";
  for (let i = 1; i <= 5; i += 1) out += `<i class="pip${i <= filled ? " on" : ""}"></i>`;
  return `<span class="pips" title="Conviction ${filled}/5">${out}</span>`;
}

function relevancePips(n) {
  const f = Math.max(0, Math.min(5, Math.round(n)));
  let out = "";
  for (let i = 1; i <= 5; i += 1) out += `<i class="rpip${i <= f ? " on" : ""}"></i>`;
  return out;
}

const REL_KEYWORDS = [
  ["hormuz", 3], ["strait", 2], ["taiwan", 3], ["nato", 2], ["russia", 2],
  ["missile", 2], ["drill", 2], ["shipping", 2], ["warship", 2], ["sanction", 2],
  ["tanker", 2], ["oil", 1], ["gas", 1], ["launch", 2], ["dprk", 2],
  ["pyongyang", 2], ["semiconductor", 2], ["chip", 1], ["blockade", 3]
];

function clientRelevance(headline) {
  const text = `${headline.title} ${headline.description || ""}`.toLowerCase();
  let s = 0;
  REL_KEYWORDS.forEach(([k, w]) => { if (text.includes(k)) s += w; });
  return Math.max(1, Math.min(5, Math.round(s / 2) || 1));
}

function sourceFromDescription(desc) {
  if (!desc) return "";
  const m = desc.match(/<font[^>]*>([^<]+)<\/font>\s*$/i);
  if (m) return m[1].trim();
  const stripped = desc.replace(/<[^>]+>/g, "").trim();
  return stripped.length > 0 && stripped.length < 48 ? stripped : "";
}

function rrBar(rr) {
  const pct = Math.max(2, Math.min(100, (rr / 4) * 100));
  return `<span class="rr-wrap"><span class="rr-bar"><span class="rr-fill ${rr >= 2 ? "good" : ""}" style="width:${pct}%"></span></span><span class="rr-val mono">${rr}x</span></span>`;
}

// Lightweight inline-SVG price sparkline — cheaper than a Chart.js instance per row.
function miniSparkline(series) {
  if (!Array.isArray(series) || series.length < 2) return '<span class="spark-empty">–</span>';
  const w = 64, h = 22, n = series.length;
  const min = Math.min(...series), max = Math.max(...series), rng = (max - min) || 1;
  const pts = series
    .map((v, i) => {
      const x = (i / (n - 1)) * w;
      const y = h - 2 - ((v - min) / rng) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = series[n - 1] >= series[0];
  const col = up ? "var(--long)" : "var(--short)";
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
}

/* ===================== charts (Chart.js) ===================== */

const charts = {};
// Honor reduced-motion for canvas charts (CSS can't reach Chart.js's rAF animations).
if (window.Chart && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  window.Chart.defaults.animation = false;
}
function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function renderHeatGauge(scenario) {
  const el = document.getElementById("heatGauge");
  if (!el || !window.Chart) return;
  destroyChart("heatGauge");
  const v = Math.max(0, Math.min(100, scenario.heat));
  const col = heatColor(scenario.heat);
  charts.heatGauge = new Chart(el, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [v, 100 - v],
        backgroundColor: [col, "rgba(255,255,255,0.06)"],
        borderWidth: 0
      }]
    },
    options: {
      cutout: "75%",
      rotation: -135,
      circumference: 270,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

function renderHeatSpark(scenario) {
  const el = document.getElementById("heatSpark");
  if (!el || !window.Chart) return;
  destroyChart("heatSpark");
  const hist = Array.isArray(scenario.heatHistory) ? scenario.heatHistory : [];
  const pts = hist.map((h) => h.heat);
  if (!pts.length) return;
  const col = heatColor(scenario.heat);
  charts.heatSpark = new Chart(el, {
    type: "line",
    data: {
      labels: hist.map((h) => h.t),
      datasets: [{
        data: pts,
        borderColor: col,
        backgroundColor: hexAlpha(col, 0.14),
        borderWidth: 1.5,
        pointRadius: pts.length <= 2 ? 2.5 : 0,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: { display: false, min: Math.min(...pts, 35) - 5, max: Math.max(...pts, 100) }
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

function renderRadar(scenario) {
  const el = document.getElementById("subscoreRadar");
  if (!el || !window.Chart) return;
  destroyChart("radar");
  const labels = scenario.subScores.map((s) => s.label);
  const data = scenario.subScores.map((s) => s.value);
  const accent = cssVar("--heat-high") || "#f5a623";
  const grid = "rgba(255,255,255,0.09)";
  const datasets = [{
    label: "Now",
    data,
    borderColor: accent,
    backgroundColor: hexAlpha(accent, 0.18),
    borderWidth: 2,
    pointRadius: 2,
    pointBackgroundColor: accent
  }];
  charts.radar = new Chart(el, {
    type: "radar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: grid },
          angleLines: { color: grid },
          pointLabels: { color: cssVar("--text-dim") || "#9aa3b3", font: { size: 10 } }
        }
      },
      plugins: { legend: { display: false }, tooltip: { enabled: true } }
    }
  });
}

function renderEquityCurve(curve) {
  const el = document.getElementById("equityCurve");
  if (!el || !window.Chart) return;
  destroyChart("equityCurve");
  const series = Array.isArray(curve) ? curve : [];
  const pts = series.map((p) => p.totalEquity);
  if (!pts.length) return;
  const base = pts[0] ?? 10000;
  const up = pts[pts.length - 1] >= base;
  const col = up ? cssVar("--long") : cssVar("--short");
  charts.equityCurve = new Chart(el, {
    type: "line",
    data: {
      labels: series.map((p) => p.date),
      datasets: [{
        data: pts,
        borderColor: col,
        backgroundColor: hexAlpha(col, 0.1),
        borderWidth: 1.5,
        pointRadius: pts.length <= 2 ? 3 : 0,
        fill: true,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { display: false }, y: { display: false } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => formatCurrency(c.parsed.y ?? c.parsed) } }
      }
    }
  });
}

function renderAllocation(positions, cash) {
  const el = document.getElementById("allocationChart");
  const legend = document.getElementById("allocationLegend");
  if (!el || !window.Chart) return;
  destroyChart("allocation");
  const groups = {};
  (positions || []).forEach((p) => {
    const k = p.scenario || "other";
    groups[k] = (groups[k] || 0) + (p.allocatedCash || 0);
  });
  const keys = Object.keys(groups);
  const labels = keys.map((k) => shortLabelByKey(k));
  const data = keys.map((k) => groups[k]);
  const colors = keys.map((k) => state.payload?.scenarios?.[k]?.color || "#8b9dc3");
  if (cash && cash > 0) {
    labels.push("Cash");
    data.push(cash);
    colors.push("rgba(255,255,255,0.16)");
  }
  if (!data.length) {
    if (legend) legend.innerHTML = '<p class="muted-cell">No open positions.</p>';
    return;
  }
  charts.allocation = new Chart(el, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      cutout: "60%",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${formatCurrency(c.parsed)}` } }
      }
    }
  });
  if (legend) {
    legend.innerHTML = labels
      .map((l, i) => `<span class="alloc-item"><i style="background:${colors[i]}"></i>${l} <strong class="mono">${formatCurrency(data[i])}</strong></span>`)
      .join("");
  }
}

/* ===================== data load ===================== */

function setLoading(loading) {
  state.loading = loading;
  nodes.refreshButton.disabled = loading;
  nodes.refreshButton.textContent = loading ? "Refreshing…" : "Refresh";
  nodes.statusText.textContent = loading ? "Pulling live data" : "Live";
  if (nodes.statusPill) nodes.statusPill.dataset.state = loading ? "loading" : "live";
}

async function loadData() {
  setLoading(true);
  try {
    const response = await fetch("../api/refresh.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    state.previousPayload = state.payload || state.previousPayload;
    state.payload = payload;
    savePayload(payload);
    nodes.lastRefresh.textContent = formatTime(payload.generatedAt);
    nodes.methodologyText.textContent = payload.methodology;
    nodes.disclaimerText.textContent = payload.disclaimer;
    if (!payload.scenarios[state.activeKey]) {
      state.activeKey = Object.keys(payload.scenarios)[0];
    }
    renderTabs();
    renderOverview();
    renderScenario();
    renderChanges();
  } catch (error) {
    nodes.statusText.textContent = "Refresh failed";
    if (nodes.statusPill) nodes.statusPill.dataset.state = "error";
    nodes.lastRefresh.textContent = error.message;
  } finally {
    setLoading(false);
  }
}

/* ===================== scenario navigation ===================== */

function setActiveScenario(key) {
  if (!state.payload?.scenarios?.[key]) return;
  state.activeKey = key;
  syncScenarioNav();
  renderScenario();
  renderChanges();
}

function syncScenarioNav() {
  nodes.tabStrip?.querySelectorAll(".tab-button").forEach((b) => {
    const on = b.dataset.key === state.activeKey;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  nodes.overviewGrid?.querySelectorAll(".overview-card").forEach((c) => {
    const on = c.dataset.key === state.activeKey;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });
  if (nodes.scenarioSelect) nodes.scenarioSelect.value = state.activeKey;
}

function renderOverview() {
  const scenarios = Object.values(state.payload.scenarios);
  nodes.overviewGrid.innerHTML = "";

  scenarios.forEach((scenario) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `overview-card${scenario.key === state.activeKey ? " active" : ""}`;
    card.dataset.key = scenario.key;
    card.setAttribute("aria-pressed", scenario.key === state.activeKey ? "true" : "false");
    card.style.setProperty("--scenario-color", scenario.color || "var(--accent)");

    const band = heatBand(scenario.heat);
    const col = heatColor(scenario.heat);
    const prev = state.previousPayload?.scenarios?.[scenario.key];
    const dHeat = prev ? scenario.heat - prev.heat : null;
    const deltaChip = dHeat == null || dHeat === 0
      ? ""
      : `<span class="heat-chip-delta ${dHeat > 0 ? "up" : "down"}">${dHeat > 0 ? "▲" : "▼"}${Math.abs(dHeat)}</span>`;
    const strongest = [...scenario.subScores].sort((a, b) => b.value - a.value)[0];

    card.innerHTML = `
      <div class="ov-top">
        <span class="ov-title">${shortLabel(scenario)}</span>
        <span class="heat-chip" style="--hc:${col}">${scenario.heat}${deltaChip}</span>
      </div>
      <div class="ov-band" style="--hc:${col}">${band.label} risk</div>
      <p class="ov-sub">${scenario.subtitle}</p>
      <div class="ov-foot"><span>${strongest.label}</span><strong class="mono">${strongest.value}</strong></div>
    `;
    card.addEventListener("click", () => setActiveScenario(scenario.key));
    nodes.overviewGrid.appendChild(card);
  });
  syncScenarioNav();
}

function renderTabs() {
  const scenarios = Object.values(state.payload.scenarios);
  nodes.tabStrip.innerHTML = "";
  nodes.scenarioSelect.innerHTML = "";

  scenarios.forEach((scenario) => {
    const button = document.createElement("button");
    button.className = `tab-button${scenario.key === state.activeKey ? " active" : ""}`;
    button.textContent = shortLabel(scenario);
    button.dataset.key = scenario.key;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", scenario.key === state.activeKey ? "true" : "false");
    button.addEventListener("click", () => setActiveScenario(scenario.key));
    nodes.tabStrip.appendChild(button);

    const option = document.createElement("option");
    option.value = scenario.key;
    option.textContent = scenario.title;
    if (scenario.key === state.activeKey) option.selected = true;
    nodes.scenarioSelect.appendChild(option);
  });
}

function renderScenario() {
  const scenario = state.payload.scenarios[state.activeKey];
  if (!scenario) return;

  nodes.scenarioTitle.textContent = scenario.title;
  nodes.scenarioSubtitle.textContent = scenario.subtitle;
  nodes.scenarioSummary.textContent = scenario.summary;

  const band = heatBand(scenario.heat);
  const col = heatColor(scenario.heat);
  nodes.heatValue.textContent = String(scenario.heat);
  nodes.heatValue.style.color = col;
  if (nodes.heatBand) {
    nodes.heatBand.textContent = `${band.label} risk`;
    nodes.heatBand.style.color = col;
  }

  const prev = state.previousPayload?.scenarios?.[state.activeKey];
  if (nodes.heatDelta) {
    if (prev) {
      const d = scenario.heat - prev.heat;
      nodes.heatDelta.textContent = d === 0 ? "no change vs last" : `${d > 0 ? "▲ +" : "▼ "}${d} vs last`;
      nodes.heatDelta.className = `heat-delta mono ${d > 0 ? "rising" : d < 0 ? "falling" : "flat"}`;
    } else {
      nodes.heatDelta.textContent = "first snapshot";
      nodes.heatDelta.className = "heat-delta mono flat";
    }
  }

  nodes.topPairTrade.textContent = scenario.topPairTrade || "No pair trade";

  renderSubScores(scenario.subScores);
  renderIndicators(scenario.indicators);
  renderEffects(scenario.secondOrderEffects);
  renderTrades(scenario.trades);
  renderHeadlines(scenario.headlines);

  renderHeatGauge(scenario);
  renderHeatSpark(scenario);
  renderRadar(scenario);
}

function renderSubScores(subScores) {
  nodes.subScoreGrid.innerHTML = "";
  const ranked = [...subScores].sort((a, b) => b.value - a.value);
  ranked.forEach((item) => {
    const row = document.createElement("div");
    row.className = "subscore-legend-item";
    const col = heatColor(item.value);
    row.innerHTML = `
      <span class="ssl-dot" style="background:${col}"></span>
      <span class="ssl-label">${item.label}</span>
      <span class="ssl-value mono" style="color:${col}">${item.value}</span>
    `;
    nodes.subScoreGrid.appendChild(row);
  });
}

function renderIndicators(indicators) {
  nodes.indicatorGrid.innerHTML = "";
  indicators.forEach((item) => {
    const moved = Math.abs(item.delta || 0) >= 0.5;
    const card = document.createElement("div");
    card.className = "indicator-card";
    card.innerHTML = `
      <span class="indicator-label">${item.label}</span>
      <strong class="mono">${item.value}${item.unit ? ` ${item.unit}` : ""}</strong>
      <span class="indicator-delta ${moved ? "moved" : "flat"}">${item.delta >= 0 ? "▲" : "▼"} ${formatDelta(item.delta, item.unit === "%" ? "%" : "")}</span>
    `;
    nodes.indicatorGrid.appendChild(card);
  });
}

function renderEffects(effects) {
  nodes.effectsList.innerHTML = "";
  (effects || []).forEach((effect) => {
    const item = document.createElement("div");
    item.className = "effect-item";
    item.textContent = effect;
    nodes.effectsList.appendChild(item);
  });
}

/* ===================== trades ===================== */

function getFilteredTrades(trades) {
  if (state.activeFilter === "all") return trades;
  return trades.filter((trade) => {
    if (state.activeFilter === "LONG" || state.activeFilter === "SHORT") {
      return trade.direction === state.activeFilter;
    }
    return (trade.sector || "").toLowerCase().includes(state.activeFilter.toLowerCase());
  });
}

const expandedTradeIds = new Set();
function tradeKey(trade) {
  return `${state.activeKey}:${trade.ticker}:${trade.direction}`;
}

function renderTrades(trades) {
  nodes.tradeTableBody.innerHTML = "";
  if (nodes.tradeCards) nodes.tradeCards.innerHTML = "";
  const filtered = getFilteredTrades(trades);

  if (!filtered.length) {
    nodes.tradeTableBody.innerHTML = '<tr><td colspan="7" class="muted-cell">No trades match this filter.</td></tr>';
    return;
  }

  filtered.forEach((trade) => {
    const id = tradeKey(trade);
    const expanded = expandedTradeIds.has(id);
    const fragment = nodes.tradeRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector("tr");
    row.dataset.tradeId = id;
    if (expanded) row.classList.add("expanded");

    fragment.querySelector(".ticker").textContent = trade.ticker;
    fragment.querySelector(".row-chevron").textContent = expanded ? "▾" : "▸";
    fragment.querySelector(".conviction-pips").outerHTML = convictionPips(trade.conviction);

    fragment.querySelector(".direction").innerHTML =
      `<span class="direction-badge ${trade.direction.toLowerCase()}">${trade.direction}</span>`;
    fragment.querySelector(".sector").innerHTML = sectorChip(trade.sector);

    const priceNode = fragment.querySelector(".price");
    priceNode.innerHTML = trade.price != null
      ? `${formatCurrency(trade.price)}${trade.priceSource === "Fallback baseline" ? '<span class="px-fallback" title="Fallback price">~</span>' : ""}`
      : "N/A";

    fragment.querySelector(".rr").innerHTML = trade.rewardToRisk != null ? rrBar(trade.rewardToRisk) : "N/A";
    fragment.querySelector(".horizon").textContent = trade.horizon || "Tactical";
    fragment.querySelector(".spark-mini").innerHTML = miniSparkline(trade.priceSeries);

    row.addEventListener("click", () => toggleTradeDetail(row, trade, id));
    nodes.tradeTableBody.appendChild(fragment);
    if (expanded) nodes.tradeTableBody.appendChild(buildTradeDetailRow(trade));

    if (nodes.tradeCards) nodes.tradeCards.appendChild(buildTradeCard(trade));
  });
}

function toggleTradeDetail(row, trade, id) {
  const next = row.nextElementSibling;
  const isOpen = next && next.classList.contains("trade-detail");
  const chev = row.querySelector(".row-chevron");
  if (isOpen) {
    next.remove();
    row.classList.remove("expanded");
    expandedTradeIds.delete(id);
    if (chev) chev.textContent = "▸";
    return;
  }
  row.classList.add("expanded");
  expandedTradeIds.add(id);
  if (chev) chev.textContent = "▾";
  row.parentNode.insertBefore(buildTradeDetailRow(trade), row.nextSibling);
}

function buildTradeDetailRow(trade) {
  const tr = document.createElement("tr");
  tr.className = "trade-detail";
  tr.innerHTML = `<td colspan="7">${renderTradeDetail(trade)}</td>`;
  return tr;
}

function renderTradeDetail(trade) {
  const math = [
    ["Target", formatCurrency(trade.targetPrice)],
    ["Stop", formatCurrency(trade.stopPrice)],
    ["Upside", formatPct(trade.upsidePct)],
    ["Downside", formatPct(trade.downsidePct)],
    ["Reward:risk", trade.rewardToRisk != null ? `${trade.rewardToRisk}x` : "N/A"],
    ["Risk level", trade.riskLevel || "—"]
  ].map(([k, v]) => `<div class="td-stat"><span>${k}</span><strong class="mono">${v}</strong></div>`).join("");

  return `
    <div class="trade-detail-grid">
      <div class="td-thesis">
        <span class="detail-tag">Thesis</span>
        <p>${trade.thesis || "—"}</p>
        <div class="td-cols">
          <div><span class="detail-sublabel">Catalyst</span><p>${trade.catalyst || "—"}</p></div>
          <div><span class="detail-sublabel">Thesis breaker</span><p>${trade.thesisBreaker || "—"}</p></div>
          <div><span class="detail-sublabel">Pair trade</span><p class="mono">${trade.pairTrade || "—"}</p></div>
        </div>
      </div>
      <div class="td-math">
        <span class="detail-tag">Risk bands</span>
        <div class="td-stat-grid">${math}</div>
        <div class="td-pricesource">${trade.priceSource || ""}${trade.lastQuoteDate ? ` · ${trade.lastQuoteDate}` : ""}</div>
      </div>
    </div>
  `;
}

function buildTradeCard(trade) {
  const card = document.createElement("article");
  card.className = "trade-card";
  card.innerHTML = `
    <div class="tc-head">
      <div class="tc-ticker">
        <strong class="mono">${trade.ticker}</strong>
        <span class="direction-badge ${trade.direction.toLowerCase()}">${trade.direction}</span>
        ${convictionPips(trade.conviction)}
      </div>
      <span class="mono tc-price">${trade.price != null ? formatCurrency(trade.price) : "N/A"}</span>
    </div>
    <div class="tc-meta">
      ${sectorChip(trade.sector)}
      <span class="tc-rr">${trade.rewardToRisk != null ? `${trade.rewardToRisk}x R:R` : ""}</span>
      <span class="tc-horizon">${trade.horizon || ""}</span>
    </div>
    <p class="tc-thesis">${trade.thesis || ""}</p>
    <div class="tc-bands">
      <span>Tgt <strong class="mono">${formatCurrency(trade.targetPrice)}</strong></span>
      <span>Stop <strong class="mono">${formatCurrency(trade.stopPrice)}</strong></span>
    </div>
  `;
  return card;
}

/* ===================== headlines ===================== */

function renderHeadlines(headlines) {
  nodes.headlineList.innerHTML = "";

  if (!headlines || !headlines.length) {
    nodes.headlineList.innerHTML = '<div class="headline-empty">No recent headlines were returned for this refresh window.</div>';
    return;
  }

  const prevTitles = new Set(
    (state.previousPayload?.scenarios?.[state.activeKey]?.headlines || []).map((h) => h.title)
  );

  headlines.forEach((headline) => {
    const isNew = state.previousPayload && !prevTitles.has(headline.title);
    const rel = headline.relevance != null ? headline.relevance : clientRelevance(headline);
    const source = headline.source || sourceFromDescription(headline.description) || "News";

    const article = document.createElement("article");
    article.className = "headline-item";
    article.innerHTML = `
      <div class="headline-top">
        <span class="relevance-pips" title="Signal relevance ${rel}/5">${relevancePips(rel)}</span>
        ${isNew ? '<span class="badge-new">NEW</span>' : ""}
        <span class="headline-source">${source}</span>
        <span class="headline-time mono">${relativeTime(headline.publishedAt)}</span>
      </div>
      <a href="${headline.link}" target="_blank" rel="noreferrer">${headline.title}</a>
    `;
    nodes.headlineList.appendChild(article);
  });
}

function renderChanges() {
  nodes.changeList.innerHTML = "";
  const current = state.payload?.scenarios?.[state.activeKey];
  const previous = state.previousPayload?.scenarios?.[state.activeKey];

  const items = [];
  if (!current) return;

  if (!previous) {
    items.push("First captured snapshot for this scenario.");
  } else {
    const heatDelta = current.heat - previous.heat;
    items.push(`Heat ${heatDelta >= 0 ? "up" : "down"} ${Math.abs(heatDelta)} pts.`);

    const currentTopHeadline = current.headlines?.[0]?.title;
    const previousTopHeadline = previous.headlines?.[0]?.title;
    if (currentTopHeadline && currentTopHeadline !== previousTopHeadline) {
      items.push("Top headline rotated.");
    }

    const currentTopTrade = current.trades?.[0];
    const previousTopTrade = previous.trades?.[0];
    if (currentTopTrade && previousTopTrade && currentTopTrade.targetPrice !== previousTopTrade.targetPrice) {
      items.push(`${currentTopTrade.ticker} target → ${formatCurrency(currentTopTrade.targetPrice)}.`);
    }
  }

  items.slice(0, 3).forEach((item) => {
    const line = document.createElement("div");
    line.className = "change-item";
    line.textContent = item;
    nodes.changeList.appendChild(line);
  });
}

/* ===================== trader ===================== */

async function loadTrader() {
  try {
    const response = await fetch("../api/trader.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderTrader(data);
  } catch (error) {
    const eq = document.getElementById("traderEquity");
    if (eq) eq.textContent = `Error: ${error.message}`;
  }
}

function renderTrader(data) {
  const { state, memory, live } = data;
  if (!state) return;

  const eqNode = document.getElementById("traderEquity");
  const deltaNode = document.getElementById("traderEquityDelta");
  const last = state.equityCurve?.[state.equityCurve.length - 1];

  // Prefer live mark-to-market over the last cycle's equity snapshot
  const totalEquity = live?.equity ?? last?.totalEquity ?? state.cash ?? 10000;
  const pct = live?.pctReturn ?? last?.pctVsStart ?? 0;

  eqNode.textContent = formatCurrency(totalEquity);
  const deltaPct = (pct * 100).toFixed(2);
  deltaNode.textContent = `${pct >= 0 ? "+" : ""}${deltaPct}% vs $10,000 start`;
  deltaNode.className = `trader-equity-delta ${pct >= 0 ? "positive" : "negative"}`;

  document.getElementById("traderCash").textContent = formatCurrency(state.cash);
  document.getElementById("traderOpenCount").textContent = state.openPositions.length;
  document.getElementById("traderClosedCount").textContent = state.closedTrades.length;
  document.getElementById("traderCycles").textContent = state.cycles;
  document.getElementById("traderMemoryBuckets").textContent = memory?.summary?.bucketCount ?? 0;

  const wins = state.closedTrades.filter((t) => t.outcome === "win").length;
  const total = state.closedTrades.length;
  document.getElementById("traderWinRate").textContent =
    total > 0 ? `${((wins / total) * 100).toFixed(0)}% (${wins}/${total})` : "No trades yet";

  const lastRunNode = document.getElementById("traderLastRun");
  if (live?.fetchedAt) {
    lastRunNode.textContent = `Live · prices ${formatTime(live.fetchedAt)} · cycle #${state.cycles}`;
  } else {
    lastRunNode.textContent = state.lastRunAt
      ? `Last cycle ${formatTime(state.lastRunAt)} · cycle #${state.cycles}`
      : "Waiting for first cycle";
  }

  renderTraderOpen(state.openPositions);
  renderTraderClosed(state.closedTrades.slice(-10).reverse());
  renderTraderWatchlist(state.lastWatchlist || []);
  renderTraderMemory(memory?.summary || { top: [], bottom: [] });
  renderSimulation(data.simulation, data.calibration);

  renderEquityCurve(state.equityCurve);
  renderAllocation(state.openPositions, state.cash);
}

const FAILURE_LABELS = {
  target_hit: "Target hit clean",
  target_undershoot: "Target too modest",
  stop_overshoot: "Stop too tight",
  stop_hit_quick: "Stopped within 5d",
  stop_hit_late: "Stopped late",
  horizon_drift_winner: "Drifted (winner)",
  horizon_drift_loser: "Drifted (loser)"
};
const FAILURE_COLORS = {
  target_hit: "long",
  target_undershoot: "warn",
  stop_overshoot: "warn",
  stop_hit_quick: "short",
  stop_hit_late: "short",
  horizon_drift_winner: "long-dim",
  horizon_drift_loser: "short-dim"
};

const COMPONENT_LABELS = {
  conviction: "Conviction",
  scenario: "Scenario",
  riskReward: "Risk/Reward",
  trend: "Trend",
  volRegime: "Vol regime",
  catalyst: "Catalyst",
  memory: "Memory"
};

const DEFAULT_WEIGHTS = {
  conviction: 0.18, scenario: 0.14, riskReward: 0.16,
  trend: 0.14, volRegime: 0.08, catalyst: 0.10, memory: 0.20
};

function renderSimulation(sim, calibration) {
  const panel = document.getElementById("simulationPanel");
  if (!panel) return;
  if (!sim || !sim.closedCount) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const subtitle = document.getElementById("simulationSubtitle");
  if (subtitle) {
    const since = sim.startDate ? new Date(sim.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
    subtitle.textContent = `${sim.closedCount.toLocaleString()} simulated trades since ${since} · ${sim.tradingDays} trading days`;
  }
  document.getElementById("simClosed").textContent = sim.closedCount.toLocaleString();
  document.getElementById("simWinRate").textContent = `${(sim.overallWinRate * 100).toFixed(1)}%`;
  const avg = document.getElementById("simAvgPnl");
  avg.textContent = `${(sim.overallAvgPnlPct * 100).toFixed(2)}%`;
  avg.className = "mono " + (sim.overallAvgPnlPct >= 0 ? "positive" : "negative");
  document.getElementById("simRecalibrated").textContent = sim.recalibratedBuckets || 0;

  renderFailureBar(sim.failureMode || {}, sim.closedCount);
  renderVariantStats(sim.variantStats || {});
  renderRecalibratedBuckets(calibration?.perBucket || {}, sim.topRecalibrationSignals || []);
  renderActiveWeights(calibration);
}

function renderActiveWeights(calibration) {
  const panel = document.getElementById("simActivePanel");
  const grid = document.getElementById("simActiveWeights");
  const sub = document.getElementById("simActiveSub");
  const bucketsSub = document.getElementById("simBucketsSub");
  if (!panel || !grid) return;

  const globalWeights = calibration?.globalWeights;
  const tournamentMeta = calibration?.tournamentMeta;
  const applyBucket = calibration?.applyBucketWeights === true;

  if (!globalWeights) {
    panel.hidden = true;
    if (bucketsSub) bucketsSub.textContent = "Observational — disabled by default after overfit testing";
    return;
  }

  panel.hidden = false;
  if (sub) {
    const meta = tournamentMeta
      ? `Tournament-tuned · +${(tournamentMeta.improvement * 100).toFixed(2)}pp vs baseline (${tournamentMeta.candidateCount} candidates)`
      : `Active global weights · applied to live scoring`;
    sub.textContent = meta;
  }
  if (bucketsSub) {
    bucketsSub.textContent = applyBucket
      ? "Active overrides applied per bucket"
      : "Observational — disabled (using tournament global weights instead)";
  }

  grid.innerHTML = "";
  const order = ["conviction", "scenario", "riskReward", "trend", "volRegime", "catalyst", "memory"];
  for (const comp of order) {
    const w = globalWeights[comp];
    const dflt = DEFAULT_WEIGHTS[comp];
    const delta = w - dflt;
    const deltaClass = delta > 0.005 ? "positive" : delta < -0.005 ? "negative" : "neutral";
    const widthPct = (w * 100).toFixed(1);
    const cell = document.createElement("div");
    cell.className = "active-weight";
    cell.innerHTML = `
      <div class="active-weight-head">
        <span class="active-weight-label">${COMPONENT_LABELS[comp]}</span>
        <span class="active-weight-pct mono">${widthPct}%</span>
      </div>
      <div class="active-weight-track">
        <div class="active-weight-fill" style="width:${widthPct}%"></div>
      </div>
      <div class="active-weight-delta mono ${deltaClass}">${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp vs default</div>
    `;
    grid.appendChild(cell);
  }
}

function renderFailureBar(failureMode, total) {
  const bar = document.getElementById("simFailureBar");
  const legend = document.getElementById("simFailureLegend");
  if (!bar || !legend) return;
  bar.innerHTML = "";
  legend.innerHTML = "";
  const order = [
    "target_hit", "target_undershoot",
    "horizon_drift_winner", "horizon_drift_loser",
    "stop_overshoot", "stop_hit_quick", "stop_hit_late"
  ];
  for (const kind of order) {
    const n = failureMode[kind] || 0;
    if (!n) continue;
    const pct = (n / total) * 100;
    const seg = document.createElement("div");
    seg.className = `failure-seg failure-${FAILURE_COLORS[kind]}`;
    seg.style.flex = `${pct} 0 0`;
    seg.title = `${FAILURE_LABELS[kind]}: ${n} (${pct.toFixed(1)}%)`;
    bar.appendChild(seg);

    const li = document.createElement("div");
    li.className = "legend-item";
    li.innerHTML = `
      <span class="legend-dot failure-${FAILURE_COLORS[kind]}"></span>
      <span class="legend-label">${FAILURE_LABELS[kind]}</span>
      <span class="legend-pct mono">${pct.toFixed(1)}%</span>
      <span class="legend-n mono">n=${n.toLocaleString()}</span>
    `;
    legend.appendChild(li);
  }
}

function renderVariantStats(variants) {
  const grid = document.getElementById("simVariants");
  if (!grid) return;
  grid.innerHTML = "";
  const order = ["tight_stop", "standard", "wide_stop", "tight_target", "wide_target"];
  const labels = {
    standard: "Standard",
    tight_stop: "Tight stop ×0.7",
    wide_stop: "Wide stop ×1.3",
    tight_target: "Tight target ×0.7",
    wide_target: "Wide target ×1.3"
  };
  const stdRate = variants.standard?.winRate ?? 0;
  for (const k of order) {
    const v = variants[k];
    if (!v) continue;
    const delta = v.winRate - stdRate;
    const deltaClass = delta > 0.02 ? "positive" : delta < -0.02 ? "negative" : "neutral";
    const isStd = k === "standard";
    const card = document.createElement("div");
    card.className = `variant-card${isStd ? " variant-standard" : ""}`;
    card.innerHTML = `
      <div class="variant-label">${labels[k]}</div>
      <div class="variant-stats">
        <span class="mono variant-winrate">${(v.winRate * 100).toFixed(1)}%</span>
        ${!isStd ? `<span class="mono variant-delta ${deltaClass}">${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp</span>` : ""}
      </div>
      <div class="variant-meta mono">n=${v.n.toLocaleString()} · avg ${(v.avgPnlPct * 100).toFixed(2)}%</div>
    `;
    grid.appendChild(card);
  }
}

function renderRecalibratedBuckets(perBucket, topSignals) {
  const grid = document.getElementById("simBuckets");
  if (!grid) return;
  grid.innerHTML = "";

  const entries = Object.entries(perBucket || {})
    .filter(([k]) => k.split("|").length === 3) // most-specific buckets only
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8);

  if (!entries.length) {
    grid.innerHTML = '<p class="muted-cell">No buckets had enough samples to recalibrate.</p>';
    return;
  }

  entries.forEach(([key, b]) => {
    const card = document.createElement("article");
    card.className = "bucket-card";
    const keyParts = key.split("|").map((p) => p.split(":")[1]).join(" · ");
    const stopMult = b.stopMult || 1;
    const targetMult = b.targetMult || 1;
    const stopBadge = stopMult !== 1 ? `<span class="bucket-mult ${stopMult > 1 ? "positive" : "negative"}">stop ×${stopMult.toFixed(2)}</span>` : "";
    const targetBadge = targetMult !== 1 ? `<span class="bucket-mult ${targetMult > 1 ? "positive" : "negative"}">target ×${targetMult.toFixed(2)}</span>` : "";
    const weightBars = Object.entries(b.weights || {}).map(([comp, w]) => {
      const dflt = DEFAULT_WEIGHTS[comp] || 0;
      const delta = w - dflt;
      const dCls = delta > 0.01 ? "positive" : delta < -0.01 ? "negative" : "neutral";
      const widthPct = (w * 100).toFixed(1);
      return `
        <div class="weight-row" title="${COMPONENT_LABELS[comp]}">
          <span class="weight-label">${comp.slice(0, 4)}</span>
          <div class="weight-track">
            <div class="weight-fill" style="width:${widthPct}%"></div>
          </div>
          <span class="weight-value mono ${dCls}">${(w * 100).toFixed(1)}${delta !== 0 ? ` (${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)})` : ""}</span>
        </div>`;
    }).join("");
    const winClass = (b.standardWinRate || 0) >= 0.5 ? "positive" : "negative";
    card.innerHTML = `
      <div class="bucket-head">
        <div class="bucket-key">${keyParts}</div>
        <div class="bucket-badges">
          ${stopBadge}
          ${targetBadge}
        </div>
      </div>
      <div class="bucket-stats mono">
        <span>n=${b.n}</span>
        <span class="${winClass}">${((b.standardWinRate||0)*100).toFixed(0)}% win</span>
        <span class="${(b.standardAvgPnl||0)>=0?'positive':'negative'}">avg ${((b.standardAvgPnl||0)*100).toFixed(1)}%</span>
      </div>
      <div class="weight-grid">${weightBars}</div>
    `;
    grid.appendChild(card);
  });
}

const expandedPositionIds = new Set();

function renderTraderOpen(positions) {
  const body = document.getElementById("traderOpenBody");
  body.innerHTML = "";
  if (!positions.length) {
    body.innerHTML = '<tr><td colspan="10" class="muted-cell">No open positions. Run /ai-trader to enter.</td></tr>';
    return;
  }
  positions.forEach((pos) => {
    const pctClass = pos.unrealizedPct >= 0 ? "positive" : "negative";
    const score = pos.finalScoreAtEntry ?? Math.round((pos.confidenceAtEntry || 0) * 100);
    const scoreClass = scoreColorClass(score);
    const wasExpanded = expandedPositionIds.has(pos.id);

    const row = document.createElement("tr");
    row.className = `position-row${wasExpanded ? " expanded" : ""}`;
    row.dataset.positionId = pos.id;
    row.innerHTML = `
      <td class="ticker-cell">
        <span class="row-chevron">${wasExpanded ? "▾" : "▸"}</span>
        <strong>${pos.ticker}</strong>
      </td>
      <td>${pos.scenarioTitle || pos.scenario}</td>
      <td><span class="direction-badge ${pos.direction.toLowerCase()}">${pos.direction}</span></td>
      <td class="num">${formatCurrency(pos.entryPrice)}</td>
      <td class="num">${formatCurrency(pos.currentPrice)}</td>
      <td class="num">${formatCurrency(pos.targetPrice)}</td>
      <td class="num">${formatCurrency(pos.stopPrice)}</td>
      <td class="num ${pctClass}">${formatCurrency(pos.unrealizedPnlDollar)}</td>
      <td class="num ${pctClass}">${(pos.unrealizedPct * 100).toFixed(2)}%</td>
      <td class="num"><span class="score-cell ${scoreClass}">${score.toFixed(0)}</span></td>
    `;
    row.addEventListener("click", () => togglePositionDetail(row, pos));
    body.appendChild(row);
    if (wasExpanded) {
      body.appendChild(buildPositionDetailRow(pos));
    }
  });
}

function togglePositionDetail(row, pos) {
  const next = row.nextElementSibling;
  const isExpanded = next && next.classList.contains("position-detail");
  if (isExpanded) {
    next.remove();
    row.classList.remove("expanded");
    expandedPositionIds.delete(pos.id);
    const chev = row.querySelector(".row-chevron");
    if (chev) chev.textContent = "▸";
    return;
  }
  row.classList.add("expanded");
  expandedPositionIds.add(pos.id);
  const chev = row.querySelector(".row-chevron");
  if (chev) chev.textContent = "▾";
  row.parentNode.insertBefore(buildPositionDetailRow(pos), row.nextSibling);
}

function buildPositionDetailRow(pos) {
  const detail = document.createElement("tr");
  detail.className = "position-detail";
  detail.innerHTML = `<td colspan="10">${renderPositionDetail(pos)}</td>`;
  return detail;
}

function renderPositionDetail(pos) {
  const score = pos.finalScoreAtEntry ?? Math.round((pos.confidenceAtEntry || 0) * 100);
  const scoreClass = scoreColorClass(score);
  const components = pos.componentsAtEntry || {};
  const componentsHtml = COMPONENT_ORDER.map(([key, label]) => {
    const val = components[key] ?? 0;
    return `
      <div class="score-bar" title="${key}">
        <span class="score-bar-label">${label}</span>
        <div class="score-bar-track">
          <div class="score-bar-fill ${fillColorClass(val)}" style="width:${val}%"></div>
        </div>
        <span class="score-bar-value">${val.toFixed(0)}</span>
      </div>`;
  }).join("");

  const memAdj = pos.memoryAdjustmentsAtEntry || [];
  const memRows = memAdj.length
    ? memAdj
        .sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1))
        .slice(0, 6)
        .map((m) => {
          const factorTone = m.factor >= 1.05 ? "positive" : m.factor <= 0.95 ? "negative" : "";
          return `
            <tr>
              <td class="memory-key">${m.key}</td>
              <td class="num">${m.n}</td>
              <td class="num">${(m.winRate * 100).toFixed(0)}%</td>
              <td class="num">${(m.avgPct * 100).toFixed(1)}%</td>
              <td class="num ${factorTone}">×${m.factor.toFixed(2)}</td>
            </tr>`;
        })
        .join("")
    : '<tr><td colspan="5" class="muted-cell">No memory edges contributed (no patterns with n≥3 at entry time).</td></tr>';

  const allocated = pos.allocatedCash != null ? formatCurrency(pos.allocatedCash) : "—";
  const sharesStr = pos.shares != null ? pos.shares.toFixed(4) : "—";
  const heldDays =
    pos.entryDate != null
      ? Math.max(0, Math.floor((Date.now() - Date.parse(pos.entryDate)) / 86400000))
      : "—";
  const horizonRemaining =
    pos.horizonDays != null && heldDays !== "—"
      ? Math.max(0, pos.horizonDays - heldDays)
      : "—";
  const divPenalty = pos.diversificationPenaltyAtEntry ?? 0;

  return `
    <div class="position-detail-grid">
      <div class="detail-section detail-score">
        <div class="detail-score-head">
          <div>
            <span class="detail-tag">Composite at entry</span>
            <div class="detail-score-row">
              <span class="watchlist-score-value ${scoreClass}">${score.toFixed(0)}</span>
              <span class="detail-score-meta">/ 100</span>
            </div>
          </div>
          <div class="detail-mem-mult">
            <span class="detail-tag">Memory multiplier</span>
            <strong class="mono">×${(pos.memoryMultAtEntry || 1).toFixed(2)}</strong>
          </div>
        </div>
        <div class="watchlist-components detail-components">${componentsHtml}</div>
        ${divPenalty > 0 ? `<div class="detail-penalty">Diversification penalty applied at entry: <strong class="mono negative">−${divPenalty.toFixed(0)}</strong> pts</div>` : ""}
      </div>

      <div class="detail-section detail-thesis">
        <span class="detail-tag">Thesis</span>
        <p class="detail-prose">${pos.thesis || "—"}</p>
        <div class="detail-thesis-grid">
          <div>
            <span class="detail-sublabel">Catalyst</span>
            <p>${pos.catalyst || "—"}</p>
          </div>
          <div>
            <span class="detail-sublabel">Thesis breaker</span>
            <p>${pos.thesisBreaker || "—"}</p>
          </div>
          <div>
            <span class="detail-sublabel">Pair trade</span>
            <p class="mono">${pos.pairTrade || "—"}</p>
          </div>
        </div>
      </div>

      <div class="detail-section detail-math">
        <span class="detail-tag">Position math</span>
        <table class="detail-math-table">
          <tbody>
            <tr><td>Entered</td><td class="num mono">${pos.entryDate || "—"}</td></tr>
            <tr><td>Days held</td><td class="num mono">${heldDays}</td></tr>
            <tr><td>Horizon left</td><td class="num mono">${horizonRemaining} / ${pos.horizonDays ?? "—"}d</td></tr>
            <tr><td>Allocated</td><td class="num mono">${allocated}</td></tr>
            <tr><td>Shares</td><td class="num mono">${sharesStr}</td></tr>
            <tr><td>Heat at entry</td><td class="num mono">${pos.heatAtEntry ?? "—"}</td></tr>
            <tr><td>Conviction</td><td class="num mono">${pos.conviction}/5</td></tr>
          </tbody>
        </table>
      </div>

      <div class="detail-section detail-memory">
        <span class="detail-tag">Memory edges at entry</span>
        <table class="detail-memory-table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th class="num">n</th>
              <th class="num">Win%</th>
              <th class="num">Avg P&L</th>
              <th class="num">Weight</th>
            </tr>
          </thead>
          <tbody>${memRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function scoreColorClass(score) {
  if (score >= 75) return "score-elite";
  if (score >= 60) return "score-high";
  if (score >= 45) return "score-mid";
  return "score-low";
}

function fillColorClass(score) {
  if (score >= 75) return "fill-elite";
  if (score >= 60) return "fill-high";
  if (score >= 45) return "fill-mid";
  return "fill-low";
}

function renderTraderClosed(closed) {
  const body = document.getElementById("traderClosedBody");
  body.innerHTML = "";
  if (!closed.length) {
    body.innerHTML = '<tr><td colspan="7" class="muted-cell">No closed trades yet — memory populates as positions exit.</td></tr>';
    return;
  }
  closed.forEach((t) => {
    const row = document.createElement("tr");
    const cls = t.outcome === "win" ? "positive" : "negative";
    row.innerHTML = `
      <td class="ticker-cell"><strong>${t.ticker}</strong></td>
      <td>${t.scenarioTitle || t.scenario}</td>
      <td><span class="direction-badge ${t.direction.toLowerCase()}">${t.direction}</span></td>
      <td><span class="result-pill ${cls}">${t.outcome.toUpperCase()}</span></td>
      <td class="num ${cls}">${(t.realizedPct * 100).toFixed(2)}%</td>
      <td class="num">${t.holdingDays}</td>
      <td>${t.exitReason.replace(/_/g, " ")}</td>
    `;
    body.appendChild(row);
  });
}

const COMPONENT_ORDER = [
  ["conviction", "conv"],
  ["scenario", "scen"],
  ["riskReward", "r/r"],
  ["trend", "trnd"],
  ["volRegime", "vol"],
  ["catalyst", "cat"],
  ["memory", "mem"]
];

function renderTraderWatchlist(items) {
  const node = document.getElementById("traderWatchlist");
  node.innerHTML = "";
  if (!items.length) {
    node.innerHTML = '<p class="muted-cell">Run /ai-trader to score candidates.</p>';
    return;
  }
  items.forEach((c) => {
    const card = document.createElement("article");
    card.className = `watchlist-card${c.held ? " held" : ""}`;
    const finalScore = c.finalScore ?? Math.round((c.confidence || 0) * 100);
    const scoreClass = scoreColorClass(finalScore);
    const components = c.components || {};
    const componentsHtml = COMPONENT_ORDER.map(([key, label]) => {
      const val = components[key] ?? 0;
      const fillClass = fillColorClass(val);
      return `
        <div class="score-bar" title="${key}">
          <span class="score-bar-label">${label}</span>
          <div class="score-bar-track">
            <div class="score-bar-fill ${fillClass}" style="width:${val}%"></div>
          </div>
          <span class="score-bar-value">${val.toFixed(0)}</span>
        </div>`;
    }).join("");
    const mom22 = c.momentum22d != null ? `${(c.momentum22d * 100).toFixed(1)}%` : "—";
    const vol = c.annualizedVol != null ? `${(c.annualizedVol * 100).toFixed(0)}%` : "—";
    const divPenalty = c.diversificationPenalty || 0;
    card.innerHTML = `
      <div class="watchlist-top">
        <div class="watchlist-ticker">
          <strong>${c.ticker}</strong>
          <span class="direction-badge ${c.direction.toLowerCase()}">${c.direction}</span>
          ${c.held ? '<span class="watchlist-held-flag">held</span>' : ""}
        </div>
        <div class="watchlist-meta">
          <div>${c.scenarioTitle || c.scenario} · ${c.sector}</div>
          <div class="watchlist-meta-row">
            <span class="mono">${formatCurrency(c.price)}</span>
            <span>22d ${mom22}</span>
            <span>vol ${vol}</span>
            <span>R/R ${c.rewardToRisk}x</span>
            <span>mem ×${(c.memoryMult || 1).toFixed(2)}</span>
            ${divPenalty > 0 ? `<span class="negative">−${divPenalty.toFixed(0)} div</span>` : ""}
          </div>
        </div>
        <div class="watchlist-score">
          <span class="watchlist-score-value ${scoreClass}">${finalScore.toFixed(0)}</span>
          <span class="watchlist-score-label">Score</span>
        </div>
      </div>
      <div class="watchlist-components">${componentsHtml}</div>
    `;
    node.appendChild(card);
  });
}

function renderTraderMemory(summary) {
  const top = document.getElementById("traderMemoryTop");
  const bottom = document.getElementById("traderMemoryBottom");
  top.innerHTML = "";
  bottom.innerHTML = "";

  if (!summary.top?.length) {
    top.innerHTML = '<p class="muted-cell">Need ≥3 closed trades per pattern.</p>';
  } else {
    summary.top.slice(0, 5).forEach((b) => {
      const row = document.createElement("div");
      row.className = "memory-row positive";
      row.innerHTML = `
        <span class="memory-key">${b.key}</span>
        <span class="memory-stats"><span class="positive">${(b.winRate * 100).toFixed(0)}% win</span><span>n=${b.n}</span><span class="positive">avg ${(b.avgPnlPct * 100).toFixed(1)}%</span></span>
      `;
      top.appendChild(row);
    });
  }

  const negativeOnly = (summary.bottom || []).filter((b) => b.score < 0).slice(0, 5);
  if (!negativeOnly.length) {
    bottom.innerHTML = '<p class="muted-cell">No underperforming patterns yet.</p>';
  } else {
    negativeOnly.forEach((b) => {
      const row = document.createElement("div");
      row.className = "memory-row negative";
      row.innerHTML = `
        <span class="memory-key">${b.key}</span>
        <span class="memory-stats"><span class="negative">${(b.winRate * 100).toFixed(0)}% win</span><span>n=${b.n}</span><span class="negative">avg ${(b.avgPnlPct * 100).toFixed(1)}%</span></span>
      `;
      bottom.appendChild(row);
    });
  }
}

/* ===================== events + init ===================== */

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
    state.activeFilter = chip.dataset.filter;
    if (state.payload) {
      renderTrades(state.payload.scenarios[state.activeKey].trades);
    }
  });
});

if (nodes.scenarioSelect) {
  nodes.scenarioSelect.addEventListener("change", (e) => setActiveScenario(e.target.value));
}

nodes.refreshButton.addEventListener("click", () => {
  loadData();
  loadTrader();
});

loadData();
loadTrader();

// Poll trader endpoint every 60s so P&L tracks live prices.
// Stops when tab is hidden, resumes on visibility.
let traderPollHandle = null;
function startTraderPoll() {
  if (traderPollHandle) return;
  traderPollHandle = setInterval(loadTrader, 60_000);
}
function stopTraderPoll() {
  if (traderPollHandle) {
    clearInterval(traderPollHandle);
    traderPollHandle = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopTraderPoll();
  else {
    loadTrader();
    startTraderPoll();
  }
});
if (!document.hidden) startTraderPoll();

/* ===================== page nav ===================== */

const PAGE_IDS = ["pageDashboard", "pageTrader"];

function switchPage(pageId) {
  const targetId = PAGE_IDS.includes(pageId) ? pageId : PAGE_IDS[0];
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("page-active"));
  document.querySelectorAll(".page-nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === targetId);
  });
  document.getElementById(targetId).classList.add("page-active");
  history.replaceState(null, "", `#${targetId}`);
  window.scrollTo(0, 0);
  if (targetId === "pageTrader") {
    // Re-render trader charts now that canvases have layout dimensions.
    loadTrader();
  }
}

document.querySelectorAll(".page-nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchPage(btn.dataset.page));
});

// Initialize from URL hash, default to dashboard.
switchPage(location.hash.replace("#", "") || "pageDashboard");
