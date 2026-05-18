---
description: Re-write a scenario's prose summary + secondOrderEffects from the last 14 days of headlines. Usage: /refresh-summary <scenario>
allowed-tools: Bash, Read, Edit
argument-hint: "<scenarioKey>"
---

Re-write the `summary` and `secondOrderEffects` for scenario `$ARGUMENTS` based on what the world looks like right now.

Steps:

1. First ensure we have fresh headlines cached:
   ```bash
   export PATH="/c/Program Files/nodejs:$PATH"
   cd "$CLAUDE_PROJECT_DIR"
   node .claude/scripts/refresh-headlines.js $ARGUMENTS
   ```

2. Read the cached headlines: `data/cache/headlines-$ARGUMENTS.json`.

3. Read the current scenario config from `data/config.json` to see the existing `summary`, `secondOrderEffects`, `subtitle`, and `query`.

4. Synthesize a NEW `summary` (one sentence, ~30 words, factual) and a NEW `secondOrderEffects` array (3 items, each one sentence, capturing knock-on effects that aren't already in the immediate headline narrative). Stay focused on what would change a trader's risk band. Avoid emojis and hype. Match the tone of the existing fields.

5. Edit `data/config.json`: replace `scenarios.$ARGUMENTS.summary` and `scenarios.$ARGUMENTS.secondOrderEffects` with the new values.

6. Stage + commit: `git add data/config.json data/cache/headlines-*.json && git commit -m "refresh-summary <date>: $ARGUMENTS"`.

7. Restart: `node .claude/scripts/restart-server.js`.

8. Report the old vs new summary side-by-side.
