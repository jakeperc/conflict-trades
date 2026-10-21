// Bridge to the ww3-dash-v2 Global Conflict Monitor.
// Reads its per-theater indicator signals (updated daily at ~5am by the
// conflict-update automation) and converts them into a small bounded
// heat tilt per scenario, applied on top of heatBase + liveTilt in
// scenarios.js. Fails soft: if the data folder is missing, unreadable,
// or stale (> MAX_AGE_DAYS old), every tilt is 0, a warning is printed once,
// and ww3Status() reports it so the outage is visible in the payload.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// KEY=VALUE lines from the gitignored .env.local (machine-specific paths live there, never in git).
function readEnvLocal(key) {
  try {
    const text = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "") || null;
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

function resolveDashDir() {
  if (process.env.WW3_DASH_DIR) return { dir: process.env.WW3_DASH_DIR, source: "env" };
  const fromFile = readEnvLocal("WW3_DASH_DIR");
  if (fromFile) return { dir: fromFile, source: "env-file" };
  return { dir: path.join(ROOT, "..", "ww3-dash-v2", "data"), source: "sibling" };
}

const { dir: DASH_DIR, source: DASH_SOURCE } = resolveDashDir();

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
let warned = false;

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
      cache = { available: false, ageDays: round1(ageDays), reason: `data stale (${Math.round(ageDays)}d old)` };
      return warnOnce(cache);
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
      ageDays: Number.isFinite(ageDays) ? round1(ageDays) : null,
      ww3Pct: meta.ww3_pct ?? null,
      tilts
    };
  } catch (err) {
    // Generic reason only: fs error messages contain the local path, and this status is published.
    const reason = err.code === "ENOENT" ? "data folder not found" : "data unreadable";
    cache = { available: false, reason };
    warnOnce(cache);
  }
  return cache;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function warnOnce(result) {
  if (!warned) {
    warned = true;
    console.warn(`[ww3] Conflict Monitor signals unavailable (${result.reason}; dir from ${DASH_SOURCE}). All WW3 tilts are 0. Set WW3_DASH_DIR in .env.local.`);
  }
  return result;
}

/** Path-free status for the published payload and the daily report. */
function ww3Status() {
  const s = loadWw3Signals();
  return {
    available: !!s.available,
    source: DASH_SOURCE,
    ageDays: s.ageDays ?? null,
    reason: s.available ? null : s.reason
  };
}

module.exports = { loadWw3Signals, ww3Status, DASH_DIR, DASH_SOURCE };
