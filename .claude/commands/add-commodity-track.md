---
description: Append commodity ETF trades (USO, UNG, URA, COPX, REMX, GLD, DBA, BNO, UCO) to all scenarios per template.
allowed-tools: Bash, Read
---

Add direct-commodity ETF expressions to all scenarios.

Template at `.claude/templates/commodity-tracks.json` maps scenarios to ETF trades. Existing tickers are skipped.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/add-commodity-track.js
```

Then:

1. Commit: `git add data/config.json && git commit -m "add-commodity-track: USO/UNG/URA/COPX/REMX/GLD/DBA"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: per scenario, how many ETFs were added (skipping any already present), and which new tickers were pulled into fallbackQuotes.
