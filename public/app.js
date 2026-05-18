const state = {
  payload: null,
  activeKey: "iran",
  activeFilter: "all",
  loading: false,
  previousPayload: loadPreviousPayload()
};

const nodes = {
  statusText: document.getElementById("statusText"),
  lastRefresh: document.getElementById("lastRefresh"),
  buildVersion: document.getElementById("buildVersion"),
  topPairTrade: document.getElementById("topPairTrade"),
  changeList: document.getElementById("changeList"),
  refreshButton: document.getElementById("refreshButton"),
  overviewGrid: document.getElementById("overviewGrid"),
  tabStrip: document.getElementById("tabStrip"),
  scenarioTitle: document.getElementById("scenarioTitle"),
  scenarioSubtitle: document.getElementById("scenarioSubtitle"),
  scenarioSummary: document.getElementById("scenarioSummary"),
  heatValue: document.getElementById("heatValue"),
  heatBar: document.getElementById("heatBar"),
  subScoreGrid: document.getElementById("subScoreGrid"),
  indicatorGrid: document.getElementById("indicatorGrid"),
  effectsList: document.getElementById("effectsList"),
  tradeTableBody: document.getElementById("tradeTableBody"),
  headlineList: document.getElementById("headlineList"),
  methodologyText: document.getElementById("methodologyText"),
  disclaimerText: document.getElementById("disclaimerText"),
  tradeRowTemplate: document.getElementById("tradeRowTemplate")
};

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

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function formatPct(value) {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(value, unit = "") {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value}${unit}`;
}

function formatTime(value) {
  if (!value) {
    return "Waiting";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatPostedAt(value) {
  if (!value) {
    return "No timestamp available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No timestamp available";
  }

  return `Posted ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date)}`;
}

function setLoading(loading) {
  state.loading = loading;
  nodes.refreshButton.disabled = loading;
  nodes.refreshButton.textContent = loading ? "Refreshing…" : "Refresh";
  nodes.statusText.textContent = loading ? "Pulling live data" : "Live";
}

async function loadData() {
  setLoading(true);

  try {
    const response = await fetch("/api/refresh", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    state.previousPayload = state.payload || state.previousPayload;
    state.payload = payload;
    savePayload(payload);
    nodes.lastRefresh.textContent = formatTime(payload.generatedAt);
    nodes.methodologyText.textContent = payload.methodology;
    nodes.disclaimerText.textContent = payload.disclaimer;
    nodes.buildVersion.textContent = payload.appVersion || "Live";
    renderOverview();
    renderTabs();
    renderScenario();
    renderChanges();
  } catch (error) {
    nodes.statusText.textContent = "Refresh failed";
    nodes.lastRefresh.textContent = error.message;
  } finally {
    setLoading(false);
  }
}

function renderOverview() {
  const scenarios = Object.values(state.payload.scenarios);
  nodes.overviewGrid.innerHTML = "";

  scenarios.forEach((scenario) => {
    const card = document.createElement("article");
    card.className = "overview-card";
    const strongest = [...scenario.subScores].sort((a, b) => b.value - a.value)[0];
    const latestHeadline = scenario.headlines?.[0];
    const latestPostedAt = latestHeadline?.publishedAt
      ? formatPostedAt(latestHeadline.publishedAt).replace("Posted", "Latest headline")
      : `Refreshed ${formatTime(scenario.refreshedAt || state.payload.generatedAt)}`;

    card.innerHTML = `
      <div class="scenario-kicker">
        <span>${scenario.title}</span>
        <span class="heat-pill">Heat ${scenario.heat}</span>
      </div>
      <h3>${scenario.subtitle}</h3>
      <p class="overview-timestamp">${latestPostedAt}</p>
      <p class="scenario-summary">${scenario.summary}</p>
      <div class="overview-footer">
        <span>${strongest.label}</span>
        <strong>${strongest.value}/100</strong>
      </div>
    `;
    nodes.overviewGrid.appendChild(card);
  });
}

function renderTabs() {
  const scenarios = Object.values(state.payload.scenarios);
  nodes.tabStrip.innerHTML = "";

  scenarios.forEach((scenario) => {
    const button = document.createElement("button");
    button.className = `tab-button${scenario.key === state.activeKey ? " active" : ""}`;
    button.textContent = scenario.title;
    button.addEventListener("click", () => {
      state.activeKey = scenario.key;
      renderTabs();
      renderScenario();
      renderChanges();
    });
    nodes.tabStrip.appendChild(button);
  });
}

function renderScenario() {
  const scenario = state.payload.scenarios[state.activeKey];
  if (!scenario) {
    return;
  }

  nodes.scenarioTitle.textContent = scenario.title;
  nodes.scenarioSubtitle.textContent = scenario.subtitle;
  nodes.scenarioSummary.textContent = scenario.summary;
  nodes.heatValue.textContent = String(scenario.heat);
  nodes.heatBar.style.width = `${scenario.heat}%`;
  nodes.topPairTrade.textContent = scenario.topPairTrade || "No pair trade";

  renderSubScores(scenario.subScores);
  renderIndicators(scenario.indicators);
  renderEffects(scenario.secondOrderEffects);
  renderTrades(scenario.trades);
  renderHeadlines(scenario.headlines);
}

function renderSubScores(subScores) {
  nodes.subScoreGrid.innerHTML = "";
  subScores.forEach((item) => {
    const card = document.createElement("div");
    card.className = "subscore-card";
    card.innerHTML = `
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    `;
    nodes.subScoreGrid.appendChild(card);
  });
}

function renderIndicators(indicators) {
  nodes.indicatorGrid.innerHTML = "";
  indicators.forEach((item) => {
    const card = document.createElement("div");
    card.className = "indicator-card";
    card.innerHTML = `
      <span class="indicator-label">${item.label}</span>
      <strong>${item.value}${item.unit ? ` ${item.unit}` : ""}</strong>
      <span class="indicator-delta ${item.tone === "up" ? "positive" : "negative"}">${formatDelta(item.delta, item.unit === "%" ? "%" : "")}</span>
    `;
    nodes.indicatorGrid.appendChild(card);
  });
}

function renderEffects(effects) {
  nodes.effectsList.innerHTML = "";
  effects.forEach((effect) => {
    const item = document.createElement("div");
    item.className = "effect-item";
    item.textContent = effect;
    nodes.effectsList.appendChild(item);
  });
}

function getFilteredTrades(trades) {
  if (state.activeFilter === "all") {
    return trades;
  }

  return trades.filter((trade) => {
    if (state.activeFilter === "LONG" || state.activeFilter === "SHORT") {
      return trade.direction === state.activeFilter;
    }

    return (trade.sector || "").toLowerCase().includes(state.activeFilter.toLowerCase());
  });
}

function renderTrades(trades) {
  nodes.tradeTableBody.innerHTML = "";
  const filteredTrades = getFilteredTrades(trades);

  filteredTrades.forEach((trade) => {
    const fragment = nodes.tradeRowTemplate.content.cloneNode(true);
    fragment.querySelector(".ticker").textContent = trade.ticker;
    fragment.querySelector(".thesis").textContent = trade.thesis;
    fragment.querySelector(".sector").textContent = trade.sector || "General";

    const directionNode = fragment.querySelector(".direction");
    directionNode.innerHTML = `<span class="direction-badge ${trade.direction.toLowerCase()}">${trade.direction}</span>`;

    const priceNode = fragment.querySelector(".price");
    priceNode.innerHTML =
      trade.priceSource && trade.price != null
        ? `${formatCurrency(trade.price)}<div class="cell-meta">${trade.priceSource}</div>`
        : formatCurrency(trade.price);

    const upsideNode = fragment.querySelector(".upside");
    upsideNode.textContent = formatPct(trade.upsidePct);
    upsideNode.classList.add("positive");

    const downsideNode = fragment.querySelector(".downside");
    downsideNode.textContent = formatPct(trade.downsidePct);
    downsideNode.classList.add("negative");

    fragment.querySelector(".horizon").textContent = trade.horizon || "Tactical";
    const pairTradeNode = fragment.querySelector(".pairTrade");
    pairTradeNode.innerHTML = `${trade.pairTrade || "N/A"}<div class="cell-meta">${trade.riskLevel || "Risk not set"}</div>`;
    fragment.querySelector(".target").textContent = formatCurrency(trade.targetPrice);
    fragment.querySelector(".stop").textContent = formatCurrency(trade.stopPrice);
    fragment.querySelector(".rr").textContent = trade.rewardToRisk == null ? "N/A" : `${trade.rewardToRisk}x`;

    const row = fragment.querySelector("tr");
    row.classList.add("trade-row");
    row.title = `Catalyst: ${trade.catalyst} | Breaker: ${trade.thesisBreaker}`;
    nodes.tradeTableBody.appendChild(fragment);
  });
}

function renderHeadlines(headlines) {
  nodes.headlineList.innerHTML = "";

  if (!headlines || !headlines.length) {
    nodes.headlineList.innerHTML = '<div class="headline-item">No recent headlines were returned for this refresh window.</div>';
    return;
  }

  headlines.forEach((headline, index) => {
    const article = document.createElement("article");
    article.className = "headline-item";
    article.innerHTML = `
      <div class="headline-rank">Signal ${index + 1}</div>
      <a href="${headline.link}" target="_blank" rel="noreferrer">${headline.title}</a>
      <div class="headline-meta">${formatPostedAt(headline.publishedAt)}</div>
    `;
    nodes.headlineList.appendChild(article);
  });
}

function renderChanges() {
  nodes.changeList.innerHTML = "";
  const current = state.payload?.scenarios?.[state.activeKey];
  const previous = state.previousPayload?.scenarios?.[state.activeKey];

  const items = [];
  if (!current) {
    return;
  }

  if (!previous) {
    items.push("First captured snapshot for this scenario.");
  } else {
    const heatDelta = current.heat - previous.heat;
    items.push(`Heat ${heatDelta >= 0 ? "up" : "down"} ${Math.abs(heatDelta)} points.`);

    const currentTopHeadline = current.headlines?.[0]?.title;
    const previousTopHeadline = previous.headlines?.[0]?.title;
    if (currentTopHeadline && currentTopHeadline !== previousTopHeadline) {
      items.push("Top headline rotated on this refresh.");
    }

    const currentTopTrade = current.trades?.[0];
    const previousTopTrade = previous.trades?.[0];
    if (currentTopTrade && previousTopTrade && currentTopTrade.targetPrice !== previousTopTrade.targetPrice) {
      items.push(`${currentTopTrade.ticker} target changed to ${formatCurrency(currentTopTrade.targetPrice)}.`);
    }
  }

  items.slice(0, 3).forEach((item) => {
    const line = document.createElement("div");
    line.className = "change-item";
    line.textContent = item;
    nodes.changeList.appendChild(line);
  });
}

async function loadTrader() {
  try {
    const response = await fetch("/api/trader", { cache: "no-store" });
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

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
    state.activeFilter = chip.dataset.filter;
    if (state.payload) {
      renderScenario();
    }
  });
});

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
