// Unit tests for the paper trader's decision logic (lib/trader.js).
// No network, no files written: every function here is called with explicit
// inputs, and scoreCandidate gets `calibration: null` so it never reads
// data/trader/calibration.json. Run with `npm run test:lib` (node --test).

const test = require("node:test");
const assert = require("node:assert/strict");
const trader = require("../lib/trader.js");

const {
  isUsMarketDay,
  quoteHealth,
  assertQuoteHealth,
  scoreCandidate,
  bucketKeysFor,
  filterCalibration,
  applyTournamentGate,
} = trader;

const EMPTY_MEMORY = { buckets: {} };

function trade(over = {}) {
  return {
    ticker: "LMT",
    sector: "Defense",
    direction: "LONG",
    scenario: "iran",
    conviction: 4,
    heat: 75,
    upsidePct: 0.12,
    rewardToRisk: 2,
    momentum22d: 0.04,
    pctVsMa22: 0.02,
    pctVsMa50: 0.05,
    annualizedVol: 0.28,
    catalyst: "Patriot replenishment contract award expected this quarter",
    ...over,
  };
}

const score = (t, ctx = {}) => scoreCandidate(t, EMPTY_MEMORY, { calibration: null, ...ctx });

// ---- market calendar ----------------------------------------------------

test("weekends are not market days", () => {
  assert.equal(isUsMarketDay("2026-11-14"), false); // Saturday
  assert.equal(isUsMarketDay("2026-11-15"), false); // Sunday
  assert.equal(isUsMarketDay("2026-11-16"), true); // Monday
});

test("NYSE holidays are not market days", () => {
  for (const d of ["2026-11-26", "2026-12-25", "2027-01-01", "2027-04-02", "2027-07-05", "2027-12-24"]) {
    assert.equal(isUsMarketDay(d), false, d);
  }
});

test("the holiday calendar reaches past the end of next year's first quarter", () => {
  // Tripwire, not a behaviour test: the holiday list is typed by hand and
  // ends at 2027-12-24. Without a newer year, every 2028 holiday would read as
  // a trading day. This fails from October of the last listed year, giving a
  // quarter's notice to add the next NYSE schedule.
  const src = require("fs").readFileSync(require.resolve("../lib/trader.js"), "utf8");
  const years = [...src.matchAll(/"(\d{4})-\d{2}-\d{2}"/g)].map((m) => Number(m[1]));
  const lastYear = Math.max(...years);
  const now = new Date();
  const deadline = new Date(Date.UTC(lastYear, 9, 1)); // 1 October of the last listed year
  assert.ok(now < deadline, `US_MARKET_HOLIDAYS ends in ${lastYear}; add the ${lastYear + 1} NYSE holidays`);
});

// ---- quote-health gate --------------------------------------------------

function payload(sources) {
  return { scenarios: { a: { trades: sources.map((s, i) => ({ ticker: `T${i}`, priceSource: s })) } } };
}

test("quoteHealth counts trades without a live quote", () => {
  const h = quoteHealth(payload(["Live quote", "Live quote", "Fallback", "Live quote"]));
  assert.deepEqual(h, { total: 4, nonLive: 1, share: 0.25, tickers: ["T2"] });
});

test("the gate passes at the 10% limit and refuses above it, leaving state untouched", () => {
  const ten = payload([...Array(9).fill("Live quote"), "Fallback"]);
  assert.equal(assertQuoteHealth(ten).share, 0.1);
  const eleven = payload([...Array(8).fill("Live quote"), "Fallback", "Fallback"]);
  assert.throws(() => assertQuoteHealth(eleven), /Quote-health gate: 2\/10 .*No trades made/);
});

test("a payload with no trades is treated as fully unhealthy", () => {
  assert.equal(quoteHealth({ scenarios: {} }).share, 1);
  assert.throws(() => assertQuoteHealth({}), /Quote-health gate/);
});

// ---- candidate scoring ---------------------------------------------------

