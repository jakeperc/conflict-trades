// Build the static `dist/` folder that GitHub Pages serves at conflict-trades.jakepercy.com.
//
// The local server has three dynamic endpoints (/api/refresh, /api/trader, /api/config).
// On the static site each one is frozen into dist/api/*.json.
//
// Layout: the v2 UI (prebuilt into ui-dist/ by `npm run build:ui`) is the site root, the legacy UI
// (public/) lives at classic/, and next/ redirects to the root for old links. This script needs no
// node_modules, so the daily automation runs it with plain Node.
//
// The build is atomic: everything lands in dist.tmp/, the snapshots are contract-checked, and only
// then does dist.tmp/ replace dist/. A failed build leaves the previous dist/ untouched.
//
// Usage:
//   node build.js            one-shot build
//   node build.js --watch    rebuild on changes to public/, ui-dist/, data/ or lib/

const fs = require("fs");
const path = require("path");

const { loadConfig } = require("./lib/config");
const { buildPayload } = require("./lib/scenarios");
const trader = require("./lib/trader");
const { checkRefresh, checkTrader } = require("./lib/contract");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UI_DIR = path.join(ROOT, "ui-dist");
const DIST_DIR = path.join(ROOT, "dist");
const TMP_DIR = path.join(ROOT, "dist.tmp");
const OLD_DIR = path.join(ROOT, "dist.old");

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

function copyDir(src, dst, skip = () => false) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d, skip);
    else copyFile(s, d);
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
}

// Legacy UI at classic/: point each API fetch at the shared snapshot one level up.
function copyLegacyUi(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
    if (entry.name === "app.js") continue;
    const s = path.join(PUBLIC_DIR, entry.name);
    const d = path.join(outDir, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
  const src = fs.readFileSync(path.join(PUBLIC_DIR, "app.js"), "utf-8");
  const rewritten = src
    .replace(/fetch\(\s*["']\/api\/refresh["']/g, 'fetch("../api/refresh.json"')
    .replace(/fetch\(\s*["']\/api\/trader["']/g, 'fetch("../api/trader.json"')
    .replace(/fetch\(\s*["']\/api\/config["']/g, 'fetch("../api/config.json"');
  fs.writeFileSync(path.join(outDir, "app.js"), rewritten, "utf-8");
}

// next/ was the v2 preview path; keep old links working by sending them to the root (hash route kept).
function writeNextRedirect(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "index.html"),
    '<!doctype html><meta charset="utf-8"><title>Conflict Trades</title>' +
      '<meta http-equiv="refresh" content="0; url=../">' +
      '<script>location.replace("../" + location.hash)</script>' +
      '<a href="../">Conflict Trades has moved to the main page.</a>\n',
    "utf-8"
  );
}

// New UI: copy the prebuilt bundle (it already fetches relative api/*.json).
function copyNewUi(outDir) {
  if (!fs.existsSync(path.join(UI_DIR, "index.html"))) {
    throw new Error("ui-dist/ is missing. Build the UI once with `npm ci && npm run build:ui`, then rerun node build.js.");
  }
  copyDir(UI_DIR, outDir, (name) => name === ".vite");
}

async function snapshotRefresh() {
  const { scenarios, fallbackQuotes } = loadConfig();
  return buildPayload(scenarios, fallbackQuotes);
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

  return {
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
  };
}

function swapIntoPlace() {
  rmrf(OLD_DIR);
  try {
    if (fs.existsSync(DIST_DIR)) fs.renameSync(DIST_DIR, OLD_DIR);
    fs.renameSync(TMP_DIR, DIST_DIR);
    rmrf(OLD_DIR);
  } catch (err) {
    // A synced folder (OneDrive) can briefly lock a directory; fall back to copy.
    log(`rename failed (${err.code}); copying instead`);
    if (!fs.existsSync(DIST_DIR) && fs.existsSync(OLD_DIR)) fs.renameSync(OLD_DIR, DIST_DIR);
    rmrf(DIST_DIR);
    copyDir(TMP_DIR, DIST_DIR);
    rmrf(TMP_DIR);
    rmrf(OLD_DIR);
  }
}

async function build() {
  const t0 = Date.now();
  log("Building dist/...");
  rmrf(TMP_DIR);
  fs.mkdirSync(TMP_DIR, { recursive: true });

  try {
    copyNewUi(TMP_DIR);
    copyLegacyUi(path.join(TMP_DIR, "classic"));
    writeNextRedirect(path.join(TMP_DIR, "next"));

    const [refresh, traderPayload] = await Promise.all([snapshotRefresh(), snapshotTrader()]);
    const problems = [...checkRefresh(refresh), ...checkTrader(traderPayload)];
    if (problems.length) {
      throw new Error(`API snapshot failed the contract check:\n  - ${problems.join("\n  - ")}`);
    }
    const apiDir = path.join(TMP_DIR, "api");
    writeJson(path.join(apiDir, "refresh.json"), refresh);
    writeJson(path.join(apiDir, "trader.json"), traderPayload);
    writeJson(path.join(apiDir, "config.json"), loadConfig());
  } catch (err) {
    rmrf(TMP_DIR);
    throw err;
  }

  swapIntoPlace();
  log(`Built in ${Date.now() - t0}ms -> ${path.relative(ROOT, DIST_DIR)}/ (v2 at /, legacy at /classic/)`);
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
  watchPath(UI_DIR, "ui-dist");
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
      console.error(err.message || err);
      process.exit(1);
    });
  }
}

module.exports = { build };
