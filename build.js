// Build a static `dist/` folder for FTP deployment to jakepercy.com.
//
// The live site uses three dynamic endpoints (/api/refresh, /api/trader,
// /api/config). On a static host we freeze each one into a JSON file under
// dist/api/ and rewrite the frontend's fetch URLs to point at them.
//
// Usage:
//   node build.js            one-shot build
//   node build.js --watch    rebuild on changes to public/ or data/

const fs = require("fs");
const path = require("path");

const { loadConfig } = require("./lib/config");
const { buildPayload } = require("./lib/scenarios");
const trader = require("./lib/trader");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST_DIR = path.join(ROOT, "dist");
const DIST_API_DIR = path.join(DIST_DIR, "api");

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

function rewriteAppJs() {
  const srcPath = path.join(PUBLIC_DIR, "app.js");
  const src = fs.readFileSync(srcPath, "utf-8");
  // Point each API fetch at its static JSON snapshot.
  const rewritten = src
    .replace(/fetch\(\s*["']\/api\/refresh["']/g, 'fetch("api/refresh.json"')
    .replace(/fetch\(\s*["']\/api\/trader["']/g, 'fetch("api/trader.json"')
    .replace(/fetch\(\s*["']\/api\/config["']/g, 'fetch("api/config.json"');
  fs.writeFileSync(path.join(DIST_DIR, "app.js"), rewritten, "utf-8");
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
}

async function snapshotRefresh() {
  const { scenarios, fallbackQuotes } = loadConfig();
  const payload = await buildPayload(scenarios, fallbackQuotes);
  writeJson(path.join(DIST_API_DIR, "refresh.json"), payload);
}

async function snapshotTrader() {
  const state = trader.loadState();
  const memory = trader.loadMemory();
  const simulation = trader.loadSimulation ? trader.loadSimulation() : null;
  const calibration = trader.loadCalibration ? trader.loadCalibration() : null;

  let liveEquity = state.cash;
  let liveOpenMtM = 0;
  let liveFetchedAt = null;
  if (state.openPositions && state.openPositions.length) {
    try {
      const live = await trader.markToMarketLive(state.openPositions);
      state.openPositions = live.positions;
      liveOpenMtM = live.openMtM;
      liveFetchedAt = live.fetchedAt;
      liveEquity = state.cash + liveOpenMtM;
    } catch (e) {
      liveFetchedAt = null;
    }
  }
  const livePctReturn = state.startingCash
    ? (liveEquity - state.startingCash) / state.startingCash
    : 0;

  writeJson(path.join(DIST_API_DIR, "trader.json"), {
    state,
    live: {
      equity: Number(liveEquity.toFixed(2)),
      openMtM: Number(liveOpenMtM.toFixed(2)),
      pctReturn: Number(livePctReturn.toFixed(4)),
      fetchedAt: liveFetchedAt
    },
    memory: { ...memory, summary: trader.summarizeMemory(memory) },
    simulation,
    calibration: calibration ? {
      generatedAt: calibration.generatedAt,
      fromTrades: calibration.fromTrades,
      perBucket: calibration.perBucket,
      globalWeights: calibration.globalWeights,
      tournamentMeta: calibration.tournamentMeta,
      applyBucketWeights: calibration.applyBucketWeights
    } : null
  });
}

function snapshotConfig() {
  writeJson(path.join(DIST_API_DIR, "config.json"), loadConfig());
}

async function build() {
  const t0 = Date.now();
  log("Building dist/...");

  rmrf(DIST_DIR);
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 1. Copy static assets from public/ (everything except app.js, which we
  //    rewrite below).
  for (const entry of fs.readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
    if (entry.name === "app.js") continue;
    const s = path.join(PUBLIC_DIR, entry.name);
    const d = path.join(DIST_DIR, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
  rewriteAppJs();

  // 2. Snapshot the API endpoints.
  await snapshotRefresh();
  await snapshotTrader();
  snapshotConfig();

  log(`Built in ${Date.now() - t0}ms -> ${path.relative(ROOT, DIST_DIR)}/`);
}

function watch() {
  let pending = null;
  let building = false;

  const trigger = (reason) => {
    if (building) {
      pending = reason;
      return;
    }
    building = true;
    build()
      .catch((err) => log(`Build failed: ${err.message}`))
      .finally(() => {
        building = false;
        if (pending) {
          const next = pending;
          pending = null;
          log(`Rebuild queued from: ${next}`);
          trigger(next);
        }
      });
  };

  const watchPath = (p, label) => {
    if (!fs.existsSync(p)) return;
    fs.watch(p, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      // Ignore our own output and runtime noise.
      if (filename.startsWith("cache" + path.sep)) return;
      if (filename.endsWith(".server.pid") || filename.endsWith("server.log")) return;
      trigger(`${label}/${filename}`);
    });
    log(`Watching ${label}/`);
  };

  watchPath(PUBLIC_DIR, "public");
  watchPath(path.join(ROOT, "data"), "data");
  watchPath(path.join(ROOT, "lib"), "lib");

  trigger("initial");
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--watch") || args.has("-w")) {
    watch();
  } else {
    build().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}

module.exports = { build };
