---
description: Pull Hormuz chokepoint intel (tanker seizures, UKMTO incidents, CENTCOM bulletins). Auto-adjusts Iran heatBase.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js hormuz
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "hormuz-status <date>: heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: aggregate score, heat change, top 5 signal headlines.
