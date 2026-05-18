#!/usr/bin/env node
/**
 * Generic chokepoint/policy intel runner.
 * Usage: node intel.js <topic>
 * Reads .claude/templates/intel/<topic>.json which must contain:
 *   { topic, scenarioKey, queries[], rssFeeds[], weights[[kw,w]], bands{}, maxHeatDelta? }
 */
const path = require("path");
const fs = require("fs");
const { runIntel } = require(path.join(__dirname, "..", "..", "lib", "intel"));

async function main() {
  const topic = process.argv[2];
  if (!topic) {
    console.error("Usage: node intel.js <topic>");
    process.exit(1);
  }
  const cfgPath = path.join(__dirname, "..", "templates", "intel", `${topic}.json`);
  if (!fs.existsSync(cfgPath)) {
    console.error(JSON.stringify({ error: `No intel template at ${cfgPath}` }));
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  const result = await runIntel(cfg);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
