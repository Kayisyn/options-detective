# Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ELECTRON (main process)                                 │
│  Window management · IPC routing · clipboard export      │
├──────────────────────────────────────────────────────────┤
│  FRONTEND (React renderer, Vite, Tailwind)               │
│  View 1 Detector · View 2 Calculator · View 3 Recommender│
├──────────────────────────────────────────────────────────┤
│  BACKEND (Node.js + Express, port 3001)                  │
│  /detect · /calculate · /recommend · /data · /health     │
├──────────────────────────────────────────────────────────┤
│  MATH ENGINE (Python subprocess, backend/math)           │
│  Black-Scholes · greeks · IV solver · payoff ·           │
│  probability · sizing                                    │
├──────────────────────────────────────────────────────────┤
│  DATA LAYER (Phase 2: yfinance adapter + cache + gates)  │
└──────────────────────────────────────────────────────────┘
```

## Process model

- **Dev:** three processes — Vite dev server (5173), Express (3001), and
  optionally the Electron shell pointing at Vite. The browser is a fine dev
  target until Phase 7.
- **Packaged:** Electron loads `frontend/dist`, spawns Express as a child,
  and routes renderer calls through the preload bridge (`api:*` channels).
- **Math engine:** short-lived Python subprocess per request
  (`backend/services/mathEngine.js` → `backend/math/engine.py`). One JSON
  object on stdin, one on stdout. Simple, crash-isolated, and fast enough
  for v1 (~150 ms/call including interpreter startup; batch endpoints can
  amortize later if profiling demands it).

## Math conventions (locked — tests enforce them)

| Quantity | Unit |
|---|---|
| T | years (calendar days / 365) |
| r | annualized, continuously compounded |
| sigma | annualized (0.20 = 20%) |
| delta | per $1 underlying move |
| gamma | delta change per $1 move |
| theta | **per calendar day** (annual / 365) |
| vega | **per 1 IV percentage point** (raw / 100) |
| rho | **per 1 rate percentage point** (raw / 100) |
| option prices | per share; × 100 multiplier for contract dollars |
| payoff / P&L | dollars for the whole position |
| max_loss | positive dollars at risk; `inf`/`null` = unbounded |

Probabilities use the lognormal terminal distribution with **risk-neutral
drift r** — consistent with the pricing model, no return forecasts baked in.

Payoff analysis is **exact**, not grid-sampled: expiry payoffs are piecewise
linear with kinks only at strikes, so breakevens, max profit and max loss are
solved analytically (`payoff.payoff_summary`).

## Key decisions

- **Python venv lives at `backend/math/.venv`.** The Node bridge auto-detects
  it (Windows and POSIX paths) before falling back to `PYTHON_BIN` / `python`.
- **Express 5**, CommonJS modules in backend and electron; ESM in frontend.
- **Engine subprocess always exits 0** when it emitted a JSON response;
  `{"ok": false}` is a domain error (HTTP 422), a non-zero exit is an
  infrastructure error (HTTP 502).
- **Renderer security:** contextIsolation on, nodeIntegration off, sandbox
  on. The renderer only ever sees the typed preload bridge.
