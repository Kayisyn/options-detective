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

*Note (Fable, 2026-07-19): version discrepancy RESOLVED per
MASTER-BUILD-DIRECTIVE Phase 0 — the release originally shipped in-app as
v1.9.0 (commits d35ed27…d602491) was renumbered to **v1.7.0** to match the
roadmap. All package.json versions and source comments now say v1.7.0; the
Settings panel footer displays the app version. The pre-launch suite
(v1.7.1 onboarding → v1.9.2 premium-display fix) is being built on branch
`feature/pre-launch-suite`.
Premium-display bug confirmed in code: `Journal.tsx` cards render the
per-share entry ("$2.50 × 2") but never the total dollar premium
(entryPrice × qty × multiplier) — fix scheduled as v1.9.2 (Phase 8).*
