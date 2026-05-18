---
description: DSCA Foreign Military Sales notifications (Israel, KSA, Taiwan, Poland, Ukraine, Korea). Adjusts Europe heat.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js dsca-fms
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "dsca-fms <date>: europe heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, top FMS notifications (recipient country + system type).

Note: DSCA notifications hit the defense backlog directly. A new Patriot or HIMARS sale is a leading indicator for RTX/LMT revenue 2-4 quarters out.
