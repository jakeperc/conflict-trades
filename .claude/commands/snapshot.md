---
description: Save a full dashboard payload (scenarios, trades, quotes, headlines, heat) to data/snapshots/ for future P&L computation.
allowed-tools: Bash, Read
---

Take a snapshot of the current dashboard state.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/snapshot.js
```

Then:

1. Stage and commit the new snapshot file: `git add data/snapshots/ && git commit -m "snapshot <ISO date>"`.
2. Report: path of the file written + per-scenario heat + top trade in each scenario.
