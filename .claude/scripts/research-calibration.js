#!/usr/bin/env node
/**
 * Research-only harness. Compares multiple calibration strategies against a
 * baseline (no calibration). Does NOT modify the live calibration.json or
 * any user-facing state.
 *
 * Tests:
 *   1. No calibration (baseline)
 *   2. Full calibration (current behavior — known to underperform)
 *   3. Multipliers only (stop + target, no weight changes)
 *   4. Stop multiplier only (no target widening, no weight changes)
 *   5. Weights only (no multipliers)
 *   6. Out-of-sample: train on Feb 28–Apr 5, test on Apr 6–May 15
 *      with three calibration variants
 *   7. Multi-window robustness: three different test windows
 */
const path = require("path");
const trader = require(path.join(__dirname, "..", "..", "lib", "trader"));
const { fetchQuoteHistory } = require(path.join(__dirname, "..", "..", "lib", "quotes"));
const { loadConfig } = require(path.join(__dirname, "..", "..", "lib", "config"));

function pct(n) { return (n * 100).toFixed(2) + "%"; }
function fmt(n) { return "$" + n.toFixed(2); }

async function fetchAllHistories() {
  const { scenarios } = loadConfig();
  const tickers = new Set();
  for (const s of Object.values(scenarios)) for (const t of s.trades) tickers.add(t.ticker);
  const out = {};
  await Promise.all(
    [...tickers].map(async (ticker) => {
      try { out[ticker] = await fetchQuoteHistory(ticker, 400); }
      catch { out[ticker] = null; }
    })
  );
  return out;
}

function summary(label, run) {
  return {
    label,
    finalEquity: run.finalEquity,
    pctReturn: run.pctReturn,
    closedCount: run.closedCount,
    winRate: run.winRate,
    maxDrawdown: run.maxDrawdown,
    exits: run.exitReasonCounts
  };
}

