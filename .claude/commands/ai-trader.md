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
3. Report:
   - Cycle number, current equity, % vs $10,000 start.
   - Open positions: ticker, scenario, direction, entry → current, unrealized P&L%.
   - This cycle's entries and exits.
   - Top 3 watchlist candidates by confidence.
   - Memory insights: top 2 best learned buckets + top 2 worst.

If `status`: just print state — no commit or restart needed.

If `reset`: wipe trader state + memory. Commit the deletion.
