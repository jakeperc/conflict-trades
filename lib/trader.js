const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");
const { buildPayload } = require("./scenarios");
const { fetchQuoteHistory } = require("./quotes");

const ROOT = path.join(__dirname, "..");
const STATE_PATH = path.join(ROOT, "data", "trader", "state.json");
const MEMORY_PATH = path.join(ROOT, "data", "trader", "memory.json");
const LOG_PATH = path.join(ROOT, "data", "trader", "log.jsonl");

const STARTING_CASH = 10000;
const MAX_OPEN_POSITIONS = 5;
const BASE_POSITION_SIZE = 1800; // $1.8K equal weight
const HIGH_CONFIDENCE_SIZE = 2400; // Bump on high finalScore + memory edge
const MIN_CONFIDENCE_TO_ENTER = 0.55; // finalScore >= 55 / 100
const SIZE_BOOST_FLOOR = 0.72; // finalScore >= 72 to get the larger size
const CASH_RESERVE_PCT = 0.1;

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
  const rawScore = Object.entries(components).reduce(
    (sum, [key, val]) => sum + val * COMPONENT_WEIGHTS[key],
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
    weights: COMPONENT_WEIGHTS,
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
      memory.buckets[key] = { n: 0, wins: 0, totalPnlPct: 0, lastUpdated: null };
    }
    const b = memory.buckets[key];
    b.n += 1;
    if (isWin) b.wins += 1;
    b.totalPnlPct += closedTrade.realizedPct;
    b.lastUpdated = closedTrade.exitDate || new Date().toISOString().slice(0, 10);
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

function pickNewPositions({ candidates, openPositions, cash, memory, maxNew }) {
  const openTickers = new Set(openPositions.map((p) => p.ticker));
  // Score everything first against the current portfolio for diversification
  const scored = candidates
    .map((t) => ({ ...t, score: scoreCandidate(t, memory, { openPositions }) }))
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
    const rescored = scoreCandidate(candidate, memory, { openPositions: simulatedOpen });
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

  for (const pick of picks) {
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
      targetPrice: Number(pick.targetPrice.toFixed(2)),
      stopPrice: Number(pick.stopPrice.toFixed(2)),
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
      memoryAdjustmentsAtEntry: pick.score.memoryAdjustments
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
  for (const p of [STATE_PATH, MEMORY_PATH, LOG_PATH]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  return { reset: true };
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
  loadState,
  loadMemory,
  runCycle,
  summarizeMemory,
  resetAll,
  scoreCandidate,
  bucketKeysFor,
  backfillMemory
};
