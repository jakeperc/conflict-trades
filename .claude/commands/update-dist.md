---
description: Rebuild the static dist/ folder from current data, public/ (legacy UI) and ui-dist/ (v2 UI), then commit.
allowed-tools: Bash, Read
---

Rebuild the static site for FTP deployment. This needs plain Node only (no `npm install`): the v2 UI is prebuilt into `ui-dist/`.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node build.js
```

Then:

1. Stage and commit the build output: `git add dist/ && git commit -m "update-dist <ISO date>"`.
2. Report a one-screen summary:
   - What was written to `dist/`: the legacy UI at the root (index.html, app.js, styles.css), the v2 UI at `next/`, and `api/{refresh,trader,config}.json` (also copied to `next/api/`).
   - Trader equity snapshot (portfolio value and top 3 positions by weight).
   - Number of scenarios included in api/refresh.json and the highest-heat scenario.
   - Reminder: preview locally with `node serve-dist.js` (port 8900) before FTP upload, and `python scripts/upload_ftp.py --dry-run` to see the upload plan.

If the build fails, show the full error output and do not commit. A contract-check failure means a payload would break the UI; `dist/` is left as it was.
