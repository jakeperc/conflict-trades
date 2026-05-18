#!/usr/bin/env node
/**
 * Snapshot the full payload (scenarios with live quotes + headlines + heat)
 * to data/snapshots/YYYY-MM-DD-HHmm.json for future P&L computation.
 *
 * Calls buildPayload directly (same logic the server uses) instead of HTTP.
 */
const path = require("path");
const fs = require("fs");
const { loadConfig } = require(path.join(__dirname, "..", "..", "lib", "config"));
const { buildPayload } = require(path.join(__dirname, "..", "..", "lib", "scenarios"));

async function main() {
  const { scenarios, fallbackQuotes } = loadConfig();
  const payload = await buildPayload(scenarios, fallbackQuotes);

  const snapshotsDir = path.join(__dirname, "..", "..", "data", "snapshots");
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 16); // YYYY-MM-DD-HH-MM
  const filePath = path.join(snapshotsDir, `${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));

  const summary = {
    timestamp: now.toISOString(),
    path: path.relative(path.join(__dirname, "..", ".."), filePath),
    scenarios: Object.fromEntries(
      Object.entries(payload.scenarios).map(([key, scenario]) => [
        key,
        {
          heat: scenario.heat,
          tradeCount: scenario.trades.length,
          topHeadline: scenario.headlines?.[0]?.title || null,
          topTrade: scenario.trades[0]
            ? {
                ticker: scenario.trades[0].ticker,
                direction: scenario.trades[0].direction,
                price: scenario.trades[0].price,
                target: scenario.trades[0].targetPrice,
                stop: scenario.trades[0].stopPrice
              }
            : null
        }
      ])
    )
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
