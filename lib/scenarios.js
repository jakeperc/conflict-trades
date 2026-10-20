const { HEADLINE_LIMIT, dedupeHeadlines, fetchGoogleNews } = require("./news");
const { fetchQuoteHistory, computeVolatility } = require("./quotes");
const { readHeatHistory } = require("./history");
const { loadWw3Signals } = require("./ww3");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Shared keyword weights — used both for the aggregate heat-density tilt and
// for a per-headline relevance score (1-5) surfaced in the UI.
const HEADLINE_WEIGHTS = [
  ["strait", 2], ["hormuz", 3], ["yemen", 2], ["taiwan", 3], ["nato", 2],
  ["russia", 2], ["missile", 1], ["drill", 1], ["shipping", 2], ["energy", 1],
  ["dprk", 2], ["korea", 1], ["pyongyang", 2]
];

function scoreHeadline(item) {
  const text = `${item.title} ${item.link}`.toLowerCase();
  return HEADLINE_WEIGHTS.reduce((sum, [keyword, weight]) => sum + (text.includes(keyword) ? weight : 0), 0);
}

function headlineRelevance(item) {
  return clamp(1 + Math.round(scoreHeadline(item) / 2), 1, 5);
}

function buildTrade(trade, price, annualizedVol, scenarioHeat) {
  // sqrt(vol) compresses the high end so vol doesn't dominate; cap raised
  // to 0.40 so only true extremes saturate (previously 73% of trades clamped
  // to the 0.28 ceiling, killing the column's signal value).
  const convictionBoost = trade.conviction * 0.022;
  const heatBoost = scenarioHeat / 1100;
  const volBoost = Math.sqrt(annualizedVol) * 0.16;
  const rawUpside = 0.03 + convictionBoost + heatBoost + volBoost;
  const rawDownside =
    0.02 + trade.conviction * 0.009 + Math.sqrt(annualizedVol) * 0.13;

  const upsidePct = clamp(rawUpside, 0.07, 0.40);
  const downsidePct = clamp(rawDownside, 0.04, 0.18);

  const targetPrice =
    trade.direction === "LONG"
      ? price * (1 + upsidePct)
      : price * (1 - upsidePct);
  const stopPrice =
    trade.direction === "LONG"
      ? price * (1 - downsidePct)
      : price * (1 + downsidePct);

  return {
    ...trade,
    price,
    annualizedVol,
    upsidePct,
    downsidePct,
    targetPrice,
    stopPrice,
    rewardToRisk: Number((upsidePct / downsidePct).toFixed(2))
  };
}

function computeSubScores(config, headlines, liveHeat) {
  const text = headlines.map((item) => `${item.title} ${item.link}`.toLowerCase()).join(" ");
  const has = (keyword) => (text.includes(keyword) ? 1 : 0);

  if (config.key === "iran") {
    return [
      { label: "Military escalation", value: clamp(Math.round(liveHeat + has("missile") * 6 + has("iran") * 4), 35, 98) },
      { label: "Shipping disruption", value: clamp(Math.round(liveHeat + has("shipping") * 8 + has("hormuz") * 10 + has("mandeb") * 8), 35, 98) },
      { label: "Energy shock", value: clamp(Math.round(liveHeat + has("oil") * 7 + has("energy") * 6), 35, 98) },
      { label: "Defense demand", value: clamp(Math.round(liveHeat - 6 + has("missile") * 8), 30, 95) }
    ];
  }

  if (config.key === "taiwan") {
    return [
      { label: "Military escalation", value: clamp(Math.round(liveHeat + has("drill") * 8 + has("warship") * 7), 35, 98) },
      { label: "Semiconductor disruption", value: clamp(Math.round(liveHeat + has("semiconductor") * 10 + has("chip") * 8), 35, 98) },
      { label: "Shipping disruption", value: clamp(Math.round(liveHeat + has("strait") * 9 + has("shipping") * 6), 35, 98) },
      { label: "Onshoring tailwind", value: clamp(Math.round(liveHeat - 4 + has("supply chain") * 8), 30, 95) }
    ];
  }

  if (config.key === "korea") {
    return [
      { label: "DPRK provocation", value: clamp(Math.round(liveHeat + has("missile") * 8 + has("launch") * 7 + has("dprk") * 5), 35, 98) },
      { label: "Semiconductor knock-on", value: clamp(Math.round(liveHeat + has("samsung") * 8 + has("hynix") * 8 + has("chip") * 5), 35, 98) },
      { label: "Allied posture", value: clamp(Math.round(liveHeat + has("us") * 4 + has("japan") * 4 + has("alliance") * 6), 35, 98) },
      { label: "Currency / capital stress", value: clamp(Math.round(liveHeat - 4 + has("won") * 6 + has("krw") * 6), 30, 95) }
    ];
  }

  return [
    { label: "Military escalation", value: clamp(Math.round(liveHeat + has("nato") * 8 + has("russia") * 8), 35, 98) },
    { label: "Gas / power stress", value: clamp(Math.round(liveHeat + has("lng") * 9 + has("gas") * 8), 35, 98) },
    { label: "Defense replenishment", value: clamp(Math.round(liveHeat + has("missile") * 6 + has("defense") * 6), 35, 98) },
    { label: "Travel drag", value: clamp(Math.round(liveHeat - 3 + has("travel") * 8), 30, 95) }
  ];
}

