# Option Obelisk — Area Notes

Running project notes. (Created 2026-07-17 from a session request that
referenced `/areas/option-obelisk.md`; no existing file was found on this
machine — relocate to the real vault path if one exists elsewhere.)

## Pre-Launch Feature Bundle

## Implementation Status (v1.7.0 Complete)

**v1.7.0 SHIPPED:**
- ETF Screener: 8 new filters (expense, AUM, dividend, IV, volatility, theta, volume, 52w perf)
- CAD Currency: Historical rate preservation, dual display (USD | CAD)
- Bug fix: Single-symbol quote fetch (yfinance MultiIndex KeyError)

**UI Bug Identified:**
- Position cards missing "Premium Collected" line
- Form accepts premium correctly, data stored correctly, but card UI doesn't display it
- Affects: covered calls, spreads, strangles, all multi-leg trades
- Fix: Add premium row to position card template

**Next: v1.7.1 (Onboarding) — Prompt ready to build**

---

## Pre-Launch Suite Status (v1.9.2 Complete — 2026-07-20)

MASTER-BUILD-DIRECTIVE executed end-to-end on branch
`feature/pre-launch-suite`:

- **Phase 0** `96ef44a` — renumbered v1.9.0 → v1.7.0 (versions, comments,
  Settings-footer version display, isolated dev stack backend-alt/3002 +
  frontend-alt/5174 `--mode isolated`)
- **v1.7.1** `ffe035f` — onboarding: 4-step tutorial + ready screen,
  per-account `onboardingComplete-<username>`, fresh accounts only
- **v1.7.2** `b7e5d69` — Analytics view (overview/equity curve/metrics/
  by-strategy, range + scope) + Settings → Account (password change,
  export/import/clear, delete account); `/account` + auth routes
- **v1.8.0** `27199cd` — CSV column picker (22 cols, %gain), watchlist
  CSV, backup schema carries account identity, 150-trade round-trip test
- **v1.8.1** `a7e6caa` — strategy templates (save/load/manage/file
  export-import, `strategies:<username>`)
- **v1.8.2** `9e4ecab` — advanced analytics (Sharpe/Sortino/Calmar,
  drawdown chart, expectancy/recovery, MAE/MFE scatter)
- **v1.9.0** `e4bec96` — alerts (P&L/expiry/IV-rank, OS notification +
  toast fallback, dedup ledger, 50-entry history, Settings → Alerts)
- **v1.9.1** `7a7542b` — ⋮ menu + Feedback & Bugs (pre-filled GitHub
  issue, NO embedded token by design, offline queue)
- **v1.9.2** `9cb50a2` — premium display fixed: cards show
  collected/paid total (entryPrice × qty × multiplier)

126/126 backend tests; every phase live-verified. Published as tag
v1.9.2 (the directive's "v1.7.0" publish label was shorthand — the tag
matches the shipped app version).*
