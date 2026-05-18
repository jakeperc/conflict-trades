---
description: Read Brent + WTI spot, Henry Hub, USO/BNO/UNG ETFs. Reports curve state and 7d/22d momentum. Does not change config.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/oil-curve.js
```

1. Stage and commit the new flow file: `git add data/flows/ && git commit -m "oil-curve reading <date>"`.
2. Report: Brent + WTI prices, Brent-WTI spread, 7d/22d momentum, and the `interpretation` line.

This command is read-only — it logs a reading. Use it before sizing energy trades or sanity-checking conviction on XOM/CVX/COP/USO/BNO.