async function main() {
  const histories = await fetchAllHistories();
  console.error("[research] histories fetched, loading current calibration");
  const currentCal = trader.runDeepSimulation
    ? null // will rebuild
    : null;

  // === Phase 1: in-sample comparison Feb 28 -> May 15 ===
  // Rebuild calibration using current code, in-memory only.
  console.error("[research] Rebuilding in-sample calibration (Feb 28 - May 15)...");
  const isFullSim = await trader.runDeepSimulation({ persist: false, log: false });
  const isCal = isFullSim.calibration;
  if (!isCal) throw new Error("simulation did not return calibration");

  console.error("[research] Running Phase 1: in-sample replays (Feb 28 -> May 15)");

  const phase1 = [];
  phase1.push({ label: "no_calibration", config: { calibration: null } });
  phase1.push({ label: "full_calibration", config: { calibration: isCal } });
  phase1.push({ label: "multipliers_only", config: { calibration: trader.filterCalibration(isCal, { weights: false, stopMult: true, targetMult: true }) } });
  phase1.push({ label: "stop_mult_only", config: { calibration: trader.filterCalibration(isCal, { weights: false, stopMult: true, targetMult: false }) } });
  phase1.push({ label: "weights_only", config: { calibration: trader.filterCalibration(isCal, { weights: true, stopMult: false, targetMult: false }) } });

  const phase1Results = [];
  for (const test of phase1) {
    const run = await trader.replayLiveBook({
      startDate: "2026-02-28",
      histories,
      calibration: test.config.calibration
    });
    phase1Results.push(summary(test.label, run));
  }

  console.log("\n=== PHASE 1: IN-SAMPLE Feb 28 -> May 15 (54 days) ===");
  console.log("variant".padEnd(22) + "equity".padEnd(12) + "return".padEnd(10) + "closed".padEnd(8) + "win%".padEnd(8) + "maxDD".padEnd(8) + "exits");
  for (const r of phase1Results) {
    console.log(r.label.padEnd(22) + fmt(r.finalEquity).padEnd(12) + pct(r.pctReturn).padEnd(10) + (r.closedCount + "").padEnd(8) + pct(r.winRate).padEnd(8) + pct(r.maxDrawdown).padEnd(8) + JSON.stringify(r.exits));
  }

  // === Phase 2: out-of-sample test ===
  // Train calibration on Feb 28 - Apr 5 (~28 days), test replay on Apr 6 - May 15
  console.error("\n[research] Phase 2: out-of-sample test");
  console.error("[research] Training calibration on Feb 28 - Apr 5...");
  const oosTrainSim = await trader.runDeepSimulation({ startDate: "2026-02-28", endDate: "2026-04-05", persist: false, log: false });
  const oosCal = oosTrainSim.calibration;
  console.error(`[research] Out-of-sample training produced ${oosTrainSim.closedCount} trades, ${oosTrainSim.recalibratedBuckets} buckets`);

  const phase2 = [];
  phase2.push({ label: "oos_no_cal", config: { calibration: null } });
  phase2.push({ label: "oos_full_cal", config: { calibration: oosCal } });
  phase2.push({ label: "oos_mults_only", config: { calibration: trader.filterCalibration(oosCal, { weights: false, stopMult: true, targetMult: true }) } });
  phase2.push({ label: "oos_stop_only", config: { calibration: trader.filterCalibration(oosCal, { weights: false, stopMult: true, targetMult: false }) } });
  phase2.push({ label: "oos_weights_only", config: { calibration: trader.filterCalibration(oosCal, { weights: true, stopMult: false, targetMult: false }) } });

  const phase2Results = [];
  for (const test of phase2) {
    const run = await trader.replayLiveBook({
      startDate: "2026-04-06",
      endDate: "2026-05-15",
      histories,
      calibration: test.config.calibration
    });
    phase2Results.push(summary(test.label, run));
  }

  console.log("\n=== PHASE 2: OUT-OF-SAMPLE (train Feb28-Apr5, test Apr6-May15) ===");
  console.log("variant".padEnd(22) + "equity".padEnd(12) + "return".padEnd(10) + "closed".padEnd(8) + "win%".padEnd(8) + "maxDD".padEnd(8) + "exits");
  for (const r of phase2Results) {
    console.log(r.label.padEnd(22) + fmt(r.finalEquity).padEnd(12) + pct(r.pctReturn).padEnd(10) + (r.closedCount + "").padEnd(8) + pct(r.winRate).padEnd(8) + pct(r.maxDrawdown).padEnd(8) + JSON.stringify(r.exits));
  }

  // === Phase 3: multi-window robustness ===
  // Use the in-sample calibration (since it's all we have) and test multiplier
  // strategies on three different windows. If a strategy is robust, it should
  // beat baseline in at least 2 of 3.
  console.error("\n[research] Phase 3: multi-window robustness");
  const windows = [
    { start: "2026-02-28", end: "2026-03-31" },
    { start: "2026-03-15", end: "2026-04-30" },
    { start: "2026-04-01", end: "2026-05-15" }
  ];
  const strategies = [
    { label: "no_cal", cal: () => null },
    { label: "stop_only", cal: () => trader.filterCalibration(isCal, { weights: false, stopMult: true, targetMult: false }) },
    { label: "mults", cal: () => trader.filterCalibration(isCal, { weights: false, stopMult: true, targetMult: true }) },
    { label: "weights", cal: () => trader.filterCalibration(isCal, { weights: true, stopMult: false, targetMult: false }) },
    { label: "full", cal: () => isCal }
  ];

  const phase3 = {};
  for (const w of windows) {
    phase3[`${w.start}_${w.end}`] = {};
    for (const s of strategies) {
      const run = await trader.replayLiveBook({
        startDate: w.start,
        endDate: w.end,
        histories,
        calibration: s.cal()
      });
      phase3[`${w.start}_${w.end}`][s.label] = {
        finalEquity: run.finalEquity,
        pctReturn: run.pctReturn,
        closedCount: run.closedCount,
        winRate: run.winRate
      };
    }
  }

  console.log("\n=== PHASE 3: MULTI-WINDOW ROBUSTNESS ===");
  console.log("Beats baseline in N of 3 windows:");
  for (const s of strategies) {
    let beats = 0;
    let totalReturn = 0;
    for (const w of windows) {
      const winKey = `${w.start}_${w.end}`;
      const baseline = phase3[winKey].no_cal.pctReturn;
      const ret = phase3[winKey][s.label].pctReturn;
      if (s.label !== "no_cal" && ret > baseline) beats++;
      totalReturn += ret;
    }
    console.log("  " + s.label.padEnd(14) + ` beats: ${beats}/3   sum return: ${pct(totalReturn)}   avg: ${pct(totalReturn/3)}`);
  }

  console.log("\n=== PER-WINDOW RETURNS ===");
  for (const w of windows) {
    const winKey = `${w.start}_${w.end}`;
    console.log(`\n${w.start} -> ${w.end}:`);
    for (const s of strategies) {
      const r = phase3[winKey][s.label];
      console.log("  " + s.label.padEnd(14) + fmt(r.finalEquity).padStart(10) + "  " + pct(r.pctReturn).padStart(8) + "  closed=" + r.closedCount + "  win=" + pct(r.winRate));
    }
  }

  // Save full results
  const fs = require("fs");
  fs.writeFileSync(
    "data/trader/research-results.json",
    JSON.stringify({ phase1: phase1Results, phase2: phase2Results, phase3 }, null, 2)
  );
  console.log("\nFull results -> data/trader/research-results.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
