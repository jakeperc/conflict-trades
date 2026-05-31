#!/usr/bin/env node
/**
 * AI Trader CLI.
 * Usage: node ai-trader.js [run|status|reset]
 * - run: evaluate exits, open new positions to fill slots, update memory.
 * - status: print current state + memory summary without changing anything.
 * - reset: wipe state + memory and start over.
 */
const path = require("path");
const trader = require(path.join(__dirname, "..", "..", "lib", "trader"));

async function main() {
  const cmd = (process.argv[2] || "run").toLowerCase();

  if (cmd === "reset") {
    console.log(JSON.stringify(trader.resetAll(), null, 2));
    return;
  }

  if (cmd === "status") {
    const state = trader.loadState();
    const memory = trader.loadMemory();
    const last = state.equityCurve[state.equityCurve.length - 1];
    console.log(
      JSON.stringify(
        {
          cycle: state.cycles,
          createdAt: state.createdAt,
          lastRunAt: state.lastRunAt,
          cash: Number(state.cash.toFixed(2)),
          totalEquity: last?.totalEquity ?? state.cash,
          pctVsStart: last?.pctVsStart ?? 0,
          openCount: state.openPositions.length,
          closedCount: state.closedTrades.length,
          memory: trader.summarizeMemory(memory)
        },
        null,
        2
      )
    );
    return;
  }

  if (cmd === "run") {
    const result = await trader.runCycle({ note: process.argv[3] || null });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "backfill") {
    const result = await trader.backfillMemory();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "simulate") {
    const args = process.argv.slice(3);
    const opts = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--since" && args[i + 1]) { opts.startDate = args[++i]; }
      else if (args[i] === "--max-trades" && args[i + 1]) { opts.maxTrades = Number(args[++i]); }
    }
    const result = await trader.runDeepSimulation(opts);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "tune") {
    const fs = require("fs");
    const path = require("path");
    const ROOT = path.join(__dirname, "..", "..");

    const args = process.argv.slice(3);
    let candidateCount = 50;
    let seed = 42;
    let dryRun = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--candidates" && args[i + 1]) { candidateCount = Number(args[++i]); }
      else if (args[i] === "--seed" && args[i + 1]) { seed = Number(args[++i]); }
      else if (args[i] === "--dry-run") { dryRun = true; }
    }

    console.error(`[tune] running tournament with ${candidateCount} candidates...`);
    const tournament = await trader.runTournament({ candidateCount, seed, log: true });
    const gate = trader.applyTournamentGate(tournament);

    const summary = {
      runAt: new Date().toISOString(),
      candidateCount: tournament.candidateCount,
      windows: tournament.windows,
      baselineAvgReturn: gate.baseline?.avgReturn,
      baselineWindows: gate.baseline?.windows.map((w) => ({ window: w.window, pctReturn: w.pctReturn })),
      gateAccepted: gate.accepted,
      gateReason: gate.reason || null,
      improvement: gate.improvement || null,
      winner: gate.accepted ? {
        avgReturn: gate.winner.avgReturn,
        minReturn: gate.winner.minReturn,
        maxReturn: gate.winner.maxReturn,
        weights: gate.winner.weights,
        windows: gate.winner.windows
      } : null,
      top5: tournament.results.slice(0, 5).map((r) => ({
        label: r.label,
        avgReturn: r.avgReturn,
        minReturn: r.minReturn,
        maxReturn: r.maxReturn,
        weights: r.weights
      }))
    };

    fs.writeFileSync(path.join(ROOT, "data", "trader", "tournament.json"), JSON.stringify({ ...summary, allResults: tournament.results }, null, 2));

    if (gate.accepted && !dryRun) {
      const existing = trader.loadCalibration() || {};
      const newCal = {
        ...existing,
        generatedAt: new Date().toISOString(),
        globalWeights: gate.winner.weights,
        tournamentMeta: {
          ranAt: new Date().toISOString(),
          baselineAvgReturn: gate.baseline.avgReturn,
          winnerAvgReturn: gate.winner.avgReturn,
          improvement: gate.improvement,
          winnerWindows: gate.winner.windows,
          candidateCount: tournament.candidateCount
        },
        // Per-bucket weights are kept but NOT applied by default after path 3.
        applyBucketWeights: false
      };
      const path2 = path.join(ROOT, "data", "trader", "calibration.json");
      fs.writeFileSync(path2, JSON.stringify(newCal, null, 2));
      console.error(`[tune] gate ACCEPTED → calibration.json updated with new globalWeights`);
    } else if (!gate.accepted) {
      console.error(`[tune] gate REJECTED: ${gate.reason}`);
    } else {
      console.error(`[tune] dry-run: would have updated calibration.json`);
    }

    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (cmd === "daily") {
    const fs = require("fs");
    const { execSync } = require("child_process");
    const ROOT = path.join(__dirname, "..", "..");
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // Market-day check
    if (!trader.isUsMarketDay(todayET)) {
      console.log(JSON.stringify({ skipped: true, reason: "not-a-market-day", date: todayET }, null, 2));
      return;
    }

    // Already-ran check (belt-and-suspenders — runCycle also checks)
    const state = trader.loadState();
    if (state.lastRunAt && state.lastRunAt.slice(0, 10) === todayET) {
      console.log(JSON.stringify({ skipped: true, reason: "already-ran-today", date: todayET }, null, 2));
      return;
    }

    const warnings = [];

    // refresh-quotes
    try {
      execSync(`node "${path.join(ROOT, ".claude", "scripts", "refresh-quotes.js")}"`, { cwd: ROOT, stdio: "pipe" });
    } catch (e) {
      const detail = e.stderr?.toString().trim() || e.message;
      console.error(JSON.stringify({ error: "refresh-quotes failed", detail }));
      process.exit(1);
    }

    // refresh-headlines (non-fatal — heat can stay at last known value)
    try {
      execSync(`node "${path.join(ROOT, ".claude", "scripts", "refresh-headlines.js")}"`, { cwd: ROOT, stdio: "pipe" });
    } catch (e) {
      warnings.push("refresh-headlines failed: " + (e.stderr?.toString().trim() || e.message));
    }

    // Quote freshness check
    try {
      const { loadConfig } = require(path.join(ROOT, "lib", "config"));
      const cfg = loadConfig();
      if (cfg.lastRefreshAt) {
        const ageMs = Date.now() - Date.parse(cfg.lastRefreshAt);
        if (ageMs > 4 * 60 * 60 * 1000) warnings.push("quotes may be stale — lastRefreshAt >4h ago");
      }
    } catch (e) {
      warnings.push("could not check quote freshness: " + e.message);
    }

    // Run trader cycle
    const result = await trader.runCycle({ note: "daily-routine" });
    if (result.skipped) {
      console.log(JSON.stringify({ ...result, warnings }, null, 2));
      return;
    }

    // Rebuild dist/ to update static site
    try {
      const { build } = require(path.join(ROOT, "build.js"));
      await build();
    } catch (e) {
      warnings.push("build failed: " + e.message);
    }

    // Write per-day run log
    const runsDir = path.join(ROOT, "data", "trader", "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    const runLog = { date: todayET, ranAt: new Date().toISOString(), ...result, warnings };
    fs.writeFileSync(path.join(runsDir, `${todayET}.json`), JSON.stringify(runLog, null, 2));

    const entries = (result.eventsThisCycle || []).filter((e) => e.type === "entry").length;
    const exits   = (result.eventsThisCycle || []).filter((e) => e.type === "exit").length;
    console.log(JSON.stringify({
      date: todayET,
      cycle: result.cycle,
      totalEquity: result.totalEquity,
      pctVsStart: result.pctVsStart,
      openCount: result.openCount,
      entries,
      exits,
      warnings
    }, null, 2));
    return;
  }

  console.error(`Unknown subcommand: ${cmd}. Use run|status|reset|backfill|simulate|tune|daily.`);
  process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