function computeIndicators(config, liveHeat, subScores) {
  const averageScore =
    subScores.reduce((sum, item) => sum + item.value, 0) / Math.max(subScores.length, 1);

  return (config.indicatorBlueprints || []).map((item) => {
    const delta = Number((((averageScore - 50) / 10) * item.sensitivity).toFixed(1));
    const value = item.unit === "%"
      ? Number((item.base + delta).toFixed(1))
      : Number((item.base + delta).toFixed(1));
    return {
      label: item.label,
      value,
      unit: item.unit,
      delta,
      tone: delta >= 0 ? "up" : "down"
    };
  });
}

async function buildScenario(config, fallbackQuotes) {
  let headlines = await fetchGoogleNews(config.query, 14, HEADLINE_LIMIT).catch(() => []);
  const fallbackQueries = Array.isArray(config.newsFallbackQueries)
    ? config.newsFallbackQueries
    : config.newsFallbackQuery
      ? [config.newsFallbackQuery]
      : [];

  for (const query of fallbackQueries) {
    if (headlines.length >= HEADLINE_LIMIT) {
      break;
    }

    const fallbackHeadlines = await fetchGoogleNews(query, 14, HEADLINE_LIMIT).catch(() => []);
    headlines = dedupeHeadlines([...headlines, ...fallbackHeadlines])
      .sort((left, right) => (Date.parse(right.publishedAt) || 0) - (Date.parse(left.publishedAt) || 0))
      .slice(0, HEADLINE_LIMIT);
  }

  const keywordHits = headlines.reduce((score, item) => score + scoreHeadline(item), 0);
  // Annotate each headline with a 1-5 relevance pip for the UI (purely additive).
  headlines = headlines.map((item) => ({ ...item, relevance: headlineRelevance(item) }));

  // heatBase already reflects keyword density from refresh-headlines.
  // Live tilt is a small intraday adjustment so a fresh headline batch
  // can nudge heat up or down a few points without saturating the cap.
  // density 4 (neutral) → 0 tilt; density 7+ → +5; density <2 → -3.
  const density = headlines.length > 0 ? keywordHits / headlines.length : 0;
  const liveTilt = Math.round(Math.max(-3, Math.min(5, (density - 4) * 1.2)));
  // ww3Tilt blends in the sibling ww3-dash-v2 conflict monitor (0 if absent/stale).
  const ww3 = loadWw3Signals();
  const ww3Info = ww3.available ? ww3.tilts[config.key] || null : null;
  const ww3Tilt = ww3Info ? ww3Info.tilt : 0;
  const liveHeat = clamp(config.heatBase + liveTilt + ww3Tilt, 35, 96);
  const subScores = computeSubScores(config, headlines, liveHeat);
  const indicators = computeIndicators(config, liveHeat, subScores);

  const quoteMap = {};
  await Promise.all(
    config.trades.map(async (trade) => {
      try {
        const history = await fetchQuoteHistory(trade.ticker);
        const latest = history[history.length - 1];
        const closes = history.map((row) => row.close);
        const ma22 =
          closes.length >= 22
            ? closes.slice(-22).reduce((a, b) => a + b, 0) / 22
            : null;
        const ma50 =
          closes.length >= 50
            ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50
            : null;
        const close5dAgo = closes[closes.length - 6] ?? null;
        const close22dAgo = closes[closes.length - 23] ?? null;
        quoteMap[trade.ticker] = {
          price: latest.close,
          annualizedVol: computeVolatility(history),
          lastDate: latest.date,
          series: closes.slice(-40),
          ma22,
          ma50,
          pctVsMa22: ma22 ? (latest.close - ma22) / ma22 : null,
          pctVsMa50: ma50 ? (latest.close - ma50) / ma50 : null,
          momentum5d: close5dAgo ? (latest.close - close5dAgo) / close5dAgo : null,
          momentum22d: close22dAgo ? (latest.close - close22dAgo) / close22dAgo : null
        };
      } catch (error) {
        quoteMap[trade.ticker] = {
          price: null,
          annualizedVol: 0.2,
          lastDate: null,
          error: error.message
        };
      }
    })
  );

  const trades = config.trades.map((trade) => {
    const quote = quoteMap[trade.ticker];
    if (!quote || !quote.price) {
      const fallback = fallbackQuotes[trade.ticker];
      if (fallback) {
        return {
          ...buildTrade(
            trade,
            fallback.price,
            fallback.annualizedVol,
            liveHeat
          ),
          priceSource: "Fallback baseline",
          quoteError: quote?.error || "Live quote unavailable"
        };
      }

      return {
        ...trade,
        price: null,
        annualizedVol: quote?.annualizedVol || 0.2,
        upsidePct: null,
        downsidePct: null,
        targetPrice: null,
        stopPrice: null,
        rewardToRisk: null,
        quoteError: quote?.error || "Quote unavailable"
      };
    }

    return {
      ...buildTrade(trade, quote.price, quote.annualizedVol, liveHeat),
      lastQuoteDate: quote.lastDate,
      pctVsMa22: quote.pctVsMa22,
      pctVsMa50: quote.pctVsMa50,
      momentum5d: quote.momentum5d,
      momentum22d: quote.momentum22d,
      ma22: quote.ma22,
      ma50: quote.ma50,
      priceSeries: quote.series,
      priceSource: "Live quote"
    };
  });

  return {
    key: config.key,
    title: config.title,
    subtitle: config.subtitle,
    color: config.color,
    geo: config.geo || null,
    summary: config.summary,
    heat: liveHeat,
    ww3Tilt,
    ww3Signal: ww3Info,
    subScores,
    indicators,
    secondOrderEffects: config.secondOrderEffects || [],
    topPairTrade: config.trades[0]?.pairTrade || null,
    refreshedAt: new Date().toISOString(),
    headlines,
    trades
  };
}

