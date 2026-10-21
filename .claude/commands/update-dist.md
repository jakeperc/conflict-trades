---
description: Rebuild the static dist/ folder (v2 UI at the root, legacy at classic/, frozen API JSON), then commit and push to redeploy the site.
allowed-tools: Bash, Read
---

Rebuild the static site that GitHub Pages serves at conflict-trades.jakepercy.com. This needs plain Node only (no `npm install`): the v2 UI is prebuilt into `ui-dist/`.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node build.js
```

Then:

1. Stage and commit the build output: `git add dist/ && git commit -m "update-dist <ISO date>"`.
2. Push: `git push origin master`. The push triggers the "Deploy site" workflow, which publishes `dist/` to GitHub Pages.
3. Report a one-screen summary:
   - What was written to `dist/`: the v2 UI at the root, the legacy UI at `classic/`, the `next/` redirect, and `api/{refresh,trader,config}.json`.
   - Trader equity snapshot (portfolio value and top 3 positions by weight).
   - Number of scenarios included in api/refresh.json, the highest-heat scenario, and the WW3 monitor status (`ww3Status`).
   - Tip: preview the built site locally with `node serve-dist.js` (port 8900).

If the build fails, show the full error output and do not commit. A contract-check failure means a payload would break the UI; `dist/` is left as it was.
