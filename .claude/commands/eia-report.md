---
description: EIA weekly petroleum report — crude draw/build vs 5yr avg. Adjusts Iran scenario heat. Requires EIA_API_KEY env var (free at eia.gov/opendata).
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/eia-report.js
```

1. Report: latest crude draw/build (million barrels), deviation vs 5-year average for that week, Cushing levels, heat adjustment applied to Iran scenario.
2. If `EIA_API_KEY` is missing, show the registration hint from the output.
3. Commit: `git add data/config.json data/flows/ && git commit -m "eia-report <date>: <draw/build>Mb surprise, heat <old>→<new>"`.
4. Restart: `node .claude/scripts/restart-server.js`.
