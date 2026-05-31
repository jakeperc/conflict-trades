/**
 * EIA Weekly Petroleum Status Report integration.
 * Free API key required: https://www.eia.gov/opendata/
 * Set EIA_API_KEY env var before use.
 *
 * Key series:
 *   WCRSTUS1  — U.S. Crude Oil Ending Stocks (thousand barrels)
 *   WCSSTUS1  — Cushing, OK Crude Oil Ending Stocks
 *   WGTSTUS1  — U.S. Motor Gasoline Ending Stocks
 */
const path = require("path");
const fs = require("fs");
const { fetchJson } = require("./fetcher");
const { loadConfig, updateScenarioField } = require("./config");

const ROOT = path.join(__dirname, "..");
const FLOWS_DIR = path.join(ROOT, "data", "flows");

// Published each Wednesday 10:30 AM ET. Positive = draw (bullish), negative = build (bearish).
const SERIES = {
  crude:    "WCRSTUS1",
  cushing:  "WCSSTUS1",
  gasoline: "WGTSTUS1"
};

// Heat delta thresholds — draw/build vs 5yr avg in million barrels
const HEAT_RULES = [
  { threshold: 3,  delta: +4, label: "large draw vs 5yr avg — bullish supply squeeze" },
  { threshold: 1,  delta: +2, label: "moderate draw vs 5yr avg — mildly bullish" },
  { threshold: -1, delta: -2, label: "moderate build vs 5yr avg — mildly bearish" },
  { threshold: -3, delta: -4, label: "large build vs 5yr avg — bearish oversupply" }
];

async function fetchEiaSeries(seriesId, apiKey, length = 270) {
  const url =
    `https://api.eia.gov/v2/petroleum/sum/sndw/data/` +
    `?api_key=${apiKey}` +
    `&frequency=weekly` +
    `&data[]=value` +
    `&facets[series][]=${seriesId}` +
    `&sort[0][column]=period` +
    `&sort[0][direction]=desc` +
    `&length=${length}`;
  const json = await fetchJson(url);
  if (!json?.response?.data) throw new Error(`EIA API error for ${seriesId}: ${JSON.stringify(json?.error || json)}`);
  return json.response.data.map((d) => ({ period: d.period, value: parseFloat(d.value) }));
}

// Get week-of-year (1–53) from YYYY-MM-DD
function weekOfYear(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7);
}

// Compute draw/build surprise: current week change vs 5-year average change for that week
function computeSurprise(series) {
  if (series.length < 2) return null;
  const latest = series[0];
  const prior  = series[1];
  const weekChange = latest.value - prior.value; // positive = draw (stocks fell)

  // Find same week-of-year in prior years (skip most recent year)
  const targetWeek = weekOfYear(latest.period);
  const historical = series.slice(2).filter((d) => weekOfYear(d.period) === targetWeek);
  if (historical.length < 4) return { weekChange, fiveYearAvg: null, surprise: null };

  // Pair up consecutive same-week entries to get YoY changes
  const changes = [];
  for (let i = 0; i < historical.length - 1; i++) {
    // Each entry is the week's stock level; we want change vs prior week for that year
    // Use the change between the two successive weekly readings closest to that week
    const idx = series.findIndex((d) => d.period === historical[i].period);
    if (idx + 1 < series.length) {
      changes.push(series[idx].value - series[idx + 1].value);
    }
  }
  const fiveYearAvg = changes.slice(0, 5).reduce((s, v) => s + v, 0) / Math.min(changes.length, 5);
  const surpriseMb = (weekChange - fiveYearAvg) / 1000; // convert thousands → millions of barrels
  return { weekChange, fiveYearAvg, surpriseMb, latestStocks: latest.value, period: latest.period };
}

function heatAdjustmentForSurprise(surpriseMb) {
  if (surpriseMb === null) return 0;
  for (const rule of HEAT_RULES) {
    if (surpriseMb >= rule.threshold) return rule.delta;
    if (surpriseMb <= -rule.threshold) return -rule.delta;
  }
  return 0;
}

async function runEiaReport({ apiKey, scenarioKey = "iran", dryRun = false } = {}) {
  apiKey = apiKey || process.env.EIA_API_KEY;
  if (!apiKey) {
    return {
      error: "EIA_API_KEY not set",
      hint: "Register free at https://www.eia.gov/opendata/ then set EIA_API_KEY env var"
    };
  }

  const results = {};
  const errors = [];

  for (const [name, seriesId] of Object.entries(SERIES)) {
    try {
      const data = await fetchEiaSeries(seriesId, apiKey, 270);
      results[name] = computeSurprise(data);
    } catch (e) {
      errors.push({ series: name, error: e.message });
    }
  }

  const crude = results.crude;
  const heatDelta = crude?.surpriseMb != null ? heatAdjustmentForSurprise(crude.surpriseMb) : 0;
  const rule = HEAT_RULES.find((r) =>
    crude?.surpriseMb != null &&
    (crude.surpriseMb >= r.threshold || crude.surpriseMb <= -r.threshold)
  );

  let oldHeatBase = null;
  let newHeatBase = null;
  if (!dryRun && heatDelta !== 0) {
    const config = loadConfig();
    const scenario = config.scenarios[scenarioKey];
    if (scenario) {
      oldHeatBase = scenario.heatBase;
      newHeatBase = Math.max(50, Math.min(100, oldHeatBase + heatDelta));
      updateScenarioField(scenarioKey, "heatBase", newHeatBase);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const flow = {
    topic: "eia-report",
    scenarioKey,
    fetchedAt: new Date().toISOString(),
    crude: crude || null,
    cushing: results.cushing || null,
    gasoline: results.gasoline || null,
    heatDelta,
    heatRuleApplied: rule?.label || "no significant deviation",
    oldHeatBase,
    newHeatBase,
    errors
  };

  fs.mkdirSync(FLOWS_DIR, { recursive: true });
  fs.writeFileSync(path.join(FLOWS_DIR, `eia-report-${stamp}.json`), JSON.stringify(flow, null, 2));

  return flow;
}

module.exports = { runEiaReport };
