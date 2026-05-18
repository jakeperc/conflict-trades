---
description: CENTCOM press releases and operations updates (strikes, intercepts, Iran-backed activity). Adjusts Iran heat.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js centcom-feed
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "centcom-feed <date>: iran heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, top operations summaries (strike counts, intercept counts).
