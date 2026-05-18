---
description: DPRK missile launches / nuclear test / Yellow Sea provocations. Auto-adjusts Korea scenario heat.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js korea-launches
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "korea-launches <date>: heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, heat change, top signals.
