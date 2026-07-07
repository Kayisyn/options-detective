# Options Detective v0.1.0 (beta)

Desktop options analysis for semi-technical traders:
**Detect** (screen every expiration × strategy) → **Calculate** (greeks,
payoff, probabilities) → **Recommend** (ranked candidates, trade-offs,
broker-ready export). Plus a saved-trades journal.

## Install

1. Download `Options-Detective-Setup-0.1.0.exe`
2. Run it — no Python, no Node, no terminal. Installs per-user (no admin)
   and launches when done.
3. The binary is unsigned: if SmartScreen appears, choose
   **More info → Run anyway**.

## What's inside

- Deterministic math engine (Black-Scholes, greeks, IV solver, exact
  breakevens, lognormal probabilities) — 1,319 unit tests
- Free intraday data via Yahoo Finance; liquidity gates and staleness
  flags on every quote (closed-market marks are labelled "indicative")
- Seven strategies: covered calls, cash-secured puts, call/put verticals,
  iron condors, straddles, strangles — with width/strike variants
- Composite ranking: POP 30% · risk/reward 20% · theta 20% · capital
  efficiency 15% · liquidity 15%

## Known limitations (beta)

- US options only; quotes are delayed/free-tier and can be stale outside
  market hours (always flagged, never hidden)
- IV rank is a realized-vol-range proxy (documented in-app)
- Not investment advice; verify every order in your broker before sending
