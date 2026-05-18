---
description: Tanker/dry-bulk/container freight proxies (FRO, TNK, DHT, INSW, EURN, STNG, BDRY, ZIM, FDX). Reports 5d/22d momentum. Read-only.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/freight-rates.js
```

1. Commit: `git add data/flows/ && git commit -m "freight-rates reading <date>"`.
2. Report: tanker average 5d move, biggest movers, interpretation line.

Use before sizing FRO/TNK/USO trades — when tanker proxies are tightening 5d, shipping longs have follow-through.
