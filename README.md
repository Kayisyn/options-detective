# Option Obelisk

Desktop options-analysis app for semi-technical traders (formerly Options
Detective). Three integrated layers: **Screener** (candidate detection) →
**Trade Analyzer** (math engine) → **Optimal Strategies** (strategy
advisor), plus a **Position Log**, a risk-free **Sandbox** simulator, and
an **Asset Screener** for ETF discovery.

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
- [x] **Phase 1** — math engine + full test suite (1313 pytest)
- [x] **Phase 2** — data layer (yfinance adapter, 60s cache, liquidity gates,
      quote-age staleness) + persistent engine mode (200 greeks in ~40ms)
- [x] **Phase 3** — Detector (strategy mapping, 7 strategy builders,
      composite scoring, closed-market indicative marks)
- [x] **Phase 4** — Calculator (`POST /calculate`, theoretical repricing)
- [x] **Phase 5** — Recommender (ranking, trade-off facts, broker export)
- [x] **Phase 6** — Frontend views (payoff chart, dollar greeks, strike
      adjustments, export) — verified against live AAPL data
- [x] **Phase 7** — Electron IPC (backend spawned by main, api:* channels,
      native clipboard export)
- [x] **Phase 8** — In-app intelligence (onboarding, tooltips everywhere,
      IV-context guidance, payoff narrative)
- [x] **Phase 9** — Hardening (JSON error handlers, graceful engine
      shutdown, 57 node tests + 1319 pytest green)

### v1.x (post-MVP)

- [x] Expirations spread across the DTE window (daily-expiration products
      like SPY now screen 5-90 DTE, not just the first week)
- [x] Strategy variants (narrow/wide verticals, 4%/8% OTM CSP and covered
      calls, 1.0/1.5 sigma condors), deduplicated on coarse strike grids
- [x] Saved-trades journal (`/trades` API + Journal view; JSON store at
      `backend/data/`, override with `OD_DATA_DIR`)
- [x] Packaged installer — PyInstaller `od-math.exe` (embedded Python
      runtime + numpy/scipy/yfinance) + electron-builder NSIS one-click
      (133 MB, per-user, no admin). See "Building the installer".
- [ ] Backtesting, alerts, portfolio integration

## Building the installer

```powershell
# 1. Frontend bundle
cd frontend; npm run build

# 2. Math engine as a standalone exe (PyInstaller, no Python needed by users)
cd ../backend; npm run build:math          # -> backend/math/dist/od-math/

# 3. One-click Windows installer (electron-builder, NSIS)
cd ../electron; npm run dist               # -> electron/release/Option-Obelisk-Setup-*.exe
```

The installer is per-user (no admin prompt), installs to
`%LOCALAPPDATA%\Programs\Option Obelisk`, and launches on finish. The
position log lives in the user-data folder, not the install folder. The
binary is unsigned, so SmartScreen will ask for "More info → Run anyway"
on first launch.

**For users: download `Option-Obelisk-Setup-<version>.exe`, run it, done.**
No Python, no Node, no terminal.

## Running the desktop app

```powershell
cd electron
npm start                        # spawns the backend, loads frontend/dist

# or against the Vite dev server (hot reload):
cd frontend; npm run dev         # terminal 1
cd electron                      # terminal 2
$env:VITE_DEV_SERVER_URL = "http://localhost:5173"; npm start
```

## Ground rules (from the build brief)

- **No AI arithmetic** — every number comes from the deterministic engine.
- **All data timestamped** — stale data is flagged, never hidden.
- **Liquidity gates** — volume < 50, OI < 100 or spread > 5% is filtered.
- **Max loss is sacred** — always displayed alongside max profit.
- **Validation gates** — bad inputs degrade gracefully, never silently.
