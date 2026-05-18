# Conflict Scenario Market Dashboard

Local scenario dashboard for:

- Iran / Strait of Hormuz / Yemen chokepoints
- China / Taiwan escalation
- Russia / NATO / Western Europe conflict stress
- Korea / DPRK / Yellow Sea provocations

## Run

From this folder:

```powershell
$env:PORT=8899
node server.js
```

Then open:

```text
http://localhost:8899
```

Or double-click `run-dashboard.bat`. The slash commands below will restart the server in the background after each autonomous update.

## What it does

- Pulls live headlines from Google News RSS for each scenario
- Pulls quote history from Stooq (Yahoo as fallback) for all scenario tickers
- Recalculates scenario heat plus upside/downside risk bands on refresh
- Shows 10+ stock trade expressions per scenario tab
- Updates itself autonomously via slash commands (see below)

## Architecture

```
data/config.json           Single source of truth for scenarios + fallbackQuotes.
                           All slash commands write here, never to server.js.
data/snapshots/            Dated payload snapshots for future P&L work.
data/flows/                Per-command intel reports (Hormuz traffic, OPEC, etc).
data/cache/                Raw API responses (gitignored).
lib/                       Shared modules: fetcher, news, quotes, scenarios, intel, config.
server.js                  Thin HTTP wrapper over lib/scenarios.js#buildPayload.
public/                    Frontend (static HTML/CSS/JS).
.claude/commands/          Slash command definitions (one .md per command).
.claude/scripts/           Node.js scripts invoked by commands.
.claude/templates/         Scenario + intel-topic + commodity-track configs.
```

## Slash commands

Every command auto-edits `data/config.json`, `git commit`s with a descriptive message, and restarts the server in place. Safety net is git history — `git log` shows every autonomous change; `git revert <sha>` undoes one cleanly.

### Tier 1 — Data freshness

| Command | Effect |
|---|---|
| `/refresh-quotes` | Pulls Stooq/Yahoo for every ticker. Updates `fallbackQuotes`. |
| `/refresh-headlines [scenario]` | Pulls Google News, scores keyword hits, adjusts `heatBase` (±10 max). |
| `/refresh-summary <scenario>` | Re-writes the scenario's `summary` + `secondOrderEffects` prose from recent headlines. |
| `/refresh-all` | Quotes + headlines for all scenarios. |
| `/snapshot` | Saves full payload to `data/snapshots/` for P&L. |

### Tier 2 — Universe expansion

| Command | Effect |
|---|---|
| `/add-scenario korea` | Adds the Korea/DPRK/Yellow Sea scenario from `.claude/templates/scenarios/korea.json`. |
| `/add-commodity-track` | Appends ETF expressions (USO/UCO/BNO/UNG/URA/GLD/DBA/COPX/REMX) to all scenarios per `.claude/templates/commodity-tracks.json`. |

### Tier 3 — Chokepoint & commodity flow

Each command pulls scenario-specific news, scores it against curated keyword weights, writes a flow report to `data/flows/<topic>-<date>.json`, and adjusts the relevant scenario's `heatBase` (clamped ±4-7 per topic).

| Command | Scenario | Watches |
|---|---|---|
| `/hormuz-status` | iran | UKMTO/CENTCOM/tanker seizures/sea mines (±6) |
| `/bab-el-mandeb-status` | iran | Houthi attacks, Red Sea war-risk (±5) |
| `/taiwan-strait-status` | taiwan | PLA ADIZ incursions, median-line, blockade rehearsals (±6) |
| `/korea-launches` | korea | DPRK ICBM/SLBM/hypersonic launches, JCS bulletins (±7) |
| `/black-sea-status` | europe | Odessa port attacks, grain corridor, Bosphorus transit (±5) |
| `/baltic-status` | europe | Drone intercepts, undersea cables, shadow fleet (±5) |
| `/lng-flow` | europe | Cheniere cargoes, TTF/JKM spreads, Russian LNG ban (±4) |
| `/oil-curve` | (read-only) | Brent/WTI/HH spot + 7d/22d momentum + Brent-WTI spread |
| `/freight-rates` | (read-only) | FRO/TNK/DHT/INSW/EURN/STNG/BDRY/ZIM/FDX momentum |

### Tier 4 — Policy signal

| Command | Scenario | Watches |
|---|---|---|
| `/contract-awards` | europe | DoD daily contract awards for LMT/RTX/NOC/GD/HII (±4) |
| `/dsca-fms` | europe | Foreign Military Sales notifications (Israel/KSA/Taiwan/Poland/Ukraine/Korea) (±4) |
| `/sanctions-update` | iran | OFAC SDN designations, shadow-fleet tankers, Iran/Russia/DPRK entities (±4) |
| `/centcom-feed` | iran | CENTCOM operations/strikes/intercepts (±4) |
| `/opec-watch` | iran | OPEC+ meeting outcomes, production decisions (±3) |

## Adding a new chokepoint or policy command

1. Create `.claude/templates/intel/<topic>.json` with `topic`, `scenarioKey`, `queries[]`, `weights[[keyword,weight]]`, `bands{high,mid,low,baseline}`, optional `maxHeatDelta`.
2. Create `.claude/commands/<topic>.md` invoking `node .claude/scripts/intel.js <topic>`.
3. Done. No code changes needed.

## Adding a new scenario

1. Create `.claude/templates/scenarios/<key>.json` matching the shape of `korea.json` (key, title, subtitle, color, query, newsFallbackQueries, heatBase, summary, secondOrderEffects, indicatorBlueprints, trades[]).
2. Optionally extend `computeSubScores()` in `lib/scenarios.js` with a scenario-specific sub-score map.
3. Run `/add-scenario <key>`. The frontend tab strip auto-renders.

## Notes

- This is a research dashboard, not personalized investment advice.
- The risk model uses a simple scenario framework based on conviction, live headline heat, and trailing realized volatility.
- If a quote feed is temporarily unavailable, the app shows the trade thesis with `N/A` values for missing quote fields.
- Most commands take 10-30 seconds (RSS + quote fetches). The dashboard reloads in the browser as soon as the server restarts.
