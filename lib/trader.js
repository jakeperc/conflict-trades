const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");
const { buildPayload } = require("./scenarios");
const { fetchQuoteHistory } = require("./quotes");

const ROOT = path.join(__dirname, "..");
const STATE_PATH = path.join(ROOT, "data", "trader", "state.json");
const MEMORY_PATH = path.join(ROOT, "data", "trader", "memory.json");
const LOG_PATH = path.join(ROOT, "data", "trader", "log.jsonl");
const SIMULATION_PATH = path.join(ROOT, "data", "trader", "simulation.json");
const CALIBRATION_PATH = path.join(ROOT, "data", "trader", "calibration.json");

const STARTING_CASH = 10000;
const MAX_OPEN_POSITIONS = 5;
const BASE_POSITION_SIZE = 1800; // $1.8K equal weight
const HIGH_CONFIDENCE_SIZE = 2400; // Bump on high finalScore + memory edge
const MIN_CONFIDENCE_TO_ENTER = 0.55; // finalScore >= 55 / 100
const SIZE_BOOST_FLOOR = 0.72; // finalScore >= 72 to get the larger size
const CASH_RESERVE_PCT = 0.1;

// US market holidays 2026–2027 (NYSE schedule)
const US_MARKET_HOLIDAYS = new Set([
  "2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25",
  "2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25",
  "2027-01-01","2027-01-18","2027-02-15","2027-04-02","2027-05-31",
  "2027-06-18","2027-07-05","2027-09-06","2027-11-25","2027-12-24"
]);

function isUsMarketDay(dateISO) {
  const d = new Date(dateISO + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !US_MARKET_HOLIDAYS.has(dateISO);
}

const HORIZON_DAYS_BY_KEYWORD = {
  "1-3 weeks": 21,
  "1-4 weeks": 28,
  "2-6 weeks": 42,
  "1-8 weeks": 56,
  "2-8 weeks": 56,
  "2-12 weeks": 84,
  "1-3 months": 90,
  "1-6 months": 180
};

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

function horizonToDays(horizon) {
  if (!horizon) return 60;
  const key = horizon.trim();
  if (HORIZON_DAYS_BY_KEYWORD[key]) return HORIZON_DAYS_BY_KEYWORD[key];
  // Generic parse: take the upper bound, convert to days
  const match = String(horizon).match(/(\d+)\s*-\s*(\d+)\s*(week|month)/i);
  if (match) {
    const upper = Number(match[2]);
    const unit = match[3].toLowerCase();
    return upper * (unit.startsWith("month") ? 30 : 7);
  }
  return 60;
}

function ensureDirs() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
}

