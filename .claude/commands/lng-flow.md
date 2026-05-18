---
description: LNG flow intel - Cheniere cargoes, TTF/JKM spreads, Qatar/Yamal exports, Russian LNG ban progress. Auto-adjusts Europe heat.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js lng-flow
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "lng-flow <date>: heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, heat change, top signals (Cheniere/Sabine/TTF/JKM mentions are highest-weight).
