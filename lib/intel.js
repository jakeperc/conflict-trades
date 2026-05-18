const path = require("path");
const fs = require("fs");
const { fetchGoogleNews, fetchRssFeed, dedupeHeadlines } = require("./news");
const { loadConfig, updateScenarioField } = require("./config");

function scoreText(text, weights) {
  const lower = text.toLowerCase();
  return weights.reduce((sum, [keyword, weight]) => {
    return sum + (lower.includes(keyword.toLowerCase()) ? weight : 0);
  }, 0);
}

function targetHeatFromScore(score, bands) {
  // bands is { high: [scoreThreshold, heatTarget], mid: [...], low: [...], baseline: heatTarget }
  if (score >= bands.high[0]) return bands.high[1];
  if (score >= bands.mid[0]) return bands.mid[1];
  if (score >= bands.low[0]) return bands.low[1];
  return bands.baseline;
}

async function runIntel({ topic, scenarioKey, queries = [], rssFeeds = [], weights = [], bands, maxHeatDelta = 5 }) {
  const allItems = [];

  for (const query of queries) {
    try {
      const items = await fetchGoogleNews(query, 14, 15);
      allItems.push(...items.map((i) => ({ ...i, source: "google-news", query })));
    } catch {
      // Skip on failure, intel commands must be resilient
    }
  }

  for (const feed of rssFeeds) {
    try {
      const items = await fetchRssFeed(feed, 30);
      allItems.push(...items.map((i) => ({ ...i, source: feed })));
    } catch {
      // Skip
    }
  }

  const deduped = dedupeHeadlines(allItems);
  const itemScores = deduped.map((item) => {
    const blob = `${item.title} ${item.description || ""}`;
    return { ...item, score: scoreText(blob, weights) };
  });
  itemScores.sort((a, b) => b.score - a.score || (b.publishedMs || 0) - (a.publishedMs || 0));

  const aggregateScore = itemScores.reduce((sum, item) => sum + item.score, 0);
  const targetHeat = targetHeatFromScore(aggregateScore, bands);

  const config = loadConfig();
  const scenario = config.scenarios[scenarioKey];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioKey}`);
  }
  const oldHeatBase = scenario.heatBase;
  const delta = Math.max(-maxHeatDelta, Math.min(maxHeatDelta, targetHeat - oldHeatBase));
  const newHeatBase = oldHeatBase + delta;
  updateScenarioField(scenarioKey, "heatBase", newHeatBase);

  // Write flow snapshot
  const ROOT = path.join(__dirname, "..");
  const flowsDir = path.join(ROOT, "data", "flows");
  fs.mkdirSync(flowsDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const flowPath = path.join(flowsDir, `${topic}-${stamp}.json`);

  const flow = {
    topic,
    scenarioKey,
    fetchedAt: new Date().toISOString(),
    aggregateScore,
    targetHeat,
    oldHeatBase,
    newHeatBase,
    delta,
    itemCount: itemScores.length,
    topSignals: itemScores.slice(0, 8).map(({ publishedMs, ...rest }) => rest)
  };
  fs.writeFileSync(flowPath, JSON.stringify(flow, null, 2));

  return {
    ...flow,
    flowPath: path.relative(ROOT, flowPath)
  };
}

module.exports = { runIntel, scoreText, targetHeatFromScore };
