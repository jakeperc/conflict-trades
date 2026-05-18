---
description: NATO Baltic Sea intercepts / undersea cable / shadow fleet intel. Auto-adjusts Europe scenario heat.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js baltic
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "baltic-status <date>: heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, heat change, top signals.
