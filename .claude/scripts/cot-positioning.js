#!/usr/bin/env node
/**
 * CFTC Commitment of Traders — WTI crude managed money positioning.
 * Usage: node cot-positioning.js [--dry-run]
 * No API key required — uses public CFTC data.
 */
const path = require("path");
const { runCotPositioning } = require(path.join(__dirname, "..", "..", "lib", "cot"));

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const result = await runCotPositioning({ dryRun });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
