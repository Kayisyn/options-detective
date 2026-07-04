# API Schema

## REST endpoints (Express, port 3001) — all live

| Endpoint | Purpose |
|---|---|
| `GET /health` | Express + Python engine round trip |
| `GET /data/:symbol?refresh=1&expirations=6` | normalized chains after liquidity gates, IV rank, data/quote age, stale flag |
| `POST /detect` | screen all expirations × eligible strategies → ranked candidates |
| `POST /calculate` | full analysis of one position (greeks, payoff, POP, sizing) |
| `POST /calculate/engine` | raw math engine passthrough |
| `POST /recommend` | top-5 ranking + trade-off facts + broker export text |

### POST /detect

```json
{ "symbol": "AAPL", "directionalView": "neutral|bullish|bearish|income",
  "capital": 25000, "riskTolerancePct": 2, "maxLossDollars": null,
  "definedRiskOnly": false, "minDTE": 5, "maxDTE": 90, "refresh": false }
```

Response: `{symbol, price, ivRank, ivBand, strategiesScreened, generated,
candidates[], dataAgeSeconds, stale, warnings[]}`. Candidates carry
`meta.marksQuality: "live" | "indicative"` — indicative means the market was
closed and marks are last-trade/closing values.

### POST /calculate

```json
{ "legs": [{ "type": "long_call", "strike": 310, "price": 8.0, "qty": 1, "iv": 0.27 }],
  "spot": 308.63, "dte": 45, "sigma": 0.27, "riskFreeRate": 0.04,
  "capital": 25000, "riskTolerancePct": 2,
  "strategyType": "call_vertical",
  "repriceTheoretical": false }
```

`sigma` falls back to the average leg IV. `repriceTheoretical: true` replaces
every option mark with its Black-Scholes value at the leg's IV (used after
strike adjustments; repriced legs return `"theoretical": true`).

### Liquidity gates (data layer)

- removed outright: `volume < 50`, `openInterest < 100`, no usable price
- flagged `illiquid` (excluded from live-market candidates): dollar spread
  `> max(5% of mid, $0.30)`
- flagged `indicativeOnly` (no bid/ask book): usable only in stale sessions,
  with warnings and `marksQuality: "indicative"`
- staleness: `quoteAgeSeconds` from the chain's most recent trade
  (`lastTradeAt`), falling back to fetch age; stale after 15 minutes

### POST /calculate/engine (live)

```json
// request
{ "fn": "bs_call_greeks", "args": { "S": 100, "K": 100, "T": 1, "r": 0.05, "sigma": 0.2 } }
// 200 -> { "result": { "delta": 0.6368, "gamma": 0.0188, "theta": -0.0176, "vega": 0.3752, "rho": 0.5323 } }
// 422 -> { "error": "S (underlying price) must be > 0, got -5.0" }   (domain)
// 502 -> { "error": "failed to start math engine: ..." }             (infrastructure)
```

## Math engine subprocess protocol

One JSON object on stdin → one JSON object on stdout, exit code 0.

```json
{ "fn": "<function>", "args": { ... } }
{ "ok": true,  "result": ... }        // or
{ "ok": false, "error": "message" }   // invalid inputs, still exit 0
```

**Convention: non-finite numbers serialize as `null`.** A `null`
`max_profit`/`max_loss` means *unbounded* — render as ∞, never as zero.

### Functions

| fn | args | returns |
|---|---|---|
| `bs_call_price`, `bs_put_price` | `S, K, T, r, sigma` | price per share |
| `bs_call_greeks`, `bs_put_greeks` | `S, K, T, r, sigma` | `{delta, gamma, theta, vega, rho}` (theta/day, vega & rho per 1 point) |
| `implied_volatility` | `market_price, S, K, T, r, option_type` | annualized sigma |
| `multi_leg_payoff` | `legs, underlying_prices[, multiplier]` | P&L $ array |
| `payoff_summary` | `legs[, multiplier]` | `{max_profit, max_loss, breakevens}` — exact |
| `payoff_curve` | `legs[, current_price, multiplier, num_points, span]` | `[{underlyingPrice, profit}]` |
| `prob_itm` | `S, K, T, sigma[, r, option_type]` | 0–1 |
| `prob_of_profit` | `legs, current_price, T, sigma[, r, multiplier]` | 0–1 |
| `prob_max_profit` | `legs, current_price, T, sigma[, r, multiplier]` | 0–1 |
| `risk_based_size` | `max_loss_per_contract, account_equity[, risk_pct, max_loss_dollars]` | whole contracts |
| `position_summary` | `contracts, cost_per_contract, account_equity` | `{contracts, total_cost, pct_of_account}` |

### Leg schema

```json
{ "type": "long_call | short_call | long_put | short_put | long_stock | short_stock",
  "strike": 100.0,      // option legs only
  "price": 5.50,        // entry per share ("premium" accepted as alias)
  "qty": 1 }            // contracts for options, SHARES for stock legs
```

## GET /data/:symbol — normalized schema (Phase 2 target)

```json
{
  "symbol": "AAPL",
  "price": 182.45,
  "chains": {
    "2026-08-21": {
      "calls": [ { "strike": 150.0, "bid": 32.20, "ask": 32.50, "mid": 32.35,
                   "volume": 500, "openInterest": 12000,
                   "impliedVolatility": 0.22,
                   "timestamp": "2026-07-03T14:32:00Z" } ],
      "puts": [ ... ]
    }
  },
  "ivRank": 65,
  "dataAge": 45
}
```
