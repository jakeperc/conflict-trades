---
description: Rebuild the static dist/ folder from current data and public/ assets, then commit.
allowed-tools: Bash, Read
---

Rebuild the static site for FTP deployment.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node build.js
```

Then:

1. Stage and commit the build output: `git add dist/ && git commit -m "update-dist <ISO date>"`.
2. Report a one-screen summary:
   - Files written to `dist/` (index.html, app.js, styles.css, api/refresh.json, api/trader.json, api/config.json).
   - Trader equity snapshot (portfolio value and top 3 positions by weight).
   - Number of scenarios included in api/refresh.json and the highest-heat scenario.
   - Reminder: preview locally with `node serve-dist.js` (port 8900) before FTP upload.

If the build fails, show the full error output and do not commit.
