// Bridge to the sibling ww3-dash-v2 Global Conflict Monitor.
// Reads its per-theater indicator signals (updated daily at ~5am by the
// conflict-update automation) and converts them into a small bounded
// heat tilt per scenario, applied on top of heatBase + liveTilt in
// scenarios.js. Fails soft: if the dashboard folder is missing, unreadable,
// or stale (> MAX_AGE_DAYS old), every tilt is 0 and the trader behaves
// exactly as before.
const fs = require("fs");
const path = require("path");

const DASH_DIR =
  process.env.WW3_DASH_DIR ||
  path.join(__dirname, "..", "..", "ww3-dash-v2", "data");

// Which conflict-monitor theaters inform which trading scenario.
const THEATER_MAP = {
  iran: ["iran-hormuz", "red-sea-shipping", "israel-lebanon-gaza"],
  taiwan: ["us-china"],
  europe: ["russia-ukraine-war", "russia-ukraine"],
  korea: [] // sparse theater coverage; keyword scan below fills the gap
};
const KOREA_RE = /korea|dprk|pyongyang/i;
const MAX_AGE_DAYS = 7;
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache = null;
let cacheAt = 0;

// A theater's score blends its hottest single indicator with how broadly
// its indicator set has activated. Both are 0..1.
function theaterScore(summary) {
  if (!summary || !summary.total) return null;
  return 0.6 * (summary.highest_signal || 0) + 0.4 * (summary.activated / summary.total);
}

// score 0.5 is neutral; each 0.1 above/below moves heat by 1, capped at +/-4.
function scoreToTilt(score) {
  return Math.max(-4, Math.min(4, Math.round((score - 0.5) * 10)));
}

function loadWw3Signals() {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  cacheAt = Date.now();
  try {
    const indicators = JSON.parse(
      fs.readFileSync(path.join(DASH_DIR, "indicators.json"), "utf8")
    );
    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(path.join(DASH_DIR, "meta.json"), "utf8"));
    } catch (err) {
      // meta is optional; freshness falls back to indicators.last_reviewed
    }
    const builtAt = Date.parse(meta.last_built || indicators.last_reviewed || "");
    const ageDays = Number.isFinite(builtAt)
      ? (Date.now() - builtAt) / 86400000
      : Infinity;
    if (ageDays > MAX_AGE_DAYS) {
      cache = { available: false, reason: `data stale (${Math.round(ageDays)}d old)` };
      return cache;
    }

    const summary = indicators.theater_summary || {};
    const tilts = {};
    for (const [scenario, theaters] of Object.entries(THEATER_MAP)) {
      let score = null;
      const sources = [];
      for (const t of theaters) {
        const s = theaterScore(summary[t]);
        if (s !== null) {
          sources.push(t);
          score = score === null ? s : Math.max(score, s);
        }
      }
      if (scenario === "korea") {
        const hits = (indicators.indicators || []).filter((i) =>
          KOREA_RE.test(i.indicator || "")
        );
        if (hits.length) {
          const s = Math.max(...hits.map((i) => i.current_signal_strength || 0));
          sources.push(`keyword-match (${hits.length} indicators)`);
          score = score === null ? s : Math.max(score, s);
        }
      }
      tilts[scenario] =
        score === null
          ? { tilt: 0, score: null, sources: [] }
          : { tilt: scoreToTilt(score), score: Number(score.toFixed(2)), sources };
    }

    cache = {
      available: true,
      builtAt: meta.last_built || null,
      ww3Pct: meta.ww3_pct ?? null,
      tilts
    };
  } catch (err) {
    cache = { available: false, reason: err.message };
  }
  return cache;
}

module.exports = { loadWw3Signals, DASH_DIR };