async function buildPayload(scenarioConfig, fallbackQuotes) {
  const scenarios = {};
  const entries = await Promise.all(
    Object.values(scenarioConfig).map(async (config) => [config.key, await buildScenario(config, fallbackQuotes)])
  );

  entries.forEach(([key, scenario]) => {
    scenarios[key] = scenario;
  });

  // Attach a per-scenario heat trend from saved snapshots, anchored with the
  // current live heat as the final point (so the sparkline always has a "now").
  const heatHistory = readHeatHistory(Object.keys(scenarios));
  const nowStamp = new Date().toISOString().slice(0, 16);
  Object.values(scenarios).forEach((scenario) => {
    const prior = heatHistory[scenario.key] || [];
    scenario.heatHistory = [...prior, { t: nowStamp, heat: scenario.heat }];
  });

  return {
    generatedAt: new Date().toISOString(),
    appVersion: "2026-05-current-automated",
    disclaimer:
      "Scenario dashboard only. Not personalized investment advice. Use as a research workflow and validate every trade independently.",
    methodology:
      "Upside and downside are scenario-based risk bands derived from conviction score, live headline heat, and sqrt-compressed trailing realized volatility from recent Stooq or Yahoo Finance price history. Vol is sqrt-scaled so high-vol tickers do not saturate the ceiling.",
    scenarios
  };
}

module.exports = {
  clamp,
  buildTrade,
  computeSubScores,
  computeIndicators,
  buildScenario,
  buildPayload
};
