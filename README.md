# Conflict Scenario Market Dashboard

Local scenario dashboard for:

- Iran / Strait of Hormuz / Yemen chokepoints
- China / Taiwan escalation
- Russia / NATO / Western Europe conflict stress

## Run

From this folder:

```powershell
$env:PORT=8899
node server.js
```

Then open:

```text
http://localhost:8899
```

Optional custom port:

Double-click `run-dashboard.bat` to start it automatically.

## What it does

- Pulls live headlines from Google News RSS for each scenario
- Pulls quote history from Stooq for all scenario tickers
- Recalculates scenario heat plus upside/downside risk bands on refresh
- Shows 10 stock trade expressions per scenario tab

## Notes

- This is a research dashboard, not personalized investment advice.
- The risk model uses a simple scenario framework based on conviction, live headline heat, and trailing realized volatility.
- If a quote feed is temporarily unavailable, the app will still load and show the trade thesis with `N/A` values for missing quote fields.
