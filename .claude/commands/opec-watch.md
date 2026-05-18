---
description: OPEC+ meeting outcomes, production decisions, spare-capacity signals. Adjusts Iran heat (energy axis).
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/intel.js opec-watch
```

1. Commit: `git add data/config.json data/flows/ && git commit -m "opec-watch <date>: iran heat <old> → <new>"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: score, top OPEC headlines, any production cut/increase decisions.

Note: OPEC+ supply lift partially offsets Hormuz/Iran disruption risk premium. If `/oil-curve` shows Brent supply-tight while `/opec-watch` shows OPEC pushing volume, the trade is to fade energy longs.
