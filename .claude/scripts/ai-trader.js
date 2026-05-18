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

  console.error(`Unknown subcommand: ${cmd}. Use run|status|reset|backfill|simulate.`);
  process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
