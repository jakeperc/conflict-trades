---
description: Bab el-Mandeb / Red Sea Houthi attack intel. Auto-adjusts Iran scenario heat.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js bab-el-mandeb
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "bab-el-mandeb-status <date>: heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, heat change, top signals.
