# Strategy Mapping (Detector Logic — Phase 3)

Maps `{directionalView, ivRank, allowedStrategies}` to ranked eligible
strategies.

| Directional | IV Rank | Primary Strategies | Secondary | Note |
|---|---|---|---|---|
| Bullish | High (>70) | Call vertical (debit), Long call, Cash-secured put | Synthetic long | IV selling premium; defined-risk preferred |
| Bullish | Low (<30) | Call vertical (debit), Long call | Call ratio | IV buying; cheaper entry |
| Bearish | High (>70) | Put vertical (debit), Long put, Short call / iron condor | Short strangle | Premium selling; defined-risk |
| Bearish | Low (<30) | Put vertical (debit), Long put | Put ratio | Cheap puts; defined-risk |
| Neutral | High (>70) | Iron condor, Short strangle, Call ratio spread | Covered call (if own) | Sell premium in defined-risk |
| Neutral | Low (<30) | Long straddle, Long strangle, Calendar spread | — | Long vol; bet on expansion |
| Income (any view) | High (>70) | Covered call (if own), Cash-secured put, Iron condor | Short strangle | Premium selling; income focus |
| Income (any view) | Low (<30) | Covered call (if own), Cash-secured put | Calendar spread | Lower income, but cheaper |

Mid IV rank (30–70): union of the high- and low-IV lists, scored normally —
the composite score settles the ranking.

## Composite score (0–10)

| Component | Weight | Source |
|---|---|---|
| Probability of profit (POP) | 0.30 | `prob_of_profit` |
| Risk/reward ratio | 0.20 | `payoff_summary` |
| Theta (decay in your favor) | 0.20 | net greeks |
| Capital efficiency | 0.15 | max profit / capital required |
| Liquidity | 0.15 | volume, OI, bid-ask spread |

Hard gates applied **before** scoring (a candidate that fails any gate is
dropped, not down-ranked): volume ≥ 50, OI ≥ 100, spread ≤ 5%, data age
within freshness limit, defined-risk-only filter when the user sets it.
