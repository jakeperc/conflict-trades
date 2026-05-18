---
description: DoD daily contract awards for portfolio defense primes (LMT/RTX/NOC/GD/HII). Adjusts Europe heat (defense leadership proxy).
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js contract-awards
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "contract-awards <date>: europe heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: aggregate score, top 5 awards (with company + dollar value mentioned in the title).
