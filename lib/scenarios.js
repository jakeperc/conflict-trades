const { HEADLINE_LIMIT, dedupeHeadlines, fetchGoogleNews } = require("./news");
const { fetchQuoteHistory, computeVolatility } = require("./quotes");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildTrade(trade, price, annualizedVol, scenarioHeat) {
  const convictionBoost = trade.conviction * 0.0175;
  const heatBoost = scenarioHeat / 900;
  const volBoost = annualizedVol * 0.28;
  const rawUpside = 0.04 + convictionBoost + heatBoost + volBoost;
  const rawDownside = 0.025 + trade.conviction * 0.01 + annualizedVol * 0.12;

  const upsidePct = clamp(rawUpside, 0.06, 0.28);
  const downsidePct = clamp(rawDownside, 0.04, 0.16);

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

  const keywordHits = headlines.reduce((score, item) => {
    const text = `${item.title} ${item.link}`.toLowerCase();
    const weights = [
      ["strait", 2],
      ["hormuz", 3],
      ["yemen", 2],
      ["taiwan", 3],
      ["nato", 2],
      ["russia", 2],
      ["missile", 1],
      ["drill", 1],
      ["shipping", 2],
      ["energy", 1],
      ["dprk", 2],
      ["korea", 1],
      ["pyongyang", 2]
    ];
    return (
      score +
      weights.reduce(
        (sum, [keyword, weight]) => sum + (text.includes(keyword) ? weight : 0),
        0
      )
    );
  }, 0);

  const liveHeat = clamp(config.heatBase + keywordHits, 35, 96);
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
      priceSource: "Live quote"
    };
  });

  return {
    key: config.key,
    title: config.title,
    subtitle: config.subtitle,
    color: config.color,
    summary: config.summary,
    heat: liveHeat,
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

  return {
    generatedAt: new Date().toISOString(),
    appVersion: "2026-05-current-automated",
    disclaimer:
      "Scenario dashboard only. Not personalized investment advice. Use as a research workflow and validate every trade independently.",
    methodology:
      "Upside and downside are scenario-based risk bands derived from conviction score, live headline heat, and trailing realized volatility from recent Stooq or Yahoo Finance price history.",
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
