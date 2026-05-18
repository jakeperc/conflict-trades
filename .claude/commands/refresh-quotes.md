---
description: Pull live quote prices + realized vol for every dashboard ticker, write to data/config.json, commit, and restart the server.
allowed-tools: Bash, Read, Edit
---

Refresh all fallback quotes for the dashboard.

Run this command exactly:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/refresh-quotes.js
```

Parse the JSON summary it prints. Then:

1. Stage `data/config.json` and commit with a message like `refresh-quotes <ISO date>: N tickers updated, M failed`.
2. Restart the server: `node .claude/scripts/restart-server.js`.
3. Report to the user: total tickers updated, count failed, and the top 3 biggest absolute percentage moves (from the `tickers.<TICKER>.pctChange` field), formatted as `TICKER: $oldPrice → $newPrice (±X.X%)`.

If the script exits non-zero, show the error and do not commit.
