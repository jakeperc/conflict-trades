---
description: Full refresh - quotes for all tickers + headlines + heat for all scenarios. Most-used command.
allowed-tools: Bash, Read, Edit
---

Run a full refresh of the dashboard.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
echo "=== quotes ==="
node .claude/scripts/refresh-quotes.js
echo "=== headlines ==="
node .claude/scripts/refresh-headlines.js
```

Then:

1. Stage everything: `git add data/config.json data/cache/`. Commit with `refresh-all <ISO date>`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report a one-screen summary:
   - Number of tickers updated, biggest 3 movers (TICKER, $oldPrice → $newPrice, ±%).
   - Per scenario: heat old → new, top headline.
   - Server URL: http://127.0.0.1:8899

If either script fails, show the error but still attempt the other one. Commit only what succeeded.
