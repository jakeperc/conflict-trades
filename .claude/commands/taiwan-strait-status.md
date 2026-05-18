---
description: Taiwan Strait PLA ADIZ / median-line / blockade rehearsal intel. Auto-adjusts Taiwan scenario heat.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js taiwan-strait
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "taiwan-strait-status <date>: heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, heat change, top signals.
