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

If running a cycle (default):

1. Commit: `git add data/trader/ && git commit -m "ai-trader cycle <N>: equity \$X (Y% vs start), entered A exited B"`.
2. Restart server so /api/trader returns fresh state: `node .claude/scripts/restart-server.js`.
3. Rebuild the static site so dist/ stays current: `node build.js`, then `git add dist/ && git diff --cached --quiet || git commit -m "update-dist <ISO date>"` (skip the commit if dist/ is unchanged).
4. Push to GitHub (private repo jakeperc/conflict-trades): `git push origin master`. This also carries any commits other commands made since the last run. Never force-push. If the push fails (offline, auth, or the remote moved ahead), say so in the report and continue; the commits stay local and go out with the next successful push.
5. Report:
   - Cycle number, current equity, % vs $10,000 start.
   - Open positions: ticker, scenario, direction, entry → current, unrealized P&L%.
   - This cycle's entries and exits.
   - Top 3 watchlist candidates by confidence.
   - Memory insights: top 2 best learned buckets + top 2 worst.

If `status`: just print state — no commit or restart needed.

If `reset`: wipe trader state + memory. Commit the deletion.
