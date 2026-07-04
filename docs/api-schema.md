# API Schema

## REST endpoints (Express, port 3001)

| Endpoint | Phase | Status |
|---|---|---|
| `GET /health` | 0 | **live** — verifies Express + Python engine round trip |
| `POST /calculate/engine` | 1 | **live** — raw math engine passthrough |
| `GET /data/:symbol` | 2 | 501 stub |
| `POST /detect` | 3 | 501 stub |
| `POST /calculate` | 4 | 501 stub |
| `POST /recommend` | 5 | 501 stub |

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
