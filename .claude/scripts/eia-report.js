#!/usr/bin/env node
/**
 * EIA Weekly Petroleum Status Report.
 * Usage: node eia-report.js [--dry-run] [--scenario <key>]
 * Requires EIA_API_KEY environment variable.
 */
const path = require("path");
const { runEiaReport } = require(path.join(__dirname, "..", "..", "lib", "eia"));

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const scenarioIdx = args.indexOf("--scenario");
  const scenarioKey = scenarioIdx !== -1 ? args[scenarioIdx + 1] : "iran";

  const result = await runEiaReport({ scenarioKey, dryRun });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
