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
  nodes.refreshButton.textContent = loading ? "Refreshing..." : "Refresh Live Update";
  nodes.statusText.textContent = loading ? "Pulling headlines and quotes" : "Live scenario feed active";
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
});

loadData();
