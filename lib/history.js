// Heat-history reader: aggregates per-scenario heat across saved snapshots so
// the dashboard can draw a trend sparkline. Snapshots are written by the
// /snapshot skill into data/snapshots/YYYY-MM-DD-HH-MM.json. With few snapshots
// the series is short (it fills in over time); callers append the current live
// heat as the final point so the chart always has a "now" anchor.

const fs = require("fs");
const path = require("path");

const SNAP_DIR = path.join(__dirname, "..", "data", "snapshots");

function readHeatHistory(keys, limit = 90) {
  const out = {};
  keys.forEach((k) => { out[k] = []; });

  let files = [];
  try {
    files = fs
      .readdirSync(SNAP_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort(); // filenames are YYYY-MM-DD-HH-MM → lexical sort == chronological
  } catch {
    return out;
  }

  for (const file of files.slice(-limit)) {
    let snap;
    try {
      snap = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, file), "utf-8"));
    } catch {
      continue;
    }
    const t = (snap.generatedAt || file.replace(/\.json$/, "")).slice(0, 16);
    const scenarios = snap.scenarios || {};
    keys.forEach((k) => {
      const heat = scenarios[k] && scenarios[k].heat;
      if (typeof heat === "number") out[k].push({ t, heat });
    });
  }

  return out;
}

module.exports = { readHeatHistory };
