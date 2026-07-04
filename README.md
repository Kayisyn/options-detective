# Options Detective

Desktop options-analysis app for semi-technical traders. Three integrated
layers: **Detector** (screener) → **Calculator** (math engine) →
**Recommender** (strategy advisor).

Stack: Electron + React/Tailwind (frontend), Node.js/Express (backend),
Python + scipy (math engine, called as a subprocess).

## Repository layout

```
electron/    Electron main process + preload IPC bridge
frontend/    React + Vite + Tailwind renderer (3 views)
backend/     Express API (detect / calculate / recommend / data)
backend/math Python math engine: Black-Scholes, greeks, IV, payoff,
             probability, sizing — plus its test suite
docs/        architecture, strategy mapping, API schema
```

## Setup

Prereqs: Node.js >= 18, Python >= 3.11.

```powershell
# 1. Math engine (Python)
cd backend/math
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest tests        # must be all green

# 2. Backend (Express)
cd ..
npm install
npm run dev                                        # http://localhost:3001

# 3. Frontend (React/Vite)
cd ../frontend
npm install
npm run dev                                        # http://localhost:5173

# 4. Electron shell (optional during early phases)
cd ../electron
npm install
npm start
```

Smoke test the full pipeline (Express → Python → back):

```powershell
irm http://localhost:3001/health
# { "status": "ok", "mathEngine": "ok", "sampleBsCall": 10.4506... }
```

## Build status

- [x] **Phase 0** — project scaffold (Electron, React, Express, Python)
- [x] **Phase 1** — math engine + full test suite (**1290 tests**)
- [ ] Phase 2 — data layer (yfinance adapter, caching, liquidity gates)
- [ ] Phase 3 — Detector (strategy mapping, candidate generation, scoring)
- [ ] Phase 4 — Calculator (candidate analysis endpoint)
- [ ] Phase 5 — Recommender (ranking + trade-offs)
- [ ] Phase 6 — Frontend views (payoff chart, greeks, navigation)
- [ ] Phase 7 — Electron IPC wiring + clipboard export
- [ ] Phase 8 — In-app intelligence (tooltips, onboarding, narrative)
- [ ] Phase 9 — Hardening

## Ground rules (from the build brief)

- **No AI arithmetic** — every number comes from the deterministic engine.
- **All data timestamped** — stale data is flagged, never hidden.
- **Liquidity gates** — volume < 50, OI < 100 or spread > 5% is filtered.
- **Max loss is sacred** — always displayed alongside max profit.
- **Validation gates** — bad inputs degrade gracefully, never silently.
