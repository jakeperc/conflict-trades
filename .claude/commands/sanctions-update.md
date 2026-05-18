---
description: OFAC SDN list deltas - new Iran/Russia/DPRK sanctions designations, dark-fleet tanker additions. Adjusts Iran heat.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js sanctions-update
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "sanctions-update <date>: iran heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, top designations, any shadow-fleet tanker mentions.

Note: secondary-sanction enforcement on Chinese refineries directly affects Iranian oil flows. Shadow-fleet additions are a leading indicator for FRO/TNK rate spikes.
