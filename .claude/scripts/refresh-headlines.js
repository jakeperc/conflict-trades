#!/usr/bin/env node
/**
 * Refresh headline-derived heatBase for one or all scenarios.
 * Usage: node refresh-headlines.js [scenarioKey]
 * If scenarioKey is omitted, processes all scenarios.
 *
 * Pulls Google News for each scenario's queries, scores keyword hits over the
 * last 14 days, then adjusts heatBase up to +/-10 from current toward the
 * keyword-hit signal. Updates data/config.json.
 */
const path = require("path");
const fs = require("fs");
const { fetchGoogleNews, dedupeHeadlines } = require(path.join(__dirname, "..", "..", "lib", "news"));
const { loadConfig, updateScenarioField } = require(path.join(__dirname, "..", "..", "lib", "config"));

const SCENARIO_KEYWORDS = {
  iran: [
    ["hormuz", 6], ["strait", 3], ["yemen", 4], ["houthi", 4], ["iran", 3],
    ["tanker", 4], ["shipping", 2], ["oil", 2], ["crude", 3], ["missile", 2],
    ["centcom", 4], ["mine", 3], ["blockade", 5], ["seize", 3], ["aramco", 3]
  ],
  taiwan: [
    ["taiwan", 5], ["strait", 3], ["pla", 4], ["adiz", 5], ["semiconductor", 4],
    ["chip", 2], ["tsmc", 4], ["xi", 2], ["blockade", 5], ["drill", 3],
    ["warship", 3], ["incursion", 4], ["beijing", 1], ["pacific", 1]
  ],
  europe: [
    ["nato", 4], ["russia", 3], ["ukraine", 3], ["drone", 3], ["missile", 2],
    ["baltic", 3], ["lng", 4], ["gas", 2], ["sanction", 3], ["air defense", 4],
    ["putin", 2], ["intercept", 3], ["rearmament", 4]
  ],
  korea: [
    ["dprk", 5], ["north korea", 5], ["pyongyang", 5], ["kim jong un", 5],
    ["missile", 4], ["launch", 4], ["icbm", 5], ["yellow sea", 4], ["thaad", 3],
    ["samsung", 2], ["hynix", 3], ["seoul", 2], ["provocation", 3]
  ]
};

function scoreHeadlines(headlines, scenarioKey) {
  const weights = SCENARIO_KEYWORDS[scenarioKey] || [];
  return headlines.reduce((score, item) => {
    const text = `${item.title} ${item.description || ""} ${item.link}`.toLowerCase();
    return (
      score +
      weights.reduce(
        (sum, [keyword, weight]) => sum + (text.includes(keyword) ? weight : 0),
        0
      )
    );
  }, 0);
}

async function refreshOne(scenarioKey, scenarioConfig) {
  const queries = [scenarioConfig.query, ...(scenarioConfig.newsFallbackQueries || [])];
  let allHeadlines = [];
  for (const query of queries) {
    if (allHeadlines.length >= 30) break;
    const headlines = await fetchGoogleNews(query, 14, 15).catch(() => []);
    allHeadlines = dedupeHeadlines([...allHeadlines, ...headlines]);
  }

  const oldHeatBase = scenarioConfig.heatBase;
  const score = scoreHeadlines(allHeadlines, scenarioKey);

  // Map score to a target heatBase. Empirical bands:
  // score >= 50 -> target 88; 30-50 -> 78; 15-30 -> 68; 5-15 -> 58; <5 -> 48
  let targetHeatBase;
  if (score >= 50) targetHeatBase = 88;
  else if (score >= 30) targetHeatBase = 78;
  else if (score >= 15) targetHeatBase = 68;
  else if (score >= 5) targetHeatBase = 58;
  else targetHeatBase = 48;

  // Clamp adjustment to +/-10 from current to avoid wild swings
  const maxDelta = 10;
  const delta = Math.max(-maxDelta, Math.min(maxDelta, targetHeatBase - oldHeatBase));
  const newHeatBase = oldHeatBase + delta;

  updateScenarioField(scenarioKey, "heatBase", newHeatBase);

  // Cache headlines for downstream commands
  const cacheDir = path.join(__dirname, "..", "..", "data", "cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, `headlines-${scenarioKey}.json`),
    JSON.stringify({ scenarioKey, fetchedAt: new Date().toISOString(), score, headlines: allHeadlines }, null, 2)
  );

  return {
    scenarioKey,
    oldHeatBase,
    newHeatBase,
    delta,
    keywordScore: score,
    headlineCount: allHeadlines.length,
    topHeadlines: allHeadlines.slice(0, 5).map((h) => h.title)
  };
}

async function main() {
  const requestedKey = process.argv[2];
  const { scenarios } = loadConfig();
  const keys = requestedKey ? [requestedKey] : Object.keys(scenarios);
  const results = [];

  for (const key of keys) {
    if (!scenarios[key]) {
      results.push({ scenarioKey: key, error: "Unknown scenario" });
      continue;
    }
    try {
      results.push(await refreshOne(key, scenarios[key]));
    } catch (error) {
      results.push({ scenarioKey: key, error: error.message });
    }
  }

  console.log(JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
