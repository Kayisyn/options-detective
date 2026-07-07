# Options Detective — Algorithm Glossary

> Mirror of the in-app glossary (`frontend/src/lib/glossary.ts` is the
> source of truth rendered by the Help drawer). Conventions here match the
> app: theta per **calendar day**, vega/rho per **1 point**, POP from the
> lognormal model with risk-neutral drift.

## The model

**Black-Scholes.** Prices European options from five inputs: underlying
price, strike, time to expiry, interest rate and volatility. It assumes
lognormal price movement with constant volatility — false in detail, but
the baseline the whole industry quotes in. Every theoretical price, greek
and probability in the app comes from a deterministic Black-Scholes engine
(1,300+ unit tests); nothing is estimated by an AI. Real markets deviate
(volatility smiles, early exercise), so treat outputs as a disciplined
approximation. ([Investopedia](https://www.investopedia.com/terms/b/blackscholes.asp))

**Theoretical price ("theo").** Strike edits in the Calculator have no
market quote, so legs are repriced at Black-Scholes value using each leg's
own IV — labelled "theo": model values, not tradeable marks.

## Greeks

**Delta (Δ).** Dollars gained/lost per $1 up-move; position delta +65 ≈
the exposure of 65 shares. Used to size direction or build delta-neutral
positions.

**Gamma (Γ).** How fast delta changes per $1 move; largest near the money
close to expiry. Short-premium structures are short gamma — whipsaws hurt.

**Theta (Θ).** Dollars per **calendar day** from time passing. Sellers
collect the melt, buyers pay it; income strategies live off positive theta.

**Vega.** Dollars per 1-point IV change. Long options benefit from rising
IV; the classic trap is "IV crush" after events hitting long vega.

**Rho (ρ).** Dollars per 1-point rate change; least important short-dated.

## Volatility

**Implied volatility (IV).** The market's priced-in expected movement,
annualized, backed out of option prices.

**IV rank.** Where today's IV sits in its one-year range (0–100). High →
options rich → premium selling favored; low → cheap → long volatility.
*Caveat:* free data has no IV history, so the app ranks ATM IV against the
past year's **realized-vol** range — a documented proxy for bucketing
high/mid/low.

## Strategies

**Covered call** — income on shares you own; upside capped at the strike.
**Cash-secured put** — paid to wait for a cheaper entry; assignment risk at
the strike. **Vertical spreads** — defined risk: profit AND loss capped at
the strike width, known to the dollar before entry. **Iron condor** — put
spread + call spread sold for credit; a bet on calm with a known worst
case. **Long straddle** — bet on a big move either way, paid in daily
theta. **Short strangle** — premium if nothing happens, theoretically
unlimited loss (tagged in-app; excluded by the defined-risk filter).

## Probability

**POP.** Exact breakevens from the payoff, then the lognormal distribution
integrated over profitable regions (risk-neutral drift). 62% POP = 62 of
100 model paths end profitable. Limitations: model-based, silent on
magnitude, ignores early management; high POP usually pairs with small
wins and occasional large losses.

**Probability of max profit.** Chance of expiring in the maximum-profit
zone; always ≤ POP; zero when max profit is unbounded or a single point.

## Scoring & data

**Composite score.** `10 × (w·POP + w·RoR + w·Theta + w·CapEff + w·Liq)`,
components normalized 0–1 by the backend. Default weights 30/20/20/15/15;
adjustable in Settings → Scoring weights (presets + saved profiles). Every
card shows its breakdown.

**Recommendations.** The same deterministic ranking under your weights,
plus factual trade-off comparisons. No number is AI-generated.

**Data freshness.** Free delayed quotes, 60s cache; staleness measured
from the chain's last trade. Closed markets → "indicative" closing marks:
verify live spreads before trading.
