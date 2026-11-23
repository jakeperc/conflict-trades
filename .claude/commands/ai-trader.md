---
description: Run the paper AI trader. /ai-trader [run|status|reset]. Default is run.
allowed-tools: Bash, Read
argument-hint: "[run|status|reset]"
---

Run one trader cycle, get status, or reset the book.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/ai-trader.js $ARGUMENTS
```

Safety checks built into `run` (the script exits non-zero and changes nothing if one fails):

- **Preflight:** it refuses to run unless the checkout is on `master` with no uncommitted changes outside `data/` and `dist/`. Every push redeploys the public site, so work-in-progress must never ride along. If it fails, report the message and stop: do not commit, stash, or discard anyone's work to get past it.
- **Market-day check:** on weekends and NYSE holidays it makes no trades and returns `"skipped": true, "reason": "not-a-market-day"`. It only records the check as `lastCheckedAt` in `data/trader/state.json`, which the freshness workflow reads, so a quiet weekend doesn't look like a stopped job.
- **Quote-health gate:** it refuses to trade if more than 10% of trades lack a live quote (the fallback prices can be months old). If it fails, report the affected tickers and stop. Trades without a live quote are never entered or used to mark positions, even under that limit.
- On a market day, `run` first refreshes the fallback quotes and the headline heat (`refresh-quotes.js`, `refresh-headlines.js`; both update `data/config.json`). A failure there is not fatal: it appears in `warnings`. List every warning in the report.

If the result is skipped:
- `not-a-market-day`: commit only the check, `git add data/trader/ && git diff --cached --quiet || git commit -m "ai-trader cycle skipped <date>: not a market day"`. Never write "cycle <N>": no cycle ran and the cycle count did not change. Then do steps 2-4.
- `already-ran-today`: commit nothing in step 1, then do steps 2-4 so the site stays current.

If running a cycle (default):

1. Commit: `git add data/trader/ data/config.json && git commit -m "ai-trader cycle <N>: equity \$X (Y% vs start), entered A exited B"`.
2. Restart server so /api/trader returns fresh state: `node .claude/scripts/restart-server.js`.
3. Rebuild the static site so dist/ stays current: `node build.js`, then `git add dist/ && git diff --cached --quiet || git commit -m "update-dist <ISO date>"` (skip the commit if dist/ is unchanged).
4. Push to GitHub (public repo jakeperc/conflict-trades): `git push origin master`. The push redeploys conflict-trades.jakepercy.com through GitHub Pages, and carries any commits other commands made since the last run. Never force-push. If the push fails (offline, auth, or the remote moved ahead), say so in the report and continue; the commits stay local and go out with the next successful push.
5. Report:
   - Cycle number, current equity, % vs $10,000 start.
   - Open positions: ticker, scenario, direction, entry → current, unrealized P&L%.
   - This cycle's entries and exits.
   - Top 3 watchlist candidates by confidence.
   - Memory insights: top 2 best learned buckets + top 2 worst.
   - WW3 monitor: "ok" or "OFFLINE (<reason>)" from `ww3Status` in `dist/api/refresh.json`. OFFLINE means every Conflict Monitor heat tilt was 0 this run.

If `status`: just print state — no commit or restart needed.

If `reset`: wipe trader state + memory. Commit the deletion.
