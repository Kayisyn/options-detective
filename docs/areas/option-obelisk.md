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

*Note (Fable, 2026-07-17): the release described above shipped in-app as
**v1.9.0** (package.json versions, git commits d35ed27…d602491, and the
built app all say 1.9.0), per the v1.9.0 build prompt's own "ship as
v1.9.0" instruction. If the roadmap is being renumbered so this counts as
v1.7.0 and onboarding becomes v1.7.1, the app versions should be
renumbered to match (or this label adjusted) — flag which way to go.
Bug confirmed in code: `Journal.tsx` cards render the per-share entry
("$2.50 × 2") but never the total dollar premium
(entryPrice × qty × multiplier).*
