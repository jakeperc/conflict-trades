---
description: CFTC Commitment of Traders — WTI crude managed money net positioning. No API key needed. High net-long = crowded trade (edge reduced). Low/short = contrarian opportunity.
allowed-tools: Bash, Read
---

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "$CLAUDE_PROJECT_DIR"
node .claude/scripts/cot-positioning.js
```

1. Report: managed money net long contracts, week-over-week change, crowding score (0–100), interpretation (crowded/neutral/contrarian), conviction adjustment signal.
2. Context: crowding score >70 = crowded long → watch for reversal risk on oil longs; score <20 = contrarian setup, thesis has room to run.
3. Commit: `git add data/flows/ && git commit -m "cot-positioning <date>: net <n>k, score <score>, <label>"`.
