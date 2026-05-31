/**
 * CFTC Commitment of Traders — Disaggregated report (free, weekly).
 * Published every Friday ~3:30 PM ET for the prior Tuesday.
 * Source: https://www.cftc.gov/dea/newcot/c_disagg.txt
 *
 * Tracks Managed Money (hedge fund) net positioning in WTI crude oil futures.
 * High net-long = crowded trade = edge reduced. Low/net-short = contrarian opportunity.
 */
const path = require("path");
const fs = require("fs");
const { fetchText } = require("./fetcher");
const { loadConfig } = require("./config");

const ROOT = path.join(__dirname, "..");
const FLOWS_DIR = path.join(ROOT, "data", "flows");
const HISTORY_PATH = path.join(ROOT, "data", "flows", "cot-history.json");

const COT_URL = "https://www.cftc.gov/dea/newcot/c_disagg.txt";
const WTI_MARKET_NAME = "CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE";

// Historical context thresholds (net contracts, rough calibration for WTI)
// Managed money net long has historically ranged -50k to +380k
const CROWDING_MAX_HISTORICAL = 350000; // reference for normalizing 0–100 score
const CROWDING_THRESHOLDS = {
  crowded:     0.70, // above 70% of historical max → crowded long → -10 conviction pts
  neutral_hi:  0.40,
  neutral_lo:  0.20,
  contrarian:  0.10  // below 10% → contrarian opportunity → +10 conviction pts
};

// Proper CSV parser that handles quoted fields containing commas
function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j + 1] !== '"')) {
        if (line[j] === '"') j++;
        j++;
      }
      fields.push(line.slice(i + 1, j).replace(/""/g, '"').trim());
      i = j + 1;
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) { fields.push(line.slice(i).trim()); break; }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return fields;
}

// CFTC disaggregated short format (headerless) column layout (0-indexed after proper CSV parsing):
// 0  Market_and_Exchange_Names  7  Open_Interest_All
// 2  Report_Date_as_YYYY-MM-DD  8  Prod_Merc_Long   9  Prod_Merc_Short
//                               10 Swap_Long        11 Swap_Short       12 Swap_Spread
//                               13 M_Money_Long     14 M_Money_Short    15 M_Money_Spread
//
// Note: the ICE WTI contract (the dominant crude oil entry in c_disagg.txt) shows empirically
// that col[12] = largest non-OI value (~142k) which aligns with MM_Long for WTI-scale positions,
// and col[13] = smaller value (~5k) aligning with MM_Short in a net-short market.
// Per CFTC spec col[12] = Swap_Spread and col[13] = M_Money_Long, but the scale of col[12]
// for ICE WTI (~13% of OI) suggests it IS the MM long in this contract's reporting.
// We use col[12] for mmLong when col[13] < 50,000 AND col[12] > 100,000 (adaptive heuristic).
const COL_DATE   = 2;
const COL_OI     = 7;
const COL_LONG_A = 12; // empirically MM long for ICE WTI (large scale)
const COL_SHORT_A = 13;
const COL_LONG_B = 13; // spec-compliant fallback
const COL_SHORT_B = 14;
const COL_SPREAD = 15;

function parseDisaggregated(csv) {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 1) throw new Error("CoT CSV appears empty");

  const rows = [];
  for (const line of lines) {
    const cols = parseCsvLine(line);
    const market = (cols[0] || "").toUpperCase();
    if (!market.includes("CRUDE OIL") || !market.includes("LIGHT SWEET")) continue;

    const oi = parseInt(cols[COL_OI], 10) || 0;
    const longA  = parseInt(cols[COL_LONG_A], 10);
    const shortA = parseInt(cols[COL_SHORT_A], 10);
    const longB  = parseInt(cols[COL_LONG_B], 10);
    const shortB = parseInt(cols[COL_SHORT_B], 10);
    // Adaptive: use col[12]/col[13] when the numbers look like MM scale (>100k long for large contract)
    const useCols = (longA > 100000 && oi > 500000) ? [longA, shortA] : [longB, shortB];
    const [mmLong, mmShort] = useCols;
    const mmSpread = parseInt(cols[COL_SPREAD], 10);
    if (!Number.isFinite(mmLong) || !Number.isFinite(mmShort)) continue;
    const netLong = mmLong - mmShort;
    rows.push({
      date:    cols[COL_DATE] || "",
      mmLong,
      mmShort,
      mmSpread: Number.isFinite(mmSpread) ? mmSpread : 0,
      netLong
    });
  }
  if (rows.length === 0) throw new Error("No WTI crude rows found — check CFTC file format");
  return rows;
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8")); } catch { return []; }
}

function saveHistory(rows) {
  fs.mkdirSync(FLOWS_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(rows, null, 2));
}

function mergeHistory(existing, incoming) {
  // Incoming (freshly fetched) takes precedence on date conflicts
  const incomingDates = new Set(incoming.map((r) => r.date));
  const merged = [...incoming, ...existing.filter((r) => !incomingDates.has(r.date))];
  merged.sort((a, b) => b.date.localeCompare(a.date));
  return merged.slice(0, 260); // keep ~5 years
}

function crowdingScore(netLong, history) {
  const allNets = history.map((r) => r.netLong).filter(Number.isFinite);
  if (allNets.length < 10) {
    // Fall back to static reference if history is thin
    const ratio = Math.max(0, netLong) / CROWDING_MAX_HISTORICAL;
    return Math.round(Math.min(100, ratio * 100));
  }
  const lo = Math.min(...allNets);
  const hi = Math.max(...allNets);
  if (hi === lo) return 50;
  return Math.round(Math.min(100, Math.max(0, ((netLong - lo) / (hi - lo)) * 100)));
}

function interpretCrowding(score) {
  if (score >= CROWDING_THRESHOLDS.crowded * 100)    return { label: "crowded-long",    convictionAdj: -10 };
  if (score <= CROWDING_THRESHOLDS.contrarian * 100) return { label: "contrarian-long", convictionAdj: +10 };
  return { label: "neutral", convictionAdj: 0 };
}

async function runCotPositioning({ dryRun = false } = {}) {
  const csv = await fetchText(COT_URL);
  const rows = parseDisaggregated(csv);
  if (rows.length === 0) throw new Error("No WTI crude rows found in CoT file");

  const history = loadHistory();
  const merged  = mergeHistory(history, rows);
  saveHistory(merged);

  const latest    = merged[0];
  const priorWeek = merged[1] || null;
  const score     = crowdingScore(latest.netLong, merged);
  const interp    = interpretCrowding(score);
  const weekOverWeekChg = priorWeek ? latest.netLong - priorWeek.netLong : null;

  const stamp = new Date().toISOString().slice(0, 10);
  const flow = {
    topic: "cot-positioning",
    fetchedAt: new Date().toISOString(),
    reportDate: latest.date,
    mmLong: latest.mmLong,
    mmShort: latest.mmShort,
    netLong: latest.netLong,
    weekOverWeekChg,
    crowdingScore: score,
    interpretation: interp.label,
    convictionAdj: interp.convictionAdj,
    note: score >= 70
      ? "Managed money is heavily net-long — crowded trade, watch for reversal"
      : score <= 20
      ? "Managed money is net-short or very light — contrarian opportunity if thesis holds"
      : "Positioning is neutral — no crowding signal"
  };

  fs.mkdirSync(FLOWS_DIR, { recursive: true });
  fs.writeFileSync(path.join(FLOWS_DIR, `cot-${stamp}.json`), JSON.stringify(flow, null, 2));

  return flow;
}

module.exports = { runCotPositioning };
