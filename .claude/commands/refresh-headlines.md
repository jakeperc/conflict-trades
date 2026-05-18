---
description: Pull latest Google News for each scenario, score keyword hits, adjust heatBase. Usage: /refresh-headlines [iran|taiwan|europe|korea]
allowed-tools: Bash, Read, Edit
argument-hint: "[scenarioKey]"
---

Refresh headline-driven heat for a scenario (or all of them).

The scenario key (optional) is `$ARGUMENTS`. Pass it through to the script; if empty, all scenarios refresh.

Run:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/refresh-headlines.js $ARGUMENTS
```

Parse the JSON. Then:

1. Stage `data/config.json` and any new files under `data/cache/`. Commit with `refresh-headlines <date>: <scenario-keys> heat <old> → <new>`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report a one-line summary per scenario: `iran: heat 82 → 88 (Δ+6, keyword score 42, top headline: "...")`.