test("default component weights sum to 1, so the score stays on a 0-100 scale", () => {
  const s = score(trade());
  const sum = Object.values(s.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
  assert.ok(s.finalScore >= 0 && s.finalScore <= 100);
  assert.ok(Math.abs(s.confidence * 100 - s.finalScore) <= 0.05, "confidence is the final score over 100");
});

// scoreRiskReward has no lower clamp: it relies on lib/scenarios.js, which
// clamps upsidePct to 0.07-0.40 (or null when there is no price). The
// extremes below stay inside that domain; a negative upside would score
// below 0 (see the README's testing notes).
test("every component stays within 0-100 for extreme inputs in the scenario domain", () => {
  const extremes = [
    trade({ conviction: 0, heat: 0, upsidePct: null, rewardToRisk: null, momentum22d: -1, pctVsMa22: -1, pctVsMa50: -1, annualizedVol: 5, catalyst: "" }),
    trade({ conviction: 1, heat: 30, upsidePct: 0.07, rewardToRisk: 0.1, momentum22d: null, pctVsMa22: null, annualizedVol: undefined }),
    trade({ conviction: 9, heat: 200, upsidePct: 10, rewardToRisk: 50, momentum22d: 1, pctVsMa22: 1, pctVsMa50: 1, annualizedVol: 0 }),
  ];
  for (const t of extremes) {
    const s = score(t);
    for (const [k, v] of Object.entries(s.components)) {
      assert.ok(v >= 0 && v <= 100, `${k}=${v}`);
    }
    assert.ok(s.finalScore >= 0 && s.finalScore <= 100);
  }
});

test("trend scoring is symmetric between LONG and SHORT", () => {
  const long = score(trade({ direction: "LONG", momentum22d: 0.08, pctVsMa22: 0.05, pctVsMa50: 0.04 }));
  const short = score(trade({ direction: "SHORT", momentum22d: -0.08, pctVsMa22: -0.05, pctVsMa50: -0.04 }));
  assert.equal(long.components.trend, short.components.trend);
  const against = score(trade({ direction: "SHORT", momentum22d: 0.08, pctVsMa22: 0.05, pctVsMa50: 0.04 }));
  assert.ok(against.components.trend < long.components.trend);
});

test("higher conviction never lowers the score, other things equal", () => {
  let prev = -Infinity;
  for (const c of [1, 2, 3, 4, 5]) {
    const s = score(trade({ conviction: c })).finalScore;
    assert.ok(s >= prev, `conviction ${c}: ${s} < ${prev}`);
    prev = s;
  }
});

test("an already-open ticker is scored to zero; other overlap costs at most 18 points", () => {
  const t = trade();
  assert.equal(score(t, { openPositions: [{ ticker: "LMT", sector: "Defense", scenario: "iran", direction: "LONG" }] }).finalScore, 0);
  const crowded = Array.from({ length: 5 }, (_, i) => ({ ticker: `X${i}`, sector: "Defense", scenario: "iran", direction: "LONG" }));
  const s = score(t, { openPositions: crowded });
  assert.equal(s.diversificationPenalty, 18);
  assert.equal(s.finalScore, Number(Math.max(0, s.rawScore - 18).toFixed(1)));
});

test("memory needs three trades in a bucket before it moves the score", () => {
  const t = trade();
  const thin = { buckets: { "ticker:LMT": { n: 2, wins: 2, totalPnlPct: 0.4 } } };
  assert.equal(scoreCandidate(t, thin, { calibration: null }).memoryMult, 1);
  const proven = { buckets: { "ticker:LMT": { n: 10, wins: 9, totalPnlPct: 1.0 } } };
  const burned = { buckets: { "ticker:LMT": { n: 10, wins: 1, totalPnlPct: -1.0 } } };
  const up = scoreCandidate(t, proven, { calibration: null });
  const down = scoreCandidate(t, burned, { calibration: null });
  assert.ok(up.memoryMult > 1 && up.finalScore > score(t).finalScore);
  assert.ok(down.memoryMult < 1 && down.finalScore < score(t).finalScore);
});

test("the memory multiplier is clamped to 0.3-2.5 however many buckets agree", () => {
  const t = trade();
  const all = (wins, pnl) => ({ buckets: Object.fromEntries(bucketKeysFor(t).map((k) => [k, { n: 1000, wins, totalPnlPct: pnl }])) });
  assert.equal(scoreCandidate(t, all(1000, 1000), { calibration: null }).memoryMult, 2.5);
  assert.equal(scoreCandidate(t, all(0, -1000), { calibration: null }).memoryMult, 0.3);
});

test("bucketKeysFor yields the nine memory buckets, most general first", () => {
  const keys = bucketKeysFor(trade());
  assert.equal(keys.length, 9);
  assert.equal(new Set(keys).size, 9);
  assert.equal(keys[0], "ticker:LMT");
  assert.equal(keys.at(-1), "scenario:iran|sector:Defense|direction:LONG");
});

// ---- calibration and the tournament gate ---------------------------------

test("filterCalibration strips the switched-off fields and leaves its input alone", () => {
  const cal = { perBucket: { b: { weights: { a: 1 }, stopMult: 1.2, targetMult: 0.9, n: 7 } } };
  const out = filterCalibration(cal, { weights: false, targetMult: false });
  assert.deepEqual(out.perBucket.b, { weights: undefined, stopMult: 1.2, targetMult: undefined, n: 7 });
  assert.deepEqual(cal.perBucket.b.weights, { a: 1 }, "input mutated");
  assert.equal(filterCalibration(null), null);
});

function tournament(defaultWindows, candidates) {
  const avg = (ws) => ws.reduce((a, b) => a + b, 0) / ws.length;
  const entry = (label, ws) => ({ label, avgReturn: avg(ws), windows: ws.map((pctReturn) => ({ pctReturn })) });
  return { results: [entry("default", defaultWindows), ...Object.entries(candidates).map(([l, ws]) => entry(l, ws))] };
}

test("the gate refuses when there is no baseline to beat", () => {
  assert.deepEqual(applyTournamentGate({ results: [{ label: "x", avgReturn: 1, windows: [] }] }), {
    accepted: false,
    reason: "no baseline candidate found",
  });
});

test("a candidate no worse in any window and better in one is accepted as Pareto-dominant", () => {
  const r = applyTournamentGate(tournament([0.01, 0.02, 0.03], { tweak: [0.01, 0.02, 0.034] }));
  assert.equal(r.accepted, true);
  assert.equal(r.gateReason, "pareto_dominant");
});

test("a better average is not enough if one window is much worse", () => {
  const r = applyTournamentGate(tournament([0.01, 0.02, 0.03], { risky: [0.05, 0.06, 0.02] }));
  assert.equal(r.accepted, false);
  assert.equal(r.reason, "no candidate cleared the gate");
});

test("a clear average gain with only a small window loss passes the headline gate", () => {
  const r = applyTournamentGate(tournament([0.01, 0.02, 0.03], { solid: [0.02, 0.03, 0.027] }));
  assert.equal(r.accepted, true);
  assert.equal(r.gateReason, "headline_avg_gate");
  assert.equal(r.winner.label, "solid");
});
