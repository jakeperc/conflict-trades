const path = require("path");
const fs = require("fs");
const { URL } = require("url");
const { fetchGoogleNews, fetchRssFeed, dedupeHeadlines } = require("./news");
const { loadConfig, updateScenarioField } = require("./config");

// Words that negate the following keyword (checked in 60 chars before the match)
const NEGATION_WORDS = [
  "no ", "not ", "non-", "deny", "denies", "denied", "refutes", "refuted",
  "cancel", "cancelled", "cancels", "halt", "halted", "halts", "end ", "ended ",
  "ends ", "false", "fabricated", "unfounded", "dismissed", "deescalat", "de-escalat",
  "resume", "reopen", "normaliz", "ease", "eased", "ceasefire", "truce"
];

// event classification → score multiplier
const CLASSIFICATION_MULTIPLIERS = {
  kinetic: 2.0,      // physical attack, seizure, strike
  diplomatic: 0.5,   // talks, deals, de-escalation
  economic: 1.3      // sanctions, bans, trade flows
};

// domain → credibility multiplier (strips www.)
const SOURCE_CREDIBILITY = {
  "understandingwar.org": 2.0,
  "criticalthreats.org": 2.0,
  "centcom.mil": 2.0,
  "defense.gov": 2.0,
  "reuters.com": 1.5,
  "apnews.com": 1.5,
  "bbc.co.uk": 1.5,
  "bbc.com": 1.5,
  "ft.com": 1.5,
  "wsj.com": 1.5,
  "bloomberg.com": 1.5
};

function sourceCredibilityMultiplier(link) {
  if (!link) return 1.0;
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, "");
    return SOURCE_CREDIBILITY[hostname] || 1.0;
  } catch {
    return 1.0;
  }
}

// Returns 0.0–1.0 based on article age
function temporalDecayFactor(publishedMs) {
  if (!publishedMs) return 0.5;
  const ageHours = (Date.now() - publishedMs) / (1000 * 3600);
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 48) return 0.8;
  if (ageHours <= 72) return 0.5;
  if (ageHours <= 168) return 0.2;
  return 0.0;
}

function scoreText(text, weights) {
  const lower = text.toLowerCase();
  return weights.reduce((sum, entry) => {
    const keyword = String(entry[0]).toLowerCase();
    const baseWeight = Number(entry[1]) || 0;
    const classification = entry[2] || null;

    const idx = lower.indexOf(keyword);
    if (idx === -1) return sum;

    // Check for negation words in the 60 chars before the keyword
    const context = lower.slice(Math.max(0, idx - 60), idx);
    const negated = NEGATION_WORDS.some((n) => context.includes(n));

    const classMult = CLASSIFICATION_MULTIPLIERS[classification] || 1;
    const signedWeight = negated ? -Math.abs(baseWeight) : baseWeight;
    return sum + signedWeight * classMult;
  }, 0);
}

function targetHeatFromScore(score, bands) {
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
      // Skip on failure — intel commands must be resilient
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
    const rawScore = scoreText(blob, weights);
    const decay = temporalDecayFactor(item.publishedMs);
    const credMult = sourceCredibilityMultiplier(item.link);
    const score = rawScore * decay * credMult;
    return { ...item, score, rawScore, decayFactor: Number(decay.toFixed(2)) };
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
    aggregateScore: Number(aggregateScore.toFixed(2)),
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

module.exports = { runIntel, scoreText, targetHeatFromScore, temporalDecayFactor, sourceCredibilityMultiplier };
