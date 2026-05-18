---
description: Add a new scenario tab from a predefined template. Usage: /add-scenario <key>  (e.g. korea)
allowed-tools: Bash, Read
argument-hint: "<scenarioKey>"
---

Add scenario `$ARGUMENTS` to the dashboard.

Available templates are in `.claude/templates/scenarios/`. Currently: `korea`.

Run:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/add-scenario.js $ARGUMENTS
```

Then:

1. Commit: `git add data/config.json && git commit -m "add-scenario $ARGUMENTS"`.
2. Restart: `node .claude/scripts/restart-server.js`.
3. Report: scenario title, trade count, new tickers added, list of all scenarios now active.

The frontend already iterates `Object.values(state.payload.scenarios)` and dynamically renders tabs from `renderTabs()`, so no UI changes are needed — the new tab appears on next dashboard reload.