function loadState() {
  ensureDirs();
  if (!fs.existsSync(STATE_PATH)) {
    const seed = {
      startingCash: STARTING_CASH,
      cash: STARTING_CASH,
      openPositions: [],
      closedTrades: [],
      equityCurve: [],
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      cycles: 0
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
}

function saveState(state) {
  if (fs.existsSync(STATE_PATH)) {
    fs.copyFileSync(STATE_PATH, STATE_PATH.replace(".json", ".backup.json"));
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function loadMemory() {
  ensureDirs();
  if (!fs.existsSync(MEMORY_PATH)) {
    const seed = {
      buckets: {},
      lastUpdatedAt: null,
      tradesObserved: 0
    };
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(fs.readFileSync(MEMORY_PATH, "utf-8"));
}

function saveMemory(memory) {
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2));
}

function logEvent(event) {
  ensureDirs();
  fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
}

function bucketKeysFor(trade) {
  return [
    `ticker:${trade.ticker}`,
    `sector:${trade.sector}`,
    `direction:${trade.direction}`,
    `scenario:${trade.scenario}`,
    `conviction:${trade.conviction}`,
    `sector:${trade.sector}|direction:${trade.direction}`,
    `scenario:${trade.scenario}|direction:${trade.direction}`,
    `scenario:${trade.scenario}|sector:${trade.sector}`,
    `scenario:${trade.scenario}|sector:${trade.sector}|direction:${trade.direction}`
  ];
}

function memoryMultiplier(memory, trade) {
  let mult = 1.0;
  const buckets = bucketKeysFor(trade);
  const adjustments = [];
  for (const key of buckets) {
    const b = memory.buckets[key];
    if (!b || b.n < 3) continue;
    const winRate = b.wins / b.n;
    const avgPct = b.totalPnlPct / b.n;
    const bucketAdj = (winRate - 0.5) * 0.4 + clamp(avgPct, -0.1, 0.1) * 4;
    const credibility = b.n / (b.n + 8);
    const factor = 1 + bucketAdj * credibility;
    mult *= factor;
    adjustments.push({ key, n: b.n, winRate, avgPct, factor });
  }
  return { mult: clamp(mult, 0.3, 2.5), adjustments };
}

// ---- Component scorers (each returns 0-100) ----

function scoreConviction(trade) {
  // Diminishing returns: conviction 5 deserves a real bump over conviction 4
  const c = trade.conviction || 0;
  if (c >= 5) return 95;
  if (c >= 4) return 80;
  if (c >= 3) return 60;
  if (c >= 2) return 40;
  return 25;
}

function scoreScenario(trade) {
  // Heat is the scenario-level signal. Map 30-100 to 30-100 with a slight curve
  // so that going from 70 to 90 is worth more than 50 to 70.
  const heat = trade.heat ?? 50;
  if (heat >= 90) return 95;
  if (heat >= 80) return 85;
  if (heat >= 70) return 70;
  if (heat >= 60) return 55;
  if (heat >= 50) return 45;
  return 35;
}

function scoreRiskReward(trade) {
  // Reward both absolute upside (durability) and the ratio (asymmetry)
  const upsidePct = trade.upsidePct ?? 0;
  const rr = trade.rewardToRisk ?? 0;
  const upsideScore = Math.min(100, upsidePct * 400); // 25% upside -> 100
  const ratioScore = Math.min(100, rr * 33); // R/R 3 -> 100
  return upsideScore * 0.55 + ratioScore * 0.45;
}

function scoreTrend(trade) {
  // Reward direction-aligned trend. Long with positive momentum or above MAs = good.
  const dir = trade.direction;
  const mom22 = trade.momentum22d;
  const vsMa22 = trade.pctVsMa22;
  const vsMa50 = trade.pctVsMa50;
  if (mom22 == null && vsMa22 == null) return 50;

  const aligned = (val) => (dir === "LONG" ? val : -val);
  const m22 = aligned(mom22 ?? 0);
  const v22 = aligned(vsMa22 ?? 0);
  const v50 = aligned(vsMa50 ?? 0);

  // Each component scores 0-1 around its sign
  let score = 50;
  // Above/below MAs (3% threshold for "meaningful")
  if (v22 > 0.03) score += 15;
  else if (v22 > 0) score += 8;
  else if (v22 < -0.03) score -= 15;
  else if (v22 < 0) score -= 8;

  if (v50 > 0.03) score += 12;
  else if (v50 > 0) score += 6;
  else if (v50 < -0.03) score -= 12;
  else if (v50 < 0) score -= 6;

  // 22d momentum
  if (m22 > 0.05) score += 10;
  else if (m22 > 0) score += 5;
  else if (m22 < -0.05) score -= 10;
  else if (m22 < 0) score -= 5;

  return clamp(score, 5, 100);
}

function scoreVolRegime(trade) {
  // Goldilocks zone for vol: 0.25 to 0.45 annualized.
  // Too low = stock is asleep, no catalyst opportunity.
  // Too high = noise dominates, harder to size, more stop-outs.
  const v = trade.annualizedVol ?? 0.3;
  if (v < 0.12) return 45;
  if (v < 0.20) return 65;
  if (v < 0.30) return 82;
  if (v < 0.45) return 80;
  if (v < 0.60) return 60;
  if (v < 0.80) return 45;
  return 30;
}

function scoreCatalyst(trade) {
  // Reward specific, named, time-bound catalysts. Penalize vague "rerating" prose.
  const catalyst = (trade.catalyst || "") + " " + (trade.thesis || "");
  if (!catalyst.trim()) return 35;
  const lower = catalyst.toLowerCase();
  let score = 50;

  // Concrete event keywords
  const concreteEvents = [
    "earning", "q1", "q2", "q3", "q4", "quarter",
    "contract", "award", "backlog", "replenish",
    "blockade", "disrupt", "seize", "attack", "strike",
    "sanction", "export control", "tariff",
    "reprice", "spread widen", "insurance"
  ];
  let concreteHits = 0;
  for (const k of concreteEvents) if (lower.includes(k)) concreteHits++;
  score += Math.min(30, concreteHits * 7);

  // Mentions of specific tickers/programs
  if (/patriot|himars|thaad|f-35|pac-3|aegis|hbm/i.test(catalyst)) score += 8;

  // Vagueness penalty
  const vague = ["rerate", "narrative", "sentiment", "could", "may "];
  let vagueHits = 0;
  for (const k of vague) if (lower.includes(k)) vagueHits++;
  score -= vagueHits * 4;

  return clamp(score, 10, 100);
}

function scoreMemory(memInfo) {
  // Memory multiplier 0.3 -> 0, 1.0 -> 50, 2.5 -> 100. Linear in log space.
  const mult = memInfo.mult;
  if (mult >= 2.5) return 100;
  if (mult <= 0.3) return 0;
  if (mult >= 1.0) {
    return 50 + ((mult - 1.0) / 1.5) * 50;
  }
  return 50 - ((1.0 - mult) / 0.7) * 50;
}

function computeDiversificationPenalty(trade, openPositions) {
  if (!openPositions || !openPositions.length) return 0;
  if (openPositions.some((p) => p.ticker === trade.ticker)) return 100;
  const sameSector = openPositions.filter((p) => p.sector === trade.sector).length;
  const sameScenario = openPositions.filter((p) => p.scenario === trade.scenario).length;
  const sameDirection = openPositions.filter((p) => p.direction === trade.direction).length;
  let penalty = 0;
  penalty += sameSector * 6; // 6 pts per same-sector position
  penalty += sameScenario * 3;
  if (sameDirection === openPositions.length) penalty += 4;
  return Math.min(18, penalty);
}

const COMPONENT_WEIGHTS = {
  conviction: 0.18,
  scenario: 0.14,
  riskReward: 0.16,
  trend: 0.14,
  volRegime: 0.08,
  catalyst: 0.10,
  memory: 0.20
};

function getCalibratedWeights(trade, calibration) {
  // Path 3: tournament-learned globalWeights are the primary signal.
  // Per-bucket weights (Pearson-correlation method) are kept for back-compat but
  // are NOT applied unless explicitly enabled via calibration.applyBucketWeights.
  const baseline = calibration?.globalWeights || COMPONENT_WEIGHTS;
  if (calibration?.applyBucketWeights && calibration?.perBucket) {
    const keys = [
      `scenario:${trade.scenario}|sector:${trade.sector}|direction:${trade.direction}`,
      `sector:${trade.sector}|direction:${trade.direction}`,
      `scenario:${trade.scenario}|direction:${trade.direction}`
    ];
    for (const key of keys) {
      if (calibration.perBucket[key]?.weights) {
        return { weights: calibration.perBucket[key].weights, bucketKey: key, calibrationN: calibration.perBucket[key].n };
      }
    }
  }
  return {
    weights: baseline,
    bucketKey: baseline === COMPONENT_WEIGHTS ? null : "global",
    calibrationN: null
  };
}

function getCalibratedMultipliers(trade, calibration) {
  if (!calibration?.perBucket) return { stopMult: 1, targetMult: 1, bucketKey: null };
  const keys = [
    `scenario:${trade.scenario}|sector:${trade.sector}|direction:${trade.direction}`,
    `sector:${trade.sector}|direction:${trade.direction}`,
    `scenario:${trade.scenario}|direction:${trade.direction}`
  ];
  for (const key of keys) {
    const b = calibration.perBucket[key];
    if (b && (b.stopMult || b.targetMult)) {
      return { stopMult: b.stopMult ?? 1, targetMult: b.targetMult ?? 1, bucketKey: key };
    }
  }
  return { stopMult: 1, targetMult: 1, bucketKey: null };
}

function scoreCandidate(trade, memory, context = {}) {
  const memInfo = memoryMultiplier(memory, trade);
  const components = {
    conviction: scoreConviction(trade),
    scenario: scoreScenario(trade),
    riskReward: scoreRiskReward(trade),
    trend: scoreTrend(trade),
    volRegime: scoreVolRegime(trade),
    catalyst: scoreCatalyst(trade),
    memory: scoreMemory(memInfo)
  };
  // Explicit null in context disables calibration lookup (for A/B backtests).
  const calibration = "calibration" in context ? context.calibration : loadCalibration();
  const { weights, bucketKey, calibrationN } = getCalibratedWeights(trade, calibration);
  const rawScore = Object.entries(components).reduce(
    (sum, [key, val]) => sum + val * (weights[key] ?? COMPONENT_WEIGHTS[key] ?? 0),
    0
  );
  const divPenalty = computeDiversificationPenalty(trade, context.openPositions || []);
  const finalScore = clamp(rawScore - divPenalty, 0, 100);
  return {
    confidence: finalScore / 100,
    finalScore: Number(finalScore.toFixed(1)),
    rawScore: Number(rawScore.toFixed(1)),
    components: Object.fromEntries(
      Object.entries(components).map(([k, v]) => [k, Number(v.toFixed(1))])
    ),
    weights,
    weightsBucket: bucketKey,
    weightsN: calibrationN || null,
    diversificationPenalty: divPenalty,
    baseScore: Number((rawScore / 100).toFixed(3)),
    memoryMult: Number(memInfo.mult.toFixed(3)),
    memoryAdjustments: memInfo.adjustments
  };
}

function realizedPnl(position, exitPrice) {
  const direction = position.direction;
  const entryPx = position.entryPrice;
  const shares = position.shares;
  const dollar =
    direction === "LONG"
      ? (exitPrice - entryPx) * shares
      : (entryPx - exitPrice) * shares;
  const pct = direction === "LONG"
    ? (exitPrice - entryPx) / entryPx
    : (entryPx - exitPrice) / entryPx;
  return { dollar, pct };
}

function unrealizedPnl(position, currentPrice) {
  if (!Number.isFinite(currentPrice)) return { dollar: 0, pct: 0 };
  return realizedPnl(position, currentPrice);
}

async function checkExit(position, todayISO) {
  // Pull history since entry and find first stop/target hit
  let history;
  try {
    history = await fetchQuoteHistory(position.ticker);
  } catch (e) {
    return { exited: false, reason: "no-history", error: e.message };
  }
  const entryDate = position.entryDate;
  const sinceEntry = history.filter((row) => row.date > entryDate);
  const horizonDays = position.horizonDays || 60;
  const entryMs = Date.parse(entryDate);
  const todayMs = Date.parse(todayISO);
  const heldDays = Math.floor((todayMs - entryMs) / (24 * 3600 * 1000));

  for (const row of sinceEntry) {
    if (position.direction === "LONG") {
      if (row.close >= position.targetPrice) {
        return { exited: true, reason: "target_hit", exitDate: row.date, exitPrice: row.close };
      }
      if (row.close <= position.stopPrice) {
        return { exited: true, reason: "stop_hit", exitDate: row.date, exitPrice: row.close };
      }
    } else {
      if (row.close <= position.targetPrice) {
        return { exited: true, reason: "target_hit", exitDate: row.date, exitPrice: row.close };
      }
      if (row.close >= position.stopPrice) {
        return { exited: true, reason: "stop_hit", exitDate: row.date, exitPrice: row.close };
      }
    }
  }

  if (heldDays >= horizonDays && sinceEntry.length) {
    const lastRow = sinceEntry[sinceEntry.length - 1];
    return { exited: true, reason: "horizon_exceeded", exitDate: lastRow.date, exitPrice: lastRow.close };
  }

  // Still open. Return latest price for unrealized calc.
  const latest = sinceEntry[sinceEntry.length - 1] || history[history.length - 1];
  return { exited: false, latestPrice: latest?.close, latestDate: latest?.date };
}

function updateMemoryWith(memory, closedTrade) {
  const tradeForBuckets = {
    ticker: closedTrade.ticker,
    sector: closedTrade.sector,
    direction: closedTrade.direction,
    scenario: closedTrade.scenario,
    conviction: closedTrade.conviction
  };
  const keys = bucketKeysFor(tradeForBuckets);
  const isWin = closedTrade.realizedPct > 0;
  for (const key of keys) {
    if (!memory.buckets[key]) {
      memory.buckets[key] = {
        n: 0,
        wins: 0,
        totalPnlPct: 0,
        lastUpdated: null,
        exitReasons: {},
        failureKinds: {},
        holdingDaysTotal: 0,
        maxFavorableTotal: 0,
        maxAdverseTotal: 0
      };
    }
    const b = memory.buckets[key];
    b.n += 1;
    if (isWin) b.wins += 1;
    b.totalPnlPct += closedTrade.realizedPct;
    b.lastUpdated = closedTrade.exitDate || new Date().toISOString().slice(0, 10);
    if (closedTrade.exitReason) {
      b.exitReasons = b.exitReasons || {};
      b.exitReasons[closedTrade.exitReason] = (b.exitReasons[closedTrade.exitReason] || 0) + 1;
    }
    if (closedTrade.failureKind) {
      b.failureKinds = b.failureKinds || {};
      b.failureKinds[closedTrade.failureKind] = (b.failureKinds[closedTrade.failureKind] || 0) + 1;
    }
    if (Number.isFinite(closedTrade.holdingDays)) {
      b.holdingDaysTotal = (b.holdingDaysTotal || 0) + closedTrade.holdingDays;
    }
    if (Number.isFinite(closedTrade.maxFavorable)) {
      b.maxFavorableTotal = (b.maxFavorableTotal || 0) + closedTrade.maxFavorable;
    }
    if (Number.isFinite(closedTrade.maxAdverse)) {
      b.maxAdverseTotal = (b.maxAdverseTotal || 0) + closedTrade.maxAdverse;
    }
  }
  memory.tradesObserved += 1;
  memory.lastUpdatedAt = new Date().toISOString();
}

function flattenScenarioTrades(scenarios) {
  const all = [];
  for (const [key, scenario] of Object.entries(scenarios)) {
    for (const trade of scenario.trades) {
      if (trade.price == null) continue;
      all.push({
        ...trade,
        scenario: key,
        scenarioTitle: scenario.title,
        heat: scenario.heat
      });
    }
  }
  return all;
}

function pickNewPositions(args) {
  const { candidates, openPositions, cash, memory, maxNew, calibrationOverride } = args;
  const hasOverride = Object.prototype.hasOwnProperty.call(args, "calibrationOverride");
  const openTickers = new Set(openPositions.map((p) => p.ticker));
  const scoreCtx = (extra) =>
    hasOverride ? { ...extra, calibration: calibrationOverride } : extra;
  // Score everything first against the current portfolio for diversification
  const scored = candidates
    .map((t) => ({ ...t, score: scoreCandidate(t, memory, scoreCtx({ openPositions })) }))
    .sort((a, b) => b.score.finalScore - a.score.finalScore);

  const picks = [];
  const simulatedOpen = [...openPositions];
  let remainingCash = cash;
  const minCashReserve = STARTING_CASH * CASH_RESERVE_PCT;

  for (const candidate of scored) {
    if (picks.length >= maxNew) break;
    if (openTickers.has(candidate.ticker)) continue;
    if (candidate.score.finalScore < MIN_CONFIDENCE_TO_ENTER * 100) break;
    // Re-score against the growing simulated portfolio so concentration tightens with each pick
    const rescored = scoreCandidate(candidate, memory, scoreCtx({ openPositions: simulatedOpen }));
    if (rescored.finalScore < MIN_CONFIDENCE_TO_ENTER * 100) continue;
    const sizeBoost = rescored.finalScore >= SIZE_BOOST_FLOOR * 100 && rescored.memoryMult >= 1.15;
    const desiredSize = sizeBoost ? HIGH_CONFIDENCE_SIZE : BASE_POSITION_SIZE;
    if (remainingCash - desiredSize < minCashReserve) continue;
    picks.push({ ...candidate, score: rescored, allocatedCash: desiredSize });
    simulatedOpen.push({
      ticker: candidate.ticker,
      sector: candidate.sector,
      scenario: candidate.scenario,
      direction: candidate.direction
    });
    remainingCash -= desiredSize;
  }
  return { picks, scoredWatchlist: scored.slice(0, 12) };
}

async function runCycle({ note } = {}) {
  const state = loadState();
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (state.lastRunAt && state.lastRunAt.slice(0, 10) === todayET) {
    return { skipped: true, reason: "already-ran-today", date: todayET };
  }
  const memory = loadMemory();
  const { scenarios, fallbackQuotes } = loadConfig();
  const payload = await buildPayload(scenarios, fallbackQuotes);

  const today = new Date().toISOString().slice(0, 10);
  const events = [];

  // 1. Evaluate open positions for exits
  const stillOpen = [];
  for (const pos of state.openPositions) {
    const result = await checkExit(pos, new Date().toISOString());
    if (result.exited) {
      const pnl = realizedPnl(pos, result.exitPrice);
      const proceeds = pos.allocatedCash + pnl.dollar;
      state.cash += proceeds;
      const closed = {
        ...pos,
        exitDate: result.exitDate,
        exitPrice: Number(result.exitPrice.toFixed(2)),
        exitReason: result.reason,
        realizedPnlDollar: Number(pnl.dollar.toFixed(2)),
        realizedPct: Number(pnl.pct.toFixed(4)),
        holdingDays: Math.floor(
          (Date.parse(result.exitDate) - Date.parse(pos.entryDate)) / (24 * 3600 * 1000)
        ),
        outcome: pnl.pct > 0 ? "win" : "loss"
      };
      state.closedTrades.push(closed);
      updateMemoryWith(memory, closed);
      logEvent({ type: "exit", position: closed });
      events.push({ type: "exit", ...closed });
    } else {
      pos.lastKnownPrice = result.latestPrice;
      pos.lastKnownDate = result.latestDate;
      stillOpen.push(pos);
    }
  }
  state.openPositions = stillOpen;

  // 2. Score candidates and open new positions to fill slots
  const candidates = flattenScenarioTrades(payload.scenarios);
  const openTickers = new Set(state.openPositions.map((p) => p.ticker));
  const slots = MAX_OPEN_POSITIONS - state.openPositions.length;
  const { picks, scoredWatchlist } = pickNewPositions({
    candidates,
    openPositions: state.openPositions,
    cash: state.cash,
    memory,
    maxNew: slots
  });

  const calibration = loadCalibration();
  for (const pick of picks) {
    const { stopMult, targetMult, bucketKey: multBucket } = getCalibratedMultipliers(pick, calibration);
    const upsidePct = pick.upsidePct * targetMult;
    const downsidePct = pick.downsidePct * stopMult;
    const targetPrice = pick.direction === "LONG"
      ? pick.price * (1 + upsidePct)
      : pick.price * (1 - upsidePct);
    const stopPrice = pick.direction === "LONG"
      ? pick.price * (1 - downsidePct)
      : pick.price * (1 + downsidePct);

    const shares = pick.allocatedCash / pick.price;
    const newPos = {
      id: `pos-${today}-${pick.ticker}-${pick.scenario}`,
      ticker: pick.ticker,
      scenario: pick.scenario,
      scenarioTitle: pick.scenarioTitle,
      sector: pick.sector,
      direction: pick.direction,
      conviction: pick.conviction,
      entryDate: today,
      entryPrice: Number(pick.price.toFixed(2)),
      shares: Number(shares.toFixed(6)),
      allocatedCash: pick.allocatedCash,
      targetPrice: Number(targetPrice.toFixed(2)),
      stopPrice: Number(stopPrice.toFixed(2)),
      horizonDays: horizonToDays(pick.horizon),
      thesis: pick.thesis,
      catalyst: pick.catalyst,
      thesisBreaker: pick.thesisBreaker,
      pairTrade: pick.pairTrade,
      heatAtEntry: pick.heat,
      confidenceAtEntry: Number(pick.score.confidence.toFixed(3)),
      finalScoreAtEntry: pick.score.finalScore,
      componentsAtEntry: pick.score.components,
      diversificationPenaltyAtEntry: pick.score.diversificationPenalty,
      memoryMultAtEntry: Number(pick.score.memoryMult.toFixed(3)),
      memoryAdjustmentsAtEntry: pick.score.memoryAdjustments,
      weightsAtEntry: pick.score.weights,
      weightsBucketAtEntry: pick.score.weightsBucket,
      stopMultAtEntry: Number(stopMult.toFixed(2)),
      targetMultAtEntry: Number(targetMult.toFixed(2)),
      calibrationBucketAtEntry: multBucket
    };
    state.cash -= pick.allocatedCash;
    state.openPositions.push(newPos);
    logEvent({ type: "entry", position: newPos });
    events.push({ type: "entry", position: newPos });
  }

  // 3. Mark-to-market open positions for equity calc
  const liveQuoteMap = {};
  for (const scenario of Object.values(payload.scenarios)) {
    for (const trade of scenario.trades) {
      if (trade.price != null) liveQuoteMap[trade.ticker] = trade.price;
    }
  }
  let openMtM = 0;
  state.openPositions = state.openPositions.map((pos) => {
    const live = liveQuoteMap[pos.ticker] ?? pos.lastKnownPrice ?? pos.entryPrice;
    const u = unrealizedPnl(pos, live);
    const updated = {
      ...pos,
      currentPrice: Number(live.toFixed(2)),
      unrealizedPnlDollar: Number(u.dollar.toFixed(2)),
      unrealizedPct: Number(u.pct.toFixed(4))
    };
    openMtM += pos.allocatedCash + u.dollar;
    return updated;
  });

  const totalEquity = state.cash + openMtM;
  state.equityCurve.push({
    date: today,
    cycle: state.cycles + 1,
    cash: Number(state.cash.toFixed(2)),
    openMtM: Number(openMtM.toFixed(2)),
    totalEquity: Number(totalEquity.toFixed(2)),
    pctVsStart: Number(((totalEquity - state.startingCash) / state.startingCash).toFixed(4))
  });
  state.cycles += 1;
  state.lastRunAt = new Date().toISOString();
  if (note) state.lastNote = note;

  // Persist the most recent watchlist + scoring so the page can render it
  state.lastWatchlist = scoredWatchlist.slice(0, 12).map((c) => ({
    ticker: c.ticker,
    scenario: c.scenario,
    scenarioTitle: c.scenarioTitle,
    direction: c.direction,
    sector: c.sector,
    price: Number(c.price.toFixed(2)),
    targetPrice: Number(c.targetPrice.toFixed(2)),
    stopPrice: Number(c.stopPrice.toFixed(2)),
    rewardToRisk: c.rewardToRisk,
    conviction: c.conviction,
    heat: c.heat,
    upsidePct: c.upsidePct,
    downsidePct: c.downsidePct,
    momentum22d: c.momentum22d,
    pctVsMa22: c.pctVsMa22,
    annualizedVol: c.annualizedVol,
    catalyst: c.catalyst,
    finalScore: c.score.finalScore,
    confidence: Number(c.score.confidence.toFixed(3)),
    components: c.score.components,
    diversificationPenalty: c.score.diversificationPenalty,
    memoryMult: Number(c.score.memoryMult.toFixed(3)),
    held: openTickers.has(c.ticker)
  }));

  // Cap closedTrades and equityCurve history so files don't grow unbounded
  if (state.closedTrades.length > 200) state.closedTrades = state.closedTrades.slice(-200);
  if (state.equityCurve.length > 200) state.equityCurve = state.equityCurve.slice(-200);

  saveState(state);
  saveMemory(memory);

  return {
    cycle: state.cycles,
    totalEquity: state.equityCurve[state.equityCurve.length - 1].totalEquity,
    pctVsStart: state.equityCurve[state.equityCurve.length - 1].pctVsStart,
    cash: state.cash,
    openCount: state.openPositions.length,
    eventsThisCycle: events,
    watchlist: scoredWatchlist.slice(0, 6).map((c) => ({
      ticker: c.ticker,
      scenario: c.scenario,
      direction: c.direction,
      sector: c.sector,
      price: Number(c.price.toFixed(2)),
      confidence: Number(c.score.confidence.toFixed(3)),
      baseScore: Number(c.score.baseScore.toFixed(3)),
      memoryMult: Number(c.score.memoryMult.toFixed(3))
    }))
  };
}

function summarizeMemory(memory) {
  const items = Object.entries(memory.buckets)
    .filter(([, b]) => b.n >= 3)
    .map(([key, b]) => ({
      key,
      n: b.n,
      winRate: Number((b.wins / b.n).toFixed(3)),
      avgPnlPct: Number((b.totalPnlPct / b.n).toFixed(4)),
      score: (b.wins / b.n - 0.5) * 0.4 + clamp(b.totalPnlPct / b.n, -0.1, 0.1) * 4
    }))
    .sort((a, b) => b.score - a.score);
  return {
    bucketCount: items.length,
    tradesObserved: memory.tradesObserved,
    top: items.slice(0, 5),
    bottom: items.slice(-5).reverse()
  };
}

function resetAll() {
  for (const p of [STATE_PATH, MEMORY_PATH, LOG_PATH, SIMULATION_PATH, CALIBRATION_PATH]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  return { reset: true };
}

function loadCalibration() {
  if (!fs.existsSync(CALIBRATION_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CALIBRATION_PATH, "utf-8"));
  } catch {
    return null;
  }
}

// ---- Live-quote cache for mark-to-market ----
const quoteCache = new Map();
const QUOTE_CACHE_TTL_MS = 30_000;

async function getLatestQuote(ticker) {
  const cached = quoteCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < QUOTE_CACHE_TTL_MS) return cached;
  try {
    const history = await fetchQuoteHistory(ticker, 5);
    const latest = history[history.length - 1];
    const entry = { ticker, price: latest.close, date: latest.date, fetchedAt: Date.now() };
    quoteCache.set(ticker, entry);
    return entry;
  } catch {
    return cached || null;
  }
}

async function markToMarketLive(positions) {
  if (!positions || !positions.length) return { positions: [], openMtM: 0, fetchedAt: new Date().toISOString() };
  const tickers = [...new Set(positions.map((p) => p.ticker))];
  const quotes = {};
  await Promise.all(
    tickers.map(async (t) => {
      quotes[t] = await getLatestQuote(t);
    })
  );
  let totalMtM = 0;
  const updated = positions.map((p) => {
    const q = quotes[p.ticker];
    if (!q) return p;
    const px = q.price;
    const pnl = p.direction === "LONG"
      ? (px - p.entryPrice) * p.shares
      : (p.entryPrice - px) * p.shares;
    const pct = p.direction === "LONG"
      ? (px - p.entryPrice) / p.entryPrice
      : (p.entryPrice - px) / p.entryPrice;
    totalMtM += p.allocatedCash + pnl;
    return {
      ...p,
      currentPrice: Number(px.toFixed(2)),
      currentPriceDate: q.date,
      unrealizedPnlDollar: Number(pnl.toFixed(2)),
      unrealizedPct: Number(pct.toFixed(4))
    };
  });
  return {
    positions: updated,
    openMtM: Number(totalMtM.toFixed(2)),
    fetchedAt: new Date().toISOString()
  };
}

function loadSimulation() {
  if (!fs.existsSync(SIMULATION_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SIMULATION_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function pearsonCorr(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : 0;
}

// Simulate a single (trade, entryDate, variant) and return a closed-trade record.
function simulateVariantTrade({ trade, history, entryIdx, scenarioKey, scenarioConfig, variant, computeVolatility }) {
  if (entryIdx < 60 || entryIdx > history.length - 5) return null;
  const entryRow = history[entryIdx];
  const entryPrice = entryRow.close;
  const priorBars = history.slice(Math.max(0, entryIdx - 60), entryIdx);
  if (priorBars.length < 30) return null;
  const annualizedVol = computeVolatility(priorBars);

  const closes = history.slice(0, entryIdx + 1).map((r) => r.close);
  const ma22 = closes.length >= 22 ? closes.slice(-22).reduce((a, b) => a + b, 0) / 22 : null;
  const ma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
  const close22dAgo = closes[closes.length - 23] ?? null;

  // Replicate buildTrade math
  const convictionBoost = trade.conviction * 0.0175;
  const heatBase = scenarioConfig?.heatBase ?? 65;
  const heatBoost = heatBase / 900;
  const volBoost = annualizedVol * 0.28;
  const upsidePctBase = clamp(0.04 + convictionBoost + heatBoost + volBoost, 0.06, 0.28);
  const downsidePctBase = clamp(0.025 + trade.conviction * 0.01 + annualizedVol * 0.12, 0.04, 0.16);

  const upsidePct = upsidePctBase * (variant.targetMult ?? 1);
  const downsidePct = downsidePctBase * (variant.stopMult ?? 1);

  const targetPrice = trade.direction === "LONG" ? entryPrice * (1 + upsidePct) : entryPrice * (1 - upsidePct);
  const stopPrice = trade.direction === "LONG" ? entryPrice * (1 - downsidePct) : entryPrice * (1 + downsidePct);
  const horizonDays = horizonToDays(trade.horizon);

  // Forward scan
  let exit = null;
  let maxFavorable = 0;
  let maxAdverse = 0;
  for (let j = entryIdx + 1; j < history.length; j++) {
    const row = history[j];
    const daysIn = Math.floor((Date.parse(row.date) - Date.parse(entryRow.date)) / 86400000);
    const movePct = trade.direction === "LONG"
      ? (row.close - entryPrice) / entryPrice
      : (entryPrice - row.close) / entryPrice;
    if (movePct > maxFavorable) maxFavorable = movePct;
    if (movePct < maxAdverse) maxAdverse = movePct;

    if (trade.direction === "LONG") {
      if (row.close >= targetPrice) { exit = { idx: j, date: row.date, close: row.close, reason: "target_hit", daysIn }; break; }
      if (row.close <= stopPrice) { exit = { idx: j, date: row.date, close: row.close, reason: "stop_hit", daysIn }; break; }
    } else {
      if (row.close <= targetPrice) { exit = { idx: j, date: row.date, close: row.close, reason: "target_hit", daysIn }; break; }
      if (row.close >= stopPrice) { exit = { idx: j, date: row.date, close: row.close, reason: "stop_hit", daysIn }; break; }
    }
    if (daysIn >= horizonDays) { exit = { idx: j, date: row.date, close: row.close, reason: "horizon_exceeded", daysIn }; break; }
  }
  if (!exit) return null;

  // Failure-mode classification: look 5 bars past exit to see if stop_overshoot or target_undershoot
  const lookahead = history.slice(exit.idx + 1, exit.idx + 6);
  let failureKind;
  if (exit.reason === "stop_hit") {
    const recovered = lookahead.some((r) =>
      trade.direction === "LONG" ? r.close > stopPrice * 1.005 : r.close < stopPrice * 0.995
    );
    if (recovered && exit.daysIn <= 7) failureKind = "stop_overshoot";
    else if (exit.daysIn <= 5) failureKind = "stop_hit_quick";
    else failureKind = "stop_hit_late";
  } else if (exit.reason === "target_hit") {
    const kept = lookahead.some((r) =>
      trade.direction === "LONG" ? r.close > exit.close * 1.03 : r.close < exit.close * 0.97
    );
    failureKind = kept ? "target_undershoot" : "target_hit";
  } else {
    failureKind = (trade.direction === "LONG"
      ? exit.close > entryPrice
      : exit.close < entryPrice) ? "horizon_drift_winner" : "horizon_drift_loser";
  }

  const realizedPct = trade.direction === "LONG"
    ? (exit.close - entryPrice) / entryPrice
    : (entryPrice - exit.close) / entryPrice;

  // Approximate at-entry component scores (uses live heat baseline since we don't have historical heat)
  const tradeForScoring = {
    ticker: trade.ticker,
    sector: trade.sector,
    direction: trade.direction,
    scenario: scenarioKey,
    conviction: trade.conviction,
    heat: heatBase,
    upsidePct,
    downsidePct,
    rewardToRisk: Number((upsidePct / downsidePct).toFixed(2)),
    annualizedVol,
    momentum22d: close22dAgo ? (entryPrice - close22dAgo) / close22dAgo : 0,
    pctVsMa22: ma22 ? (entryPrice - ma22) / ma22 : 0,
    pctVsMa50: ma50 ? (entryPrice - ma50) / ma50 : 0,
    catalyst: trade.catalyst,
    thesis: trade.thesis
  };
  const components = {
    conviction: scoreConviction(tradeForScoring),
    scenario: scoreScenario(tradeForScoring),
    riskReward: scoreRiskReward(tradeForScoring),
    trend: scoreTrend(tradeForScoring),
    volRegime: scoreVolRegime(tradeForScoring),
    catalyst: scoreCatalyst(tradeForScoring),
    memory: 50 // neutral during simulation; calibration corrects post-hoc
  };

  return {
    ticker: trade.ticker,
    sector: trade.sector,
    direction: trade.direction,
    scenario: scenarioKey,
    conviction: trade.conviction,
    variant: variant.name,
    stopMult: variant.stopMult ?? 1,
    targetMult: variant.targetMult ?? 1,
    entryDate: entryRow.date,
    entryPrice: Number(entryPrice.toFixed(2)),
    exitDate: exit.date,
    exitPrice: Number(exit.close.toFixed(2)),
    exitReason: exit.reason,
    failureKind,
    realizedPct: Number(realizedPct.toFixed(4)),
    holdingDays: exit.daysIn,
    maxFavorable: Number(maxFavorable.toFixed(4)),
    maxAdverse: Number(maxAdverse.toFixed(4)),
    outcome: realizedPct > 0 ? "win" : "loss",
    annualizedVol: Number(annualizedVol.toFixed(3)),
    components
  };
}

async function runDeepSimulation({ startDate = "2026-02-28", endDate, maxTrades = 12000, log = true, persist = true } = {}) {
  const { computeVolatility } = require("./quotes");
  const { scenarios } = loadConfig();

  const allTickers = new Set();
  for (const s of Object.values(scenarios)) {
    for (const t of s.trades) allTickers.add(t.ticker);
  }

  if (log) console.error(`[sim] fetching deep history for ${allTickers.size} tickers...`);
  const histories = {};
  await Promise.all(
    [...allTickers].map(async (ticker) => {
      try {
        histories[ticker] = await fetchQuoteHistory(ticker, 400);
      } catch (e) {
        histories[ticker] = null;
        if (log) console.error(`[sim] no history for ${ticker}: ${e.message}`);
      }
    })
  );
  if (log) console.error(`[sim] histories fetched, beginning walk-forward`);

  const flatTrades = [];
  for (const [scenarioKey, scenario] of Object.entries(scenarios)) {
    for (const trade of scenario.trades) {
      flatTrades.push({ ...trade, scenarioKey });
    }
  }

  const variants = [
    { name: "standard", stopMult: 1.0, targetMult: 1.0 },
    { name: "tight_stop", stopMult: 0.7, targetMult: 1.0 },
    { name: "wide_stop", stopMult: 1.3, targetMult: 1.0 },
    { name: "tight_target", stopMult: 1.0, targetMult: 0.7 },
    { name: "wide_target", stopMult: 1.0, targetMult: 1.3 }
  ];

  const startTs = Date.parse(startDate);
  const todayStr = new Date().toISOString().slice(0, 10);
  const endStr = endDate || todayStr;

  // Build sorted list of unique trading dates between startDate and endDate
  const tradingDates = new Set();
  for (const h of Object.values(histories)) {
    if (!h) continue;
    for (const row of h) {
      if (Date.parse(row.date) >= startTs && row.date <= endStr) {
        tradingDates.add(row.date);
      }
    }
  }
  const sortedDates = [...tradingDates].sort();
  if (log) console.error(`[sim] ${sortedDates.length} trading dates from ${sortedDates[0]} to ${sortedDates[sortedDates.length-1]}`);

  // Initialize fresh memory
  const memory = { buckets: {}, lastUpdatedAt: null, tradesObserved: 0 };
  const allClosed = [];
  let closedCount = 0;
  outer: for (const entryDate of sortedDates) {
    for (const trade of flatTrades) {
      const history = histories[trade.ticker];
      if (!history) continue;
      const entryIdx = history.findIndex((r) => r.date === entryDate);
      if (entryIdx < 0) continue;
      for (const variant of variants) {
        if (closedCount >= maxTrades) break outer;
        const result = simulateVariantTrade({
          trade,
          history,
          entryIdx,
          scenarioKey: trade.scenarioKey,
          scenarioConfig: scenarios[trade.scenarioKey],
          variant,
          computeVolatility
        });
        if (!result) continue;
        updateMemoryWith(memory, result);
        allClosed.push(result);
        closedCount += 1;
      }
    }
  }
  if (log) console.error(`[sim] ${closedCount} trades closed, building calibration`);

  if (persist) saveMemory(memory);

  const calibration = buildCalibration(allClosed);
  if (persist) fs.writeFileSync(CALIBRATION_PATH, JSON.stringify(calibration, null, 2));

  // Aggregate failure-mode stats
  const failureMode = {};
  const variantStats = {};
  for (const v of variants) variantStats[v.name] = { n: 0, wins: 0, totalPnl: 0 };
  for (const t of allClosed) {
    failureMode[t.failureKind] = (failureMode[t.failureKind] || 0) + 1;
    const vs = variantStats[t.variant];
    vs.n += 1;
    if (t.realizedPct > 0) vs.wins += 1;
    vs.totalPnl += t.realizedPct;
  }
  for (const k of Object.keys(variantStats)) {
    const v = variantStats[k];
    v.winRate = v.n ? Number((v.wins / v.n).toFixed(3)) : 0;
    v.avgPnlPct = v.n ? Number((v.totalPnl / v.n).toFixed(4)) : 0;
    delete v.totalPnl;
  }

  const wins = allClosed.filter((t) => t.realizedPct > 0).length;
  const sumPnl = allClosed.reduce((s, t) => s + t.realizedPct, 0);

  const report = {
    runAt: new Date().toISOString(),
    startDate,
    endDate: todayStr,
    tradingDays: sortedDates.length,
    closedCount,
    overallWinRate: closedCount ? Number((wins / closedCount).toFixed(3)) : 0,
    overallAvgPnlPct: closedCount ? Number((sumPnl / closedCount).toFixed(4)) : 0,
    failureMode,
    variantStats,
    recalibratedBuckets: calibration.perBucket
      ? Object.keys(calibration.perBucket).length
      : 0,
    topRecalibrationSignals: extractTopSignals(calibration, 12),
    memorySummary: summarizeMemory(memory)
  };
  if (persist) fs.writeFileSync(SIMULATION_PATH, JSON.stringify(report, null, 2));

  return { ...report, calibration, samplesByBucket: undefined };
}

function buildCalibration(closedTrades) {
  const buckets = {};
  for (const t of closedTrades) {
    const keys = [
      `scenario:${t.scenario}|sector:${t.sector}|direction:${t.direction}`,
      `sector:${t.sector}|direction:${t.direction}`,
      `scenario:${t.scenario}|direction:${t.direction}`
    ];
    for (const key of keys) {
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(t);
    }
  }

  const perBucket = {};
  for (const [key, trades] of Object.entries(buckets)) {
    if (trades.length < 15) continue;
    const standard = trades.filter((t) => t.variant === "standard");
    const realized = trades.map((t) => t.realizedPct);
    const componentCorrs = {};
    for (const comp of Object.keys(COMPONENT_WEIGHTS)) {
      const xs = trades.map((t) => t.components[comp] ?? 50);
      componentCorrs[comp] = Number(pearsonCorr(xs, realized).toFixed(3));
    }

    // Convert correlations to weights: positives become positive weight, negatives go to floor
    const floor = 0.03;
    const rawWeights = {};
    let posSum = 0;
    for (const [comp, corr] of Object.entries(componentCorrs)) {
      rawWeights[comp] = corr > 0 ? corr : 0;
      if (corr > 0) posSum += corr;
    }
    const dataDriven = {};
    if (posSum > 0) {
      for (const comp of Object.keys(COMPONENT_WEIGHTS)) {
        dataDriven[comp] = rawWeights[comp] > 0 ? (rawWeights[comp] / posSum) * (1 - floor * 7) + floor : floor;
      }
    } else {
      for (const comp of Object.keys(COMPONENT_WEIGHTS)) dataDriven[comp] = COMPONENT_WEIGHTS[comp];
    }
    // Blend with defaults 60/40
    const blended = {};
    for (const comp of Object.keys(COMPONENT_WEIGHTS)) {
      const dflt = COMPONENT_WEIGHTS[comp];
      const cand = 0.6 * dataDriven[comp] + 0.4 * dflt;
      // Cap deviation from default at ±0.10
      blended[comp] = clamp(cand, dflt - 0.10, dflt + 0.10);
    }
    // Renormalize to 1.0
    const sum = Object.values(blended).reduce((a, b) => a + b, 0);
    const finalWeights = {};
    for (const c of Object.keys(blended)) finalWeights[c] = Number((blended[c] / sum).toFixed(3));

    // Stop/target multipliers from standard-variant trades' failure rates
    const stdN = standard.length;
    let stopMult = 1.0;
    let targetMult = 1.0;
    if (stdN >= 10) {
      const stopOvershoot = standard.filter((t) => t.failureKind === "stop_overshoot").length;
      const targetUndershoot = standard.filter((t) => t.failureKind === "target_undershoot").length;
      const stopOvershootRate = stopOvershoot / stdN;
      const targetUndershootRate = targetUndershoot / stdN;
      if (stopOvershootRate > 0.25) stopMult = Math.min(1.6, 1 + (stopOvershootRate - 0.25) * 2);
      if (targetUndershootRate > 0.30) targetMult = Math.min(1.5, 1 + (targetUndershootRate - 0.30) * 1.5);
    }

    // Variant-based override: if widening stop measurably helps in this bucket, increase stopMult
    const wide = trades.filter((t) => t.variant === "wide_stop");
    if (wide.length >= 10 && standard.length >= 10) {
      const wideWinRate = wide.filter((t) => t.realizedPct > 0).length / wide.length;
      const stdWinRate = standard.filter((t) => t.realizedPct > 0).length / standard.length;
      if (wideWinRate - stdWinRate > 0.05) {
        stopMult = Math.max(stopMult, 1.3);
      }
    }
    const wideTarget = trades.filter((t) => t.variant === "wide_target");
    if (wideTarget.length >= 10 && standard.length >= 10) {
      const wideAvg = wideTarget.reduce((s, t) => s + t.realizedPct, 0) / wideTarget.length;
      const stdAvg = standard.reduce((s, t) => s + t.realizedPct, 0) / standard.length;
      if (wideAvg - stdAvg > 0.02) {
        targetMult = Math.max(targetMult, 1.3);
      }
    }

    const stdWins = standard.filter((t) => t.realizedPct > 0).length;
    perBucket[key] = {
      n: trades.length,
      nStandard: stdN,
      componentCorrelations: componentCorrs,
      weights: finalWeights,
      stopMult: Number(stopMult.toFixed(2)),
      targetMult: Number(targetMult.toFixed(2)),
      standardWinRate: stdN ? Number((stdWins / stdN).toFixed(3)) : 0,
      standardAvgPnl: stdN ? Number((standard.reduce((s, t) => s + t.realizedPct, 0) / stdN).toFixed(4)) : 0
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    fromTrades: closedTrades.length,
    globalWeights: COMPONENT_WEIGHTS,
    perBucket
  };
}

function filterCalibration(cal, { weights = true, stopMult = true, targetMult = true } = {}) {
  if (!cal?.perBucket) return cal;
  const out = { ...cal, perBucket: {} };
  for (const [k, b] of Object.entries(cal.perBucket)) {
    const nb = { ...b };
    if (!weights) nb.weights = undefined;
    if (!stopMult) nb.stopMult = undefined;
    if (!targetMult) nb.targetMult = undefined;
    out.perBucket[k] = nb;
  }
  return out;
}

async function replayLiveBook({
  startDate = "2026-02-28",
  endDate,
  useCalibration = true,
  calibration: explicitCalibration,
  histories: preFetchedHistories,
  startingCash = STARTING_CASH,
  log = false
} = {}) {
  const { computeVolatility } = require("./quotes");
  const { scenarios } = loadConfig();

  const allTickers = new Set();
  for (const s of Object.values(scenarios)) for (const t of s.trades) allTickers.add(t.ticker);
  const histories = preFetchedHistories || {};
  if (!preFetchedHistories) {
    await Promise.all(
      [...allTickers].map(async (ticker) => {
        try { histories[ticker] = await fetchQuoteHistory(ticker, 400); }
        catch { histories[ticker] = null; }
      })
    );
  }

  const calibrationOverride = explicitCalibration !== undefined
    ? explicitCalibration
    : (useCalibration ? loadCalibration() : null);
  const memory = { buckets: {}, lastUpdatedAt: null, tradesObserved: 0 };

  const startTs = Date.parse(startDate);
  const endTs = endDate ? Date.parse(endDate) : Number.POSITIVE_INFINITY;
  const allDates = new Set();
  for (const h of Object.values(histories)) {
    if (!h) continue;
    for (const r of h) {
      const ts = Date.parse(r.date);
      if (ts >= startTs && ts <= endTs) allDates.add(r.date);
    }
  }
  const sortedDates = [...allDates].sort();

  let cash = startingCash;
  const openPositions = [];
  const closedTrades = [];
  const equityCurve = [];

  function buildCandidate(trade, scenario, history, idx) {
    if (idx < 60 || idx >= history.length) return null;
    const entryRow = history[idx];
    const entryPrice = entryRow.close;
    const priorBars = history.slice(Math.max(0, idx - 60), idx);
    if (priorBars.length < 30) return null;
    const annualizedVol = computeVolatility(priorBars);
    const closes = history.slice(0, idx + 1).map((r) => r.close);
    const ma22 = closes.length >= 22 ? closes.slice(-22).reduce((a, b) => a + b, 0) / 22 : null;
    const ma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    const close22dAgo = closes[closes.length - 23] ?? null;
    const convictionBoost = trade.conviction * 0.0175;
    const heatBoost = scenario.heatBase / 900;
    const volBoost = annualizedVol * 0.28;
    const upsidePct = clamp(0.04 + convictionBoost + heatBoost + volBoost, 0.06, 0.28);
    const downsidePct = clamp(0.025 + trade.conviction * 0.01 + annualizedVol * 0.12, 0.04, 0.16);
    return {
      ...trade,
      scenario: scenario.key,
      scenarioTitle: scenario.title,
      price: entryPrice,
      heat: scenario.heatBase,
      annualizedVol,
      upsidePct,
      downsidePct,
      rewardToRisk: Number((upsidePct / downsidePct).toFixed(2)),
      momentum22d: close22dAgo ? (entryPrice - close22dAgo) / close22dAgo : 0,
      pctVsMa22: ma22 ? (entryPrice - ma22) / ma22 : 0,
      pctVsMa50: ma50 ? (entryPrice - ma50) / ma50 : 0,
      targetPrice: trade.direction === "LONG" ? entryPrice * (1 + upsidePct) : entryPrice * (1 - upsidePct),
      stopPrice: trade.direction === "LONG" ? entryPrice * (1 - downsidePct) : entryPrice * (1 + downsidePct)
    };
  }

  for (const today of sortedDates) {
    // 1. EXITS first — check every open position against today's close
    const stillOpen = [];
    for (const pos of openPositions) {
      const h = histories[pos.ticker];
      const idx = h ? h.findIndex((r) => r.date === today) : -1;
      if (idx < 0) { stillOpen.push(pos); continue; }
      const px = h[idx].close;
      const heldDays = Math.floor((Date.parse(today) - Date.parse(pos.entryDate)) / 86400000);
      let exit = null;
      if (pos.direction === "LONG") {
        if (px >= pos.targetPrice) exit = { reason: "target_hit", price: px };
        else if (px <= pos.stopPrice) exit = { reason: "stop_hit", price: px };
      } else {
        if (px <= pos.targetPrice) exit = { reason: "target_hit", price: px };
        else if (px >= pos.stopPrice) exit = { reason: "stop_hit", price: px };
      }
      if (!exit && heldDays >= pos.horizonDays) exit = { reason: "horizon_exceeded", price: px };
      if (!exit) { stillOpen.push(pos); continue; }
      const pnlDollar = pos.direction === "LONG"
        ? (exit.price - pos.entryPrice) * pos.shares
        : (pos.entryPrice - exit.price) * pos.shares;
      const pct = pos.direction === "LONG"
        ? (exit.price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - exit.price) / pos.entryPrice;
      cash += pos.allocatedCash + pnlDollar;
      const closed = {
        ticker: pos.ticker,
        sector: pos.sector,
        direction: pos.direction,
        scenario: pos.scenario,
        conviction: pos.conviction,
        entryDate: pos.entryDate,
        entryPrice: pos.entryPrice,
        exitDate: today,
        exitPrice: Number(exit.price.toFixed(2)),
        exitReason: exit.reason,
        allocatedCash: pos.allocatedCash,
        realizedPnlDollar: Number(pnlDollar.toFixed(2)),
        realizedPct: Number(pct.toFixed(4)),
        holdingDays: heldDays,
        outcome: pct > 0 ? "win" : "loss",
        scoreAtEntry: pos.scoreAtEntry,
        stopMultAtEntry: pos.stopMultAtEntry,
        targetMultAtEntry: pos.targetMultAtEntry
      };
      closedTrades.push(closed);
      updateMemoryWith(memory, closed);
    }
    openPositions.length = 0;
    openPositions.push(...stillOpen);

    // 2. ENTRIES — fill slots up to MAX_OPEN_POSITIONS
    if (openPositions.length < MAX_OPEN_POSITIONS) {
      const candidates = [];
      for (const [scenarioKey, scenario] of Object.entries(scenarios)) {
        for (const trade of scenario.trades) {
          const h = histories[trade.ticker];
          if (!h) continue;
          const idx = h.findIndex((r) => r.date === today);
          if (idx < 0) continue;
          const c = buildCandidate(trade, { ...scenario, key: scenarioKey }, h, idx);
          if (c) candidates.push(c);
        }
      }
      const { picks } = pickNewPositions({
        candidates,
        openPositions,
        cash,
        memory,
        maxNew: MAX_OPEN_POSITIONS - openPositions.length,
        calibrationOverride
      });
      for (const pick of picks) {
        const mult = calibrationOverride
          ? getCalibratedMultipliers(pick, calibrationOverride)
          : { stopMult: 1, targetMult: 1 };
        const upsidePct = pick.upsidePct * mult.targetMult;
        const downsidePct = pick.downsidePct * mult.stopMult;
        const targetPrice = pick.direction === "LONG" ? pick.price * (1 + upsidePct) : pick.price * (1 - upsidePct);
        const stopPrice = pick.direction === "LONG" ? pick.price * (1 - downsidePct) : pick.price * (1 + downsidePct);
        const shares = pick.allocatedCash / pick.price;
        cash -= pick.allocatedCash;
        openPositions.push({
          ticker: pick.ticker,
          scenario: pick.scenario,
          scenarioTitle: pick.scenarioTitle,
          sector: pick.sector,
          direction: pick.direction,
          conviction: pick.conviction,
          entryDate: today,
          entryPrice: Number(pick.price.toFixed(2)),
          shares: Number(shares.toFixed(6)),
          allocatedCash: pick.allocatedCash,
          targetPrice: Number(targetPrice.toFixed(2)),
          stopPrice: Number(stopPrice.toFixed(2)),
          horizonDays: horizonToDays(pick.horizon),
          scoreAtEntry: pick.score.finalScore,
          stopMultAtEntry: Number(mult.stopMult.toFixed(2)),
          targetMultAtEntry: Number(mult.targetMult.toFixed(2))
        });
      }
    }

    // 3. Mark to market for equity curve
    let openMtM = 0;
    for (const pos of openPositions) {
      const h = histories[pos.ticker];
      const idx = h ? h.findIndex((r) => r.date === today) : -1;
      const px = idx >= 0 ? h[idx].close : pos.entryPrice;
      const pnl = pos.direction === "LONG"
        ? (px - pos.entryPrice) * pos.shares
        : (pos.entryPrice - px) * pos.shares;
      openMtM += pos.allocatedCash + pnl;
    }
    const totalEquity = cash + openMtM;
    equityCurve.push({
      date: today,
      cash: Number(cash.toFixed(2)),
      openMtM: Number(openMtM.toFixed(2)),
      totalEquity: Number(totalEquity.toFixed(2))
    });
  }

  const finalEquity = equityCurve[equityCurve.length - 1]?.totalEquity ?? startingCash;
  const peak = equityCurve.reduce((mx, p) => Math.max(mx, p.totalEquity), startingCash);
  const trough = equityCurve.reduce((mn, p) => Math.min(mn, p.totalEquity), startingCash);
  const maxDrawdown = (trough - peak) / peak;

  return {
    useCalibration,
    startDate,
    endDate: sortedDates[sortedDates.length - 1],
    tradingDays: sortedDates.length,
    startingEquity: startingCash,
    finalEquity: Number(finalEquity.toFixed(2)),
    pctReturn: Number(((finalEquity - startingCash) / startingCash).toFixed(4)),
    peakEquity: Number(peak.toFixed(2)),
    troughEquity: Number(trough.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(4)),
    closedCount: closedTrades.length,
    winCount: closedTrades.filter((t) => t.outcome === "win").length,
    winRate: closedTrades.length ? Number((closedTrades.filter((t) => t.outcome === "win").length / closedTrades.length).toFixed(3)) : 0,
    openCount: openPositions.length,
    equityCurve,
    closedTrades,
    finalOpenPositions: openPositions,
    exitReasonCounts: closedTrades.reduce((acc, t) => { acc[t.exitReason] = (acc[t.exitReason] || 0) + 1; return acc; }, {})
  };
}

// ---- Path 3: Tournament selection for global weights ----

function renormalizeWeights(weights) {
  const components = Object.keys(weights);
  const sum = components.reduce((s, c) => s + weights[c], 0);
  if (sum <= 0) return { ...COMPONENT_WEIGHTS };
  const out = {};
  for (const c of components) out[c] = weights[c] / sum;
  return out;
}

function perturbWeights(weights, rng = Math.random) {
  const components = Object.keys(weights);
  const w = { ...weights };
  const numShifts = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < numShifts; i++) {
    const comp = components[Math.floor(rng() * components.length)];
    const delta = (rng() - 0.5) * 0.16; // up to ±0.08
    w[comp] = Math.max(0.03, Math.min(0.32, w[comp] + delta));
  }
  return renormalizeWeights(w);
}

function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

async function runTournament({
  windows,
  candidateCount = 50,
  histories: preFetchedHistories,
  log = true,
  seed = 42
} = {}) {
  if (!windows || !windows.length) {
    windows = [
      { label: "Feb28-Mar31", start: "2026-02-28", end: "2026-03-31" },
      { label: "Mar15-Apr30", start: "2026-03-15", end: "2026-04-30" },
      { label: "Apr01-May15", start: "2026-04-01", end: "2026-05-15" }
    ];
  }

  // Pre-fetch histories once and reuse across all replays
  let histories = preFetchedHistories;
  if (!histories) {
    const { scenarios } = loadConfig();
    const tickers = new Set();
    for (const s of Object.values(scenarios)) for (const t of s.trades) tickers.add(t.ticker);
    histories = {};
    if (log) console.error(`[tournament] fetching histories for ${tickers.size} tickers...`);
    await Promise.all(
      [...tickers].map(async (ticker) => {
        try { histories[ticker] = await fetchQuoteHistory(ticker, 400); }
        catch { histories[ticker] = null; }
      })
    );
  }

  const rng = makeRng(seed);
  const candidates = [{ label: "default", weights: { ...COMPONENT_WEIGHTS } }];
  for (let i = 0; i < candidateCount - 1; i++) {
    candidates.push({ label: `cand_${i + 1}`, weights: perturbWeights(COMPONENT_WEIGHTS, rng) });
  }

  if (log) console.error(`[tournament] evaluating ${candidates.length} candidates × ${windows.length} windows...`);

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const winReturns = [];
    for (const w of windows) {
      const run = await replayLiveBook({
        startDate: w.start,
        endDate: w.end,
        histories,
        calibration: { globalWeights: cand.weights, perBucket: {} }
      });
      winReturns.push({
        window: w.label || `${w.start}_${w.end}`,
        pctReturn: run.pctReturn,
        finalEquity: run.finalEquity,
        closedCount: run.closedCount,
        winRate: run.winRate
      });
    }
    const avg = winReturns.reduce((s, r) => s + r.pctReturn, 0) / winReturns.length;
    const min = Math.min(...winReturns.map((r) => r.pctReturn));
    const max = Math.max(...winReturns.map((r) => r.pctReturn));
    // Sharpe-ish: avg / spread (penalize candidates with wild swings)
    const spread = max - min;
    const composite = avg - 0.3 * spread;
    results.push({
      label: cand.label,
      weights: cand.weights,
      avgReturn: avg,
      minReturn: min,
      maxReturn: max,
      composite,
      windows: winReturns
    });
    if (log && (i + 1) % 10 === 0) console.error(`[tournament] ${i + 1}/${candidates.length}`);
  }

  // Rank by composite score
  results.sort((a, b) => b.composite - a.composite);
  return { results, windows, candidateCount: candidates.length };
}

function applyTournamentGate(tournamentResults, options = {}) {
  const {
    // Either: beat baseline avg by 0.3pp AND no window much worse
    minAvgImprovement = 0.003,
    minWindowFloor = -0.005,
    // OR: Pareto-dominate baseline (no window worse, at least one window better)
    paretoMinImprovement = 0.001
  } = options;

  const baselineEntry = tournamentResults.results.find((r) => r.label === "default");
  if (!baselineEntry) return { accepted: false, reason: "no baseline candidate found" };

  const ranked = [...tournamentResults.results].sort((a, b) => b.avgReturn - a.avgReturn);
  for (const cand of ranked) {
    if (cand.label === "default") continue;
    const improvement = cand.avgReturn - baselineEntry.avgReturn;
    if (improvement <= 0) continue;

    // Per-window deltas vs baseline
    const winDeltas = cand.windows.map((w, i) => w.pctReturn - baselineEntry.windows[i].pctReturn);
    const worstDelta = Math.min(...winDeltas);
    const bestDelta = Math.max(...winDeltas);

    const isPareto = worstDelta >= 0 && bestDelta > 0 && improvement >= paretoMinImprovement;
    const meetsHeadlineGate = improvement >= minAvgImprovement && worstDelta >= minWindowFloor;

    if (isPareto || meetsHeadlineGate) {
      return {
        accepted: true,
        winner: cand,
        baseline: baselineEntry,
        improvement,
        worstWindowDelta: worstDelta,
        bestWindowDelta: bestDelta,
        gateReason: isPareto ? "pareto_dominant" : "headline_avg_gate"
      };
    }
  }
  return { accepted: false, baseline: baselineEntry, reason: "no candidate cleared the gate" };
}

function extractTopSignals(calibration, limit = 12) {
  const signals = [];
  for (const [bucket, data] of Object.entries(calibration.perBucket || {})) {
    if (data.stopMult > 1.05) {
      signals.push({
        bucket,
        n: data.n,
        signal: "widen_stops",
        magnitude: data.stopMult,
        action: `Widen stop ×${data.stopMult.toFixed(2)} — wide-stop variant outperformed in ${data.n} trades`
      });
    }
    if (data.targetMult > 1.05) {
      signals.push({
        bucket,
        n: data.n,
        signal: "widen_targets",
        magnitude: data.targetMult,
        action: `Widen target ×${data.targetMult.toFixed(2)} — winners run further on average`
      });
    }
    // Surface biggest weight shifts vs defaults
    if (data.weights) {
      const shifts = Object.entries(data.weights)
        .map(([c, w]) => ({ c, delta: w - (COMPONENT_WEIGHTS[c] || 0) }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      const top = shifts[0];
      if (top && Math.abs(top.delta) >= 0.05) {
        signals.push({
          bucket,
          n: data.n,
          signal: top.delta > 0 ? "lean_into_factor" : "lean_away_factor",
          magnitude: top.delta,
          action: `${top.delta > 0 ? "Lean into" : "Down-weight"} '${top.c}' (${top.delta > 0 ? "+" : ""}${(top.delta * 100).toFixed(1)} pts vs default)`
        });
      }
    }
  }
  return signals.sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude)).slice(0, limit);
}

async function backfillMemory({ daysBack = [14, 30, 60, 90, 120, 150] } = {}) {
  const { computeVolatility } = require("./quotes");
  const { scenarios } = loadConfig();
  const memory = loadMemory();

  const flatTrades = [];
  for (const [scenarioKey, scenario] of Object.entries(scenarios)) {
    for (const trade of scenario.trades) {
      flatTrades.push({ ...trade, scenario: scenarioKey });
    }
  }

  const histories = {};
  for (const trade of flatTrades) {
    if (histories[trade.ticker]) continue;
    try {
      histories[trade.ticker] = await fetchQuoteHistory(trade.ticker);
    } catch {
      histories[trade.ticker] = null;
    }
  }

  const today = new Date();
  let opened = 0;
  let closed = 0;
  const exitReasons = { target_hit: 0, stop_hit: 0, horizon_exceeded: 0 };

  for (const daysAgo of daysBack) {
    const entryDateTarget = new Date(today.getTime() - daysAgo * 86400000)
      .toISOString()
      .slice(0, 10);

    for (const trade of flatTrades) {
      const history = histories[trade.ticker];
      if (!history || history.length < 22) continue;

      // Pick the closest historical bar at or after entryDateTarget
      const entryIdx = history.findIndex((row) => row.date >= entryDateTarget);
      if (entryIdx < 0 || entryIdx > history.length - 4) continue;
      const entryRow = history[entryIdx];
      const entryPrice = entryRow.close;

      // Realized vol from the prior 60 bars
      const priorBars = history.slice(Math.max(0, entryIdx - 60), entryIdx);
      if (priorBars.length < 10) continue;
      const annualizedVol = computeVolatility(priorBars);

      // Build target/stop using current trade conviction and historical vol
      const convictionBoost = trade.conviction * 0.0175;
      const heatBoost = 70 / 900;
      const volBoost = annualizedVol * 0.28;
      const upsidePct = clamp(0.04 + convictionBoost + heatBoost + volBoost, 0.06, 0.28);
      const downsidePct = clamp(0.025 + trade.conviction * 0.01 + annualizedVol * 0.12, 0.04, 0.16);

      const targetPrice = trade.direction === "LONG" ? entryPrice * (1 + upsidePct) : entryPrice * (1 - upsidePct);
      const stopPrice = trade.direction === "LONG" ? entryPrice * (1 - downsidePct) : entryPrice * (1 + downsidePct);
      const horizonDays = horizonToDays(trade.horizon);

      // Scan forward from entry for exit
      const forward = history.slice(entryIdx + 1);
      let exit = null;
      for (const row of forward) {
        const ageDays = Math.floor((Date.parse(row.date) - Date.parse(entryRow.date)) / 86400000);
        if (trade.direction === "LONG") {
          if (row.close >= targetPrice) { exit = { ...row, reason: "target_hit" }; break; }
          if (row.close <= stopPrice) { exit = { ...row, reason: "stop_hit" }; break; }
        } else {
          if (row.close <= targetPrice) { exit = { ...row, reason: "target_hit" }; break; }
          if (row.close >= stopPrice) { exit = { ...row, reason: "stop_hit" }; break; }
        }
        if (ageDays >= horizonDays) { exit = { ...row, reason: "horizon_exceeded" }; break; }
      }
      if (!exit) continue;

      opened += 1;
      closed += 1;
      exitReasons[exit.reason] = (exitReasons[exit.reason] || 0) + 1;

      const pct = trade.direction === "LONG"
        ? (exit.close - entryPrice) / entryPrice
        : (entryPrice - exit.close) / entryPrice;

      const closedRecord = {
        ticker: trade.ticker,
        sector: trade.sector,
        direction: trade.direction,
        scenario: trade.scenario,
        conviction: trade.conviction,
        entryDate: entryRow.date,
        entryPrice,
        exitDate: exit.date,
        exitPrice: exit.close,
        exitReason: exit.reason,
        realizedPct: pct,
        outcome: pct > 0 ? "win" : "loss"
      };
      updateMemoryWith(memory, closedRecord);
    }
  }

  saveMemory(memory);
  return {
    action: "backfill",
    daysBack,
    tradesEvaluated: flatTrades.length * daysBack.length,
    tradesClosed: closed,
    exitReasons,
    memorySummary: summarizeMemory(memory)
  };
}

module.exports = {
  STARTING_CASH,
  MAX_OPEN_POSITIONS,
  isUsMarketDay,
  loadState,
  loadMemory,
  loadCalibration,
  loadSimulation,
  runCycle,
  summarizeMemory,
  resetAll,
  scoreCandidate,
  bucketKeysFor,
  backfillMemory,
  runDeepSimulation,
  replayLiveBook,
  filterCalibration,
  buildCalibration,
  runTournament,
  applyTournamentGate,
  markToMarketLive,
  getLatestQuote
};
