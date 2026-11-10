// Position picking and sizing (lib/trader.js pickNewPositions): the rules
// that move the paper book's cash. calibrationOverride: null keeps every
// call off data/trader/calibration.json; no network, no files written.

const test = require("node:test");
const assert = require("node:assert/strict");
const { pickNewPositions, flattenScenarioTrades, STARTING_CASH } = require("../lib/trader.js");

const EMPTY = { buckets: {} };
let n = 0;
function strong(over = {}) {
  n += 1;
  return {
    ticker: `T${n}`, sector: `S${n}`, scenario: `sc${n}`, direction: "LONG",
    conviction: 5, heat: 95, upsidePct: 0.3, rewardToRisk: 3,
    momentum22d: 0.08, pctVsMa22: 0.05, pctVsMa50: 0.05, annualizedVol: 0.3,
    catalyst: "Patriot replenishment contract award this quarter; blockade risk",
    price: 100, ...over,
  };
}
const pick = (args) => pickNewPositions({ openPositions: [], cash: STARTING_CASH, memory: EMPTY, maxNew: 5, calibrationOverride: null, ...args });

test("never opens more than maxNew positions", () => {
  const { picks } = pick({ candidates: Array.from({ length: 8 }, () => strong()), maxNew: 2 });
  assert.equal(picks.length, 2);
});

test("skips a ticker that is already open", () => {
  const c = strong({ ticker: "LMT" });
  const { picks } = pick({ candidates: [c], openPositions: [{ ticker: "LMT", sector: "x", scenario: "y", direction: "LONG" }] });
  assert.equal(picks.length, 0);
});

test("nothing below the 55-point entry floor is bought", () => {
  const weak = strong({ conviction: 1, heat: 30, upsidePct: 0.07, rewardToRisk: 0.5, momentum22d: -0.1, pctVsMa22: -0.1, pctVsMa50: -0.1, catalyst: "" });
  const { picks, scoredWatchlist } = pick({ candidates: [weak] });
  assert.ok(scoredWatchlist[0].score.finalScore < 55);
  assert.equal(picks.length, 0);
});

test("base size is $1,800 and every pick leaves the 10% cash reserve", () => {
  const { picks } = pick({ candidates: Array.from({ length: 5 }, () => strong()) });
  assert.ok(picks.length > 0);
  for (const p of picks) assert.equal(p.allocatedCash, 1800); // empty memory: no size boost
  const spent = picks.reduce((s, p) => s + p.allocatedCash, 0);
  assert.ok(STARTING_CASH - spent >= STARTING_CASH * 0.1);
});

test("a pick that would breach the reserve is skipped", () => {
  // $2,700 cash: one $1,800 buy leaves $900, under the $1,000 reserve
  const { picks } = pick({ candidates: [strong()], cash: 2700 });
  assert.equal(picks.length, 0);
  assert.equal(pick({ candidates: [strong()], cash: 2800 }).picks.length, 1);
});

test("the $2,400 size needs both a 72+ score and a memory edge of at least 1.15", () => {
  const c = strong({ ticker: "LMT", sector: "Defense", scenario: "iran" });
  const proven = { buckets: { "ticker:LMT": { n: 20, wins: 18, totalPnlPct: 2.0 }, "sector:Defense": { n: 20, wins: 18, totalPnlPct: 2.0 } } };
  const boosted = pick({ candidates: [c], memory: proven }).picks[0];
  assert.ok(boosted.score.finalScore >= 72 && boosted.score.memoryMult >= 1.15);
  assert.equal(boosted.allocatedCash, 2400);
  assert.equal(pick({ candidates: [c] }).picks[0].allocatedCash, 1800);
});

test("each pick is re-scored against the picks before it, so concentration costs points", () => {
  const same = [strong({ sector: "Defense", scenario: "iran" }), strong({ sector: "Defense", scenario: "iran" })];
  const { picks } = pick({ candidates: same });
  assert.equal(picks.length, 2);
  // same sector 6 + same scenario 3 + every open position the same direction 4
  assert.equal(picks[0].score.diversificationPenalty, 0);
  assert.equal(picks[1].score.diversificationPenalty, 13);
  assert.equal(Number((picks[0].score.finalScore - picks[1].score.finalScore).toFixed(1)), 13);
});

test("flattenScenarioTrades drops unpriced trades and carries the scenario's heat", () => {
  const out = flattenScenarioTrades({ iran: { title: "Iran", heat: 77, trades: [{ ticker: "A", price: 10 }, { ticker: "B", price: null }] } });
  assert.deepEqual(out.map((t) => [t.ticker, t.scenario, t.heat]), [["A", "iran", 77]]);
});

test("a boosted pick that does not fit the reserve is bought at the base size, not skipped", () => {
  // $3,000: $2,400 would leave $600 (< $1,000 reserve); $1,800 leaves $1,200
  const lmt = strong({ ticker: "LMT", sector: "Defense", scenario: "iran" });
  const xom = strong({ ticker: "XOM", sector: "Energy", scenario: "hormuz" });
  const proven = { buckets: { "ticker:LMT": { n: 20, wins: 18, totalPnlPct: 2.0 }, "sector:Defense": { n: 20, wins: 18, totalPnlPct: 2.0 } } };
  const { picks } = pick({ candidates: [lmt, xom], cash: 3000, memory: proven });
  assert.deepEqual(picks.map((p) => [p.ticker, p.allocatedCash]), [["LMT", 1800]]);
});
