# Code Optimization Audit — v1.9.3

**Auditor:** Fable (Claude Code) · **Date:** 2026-07-20 · **Commit audited:** `9eda0a5` (main)
**Scope:** Frontend (React/TS), Backend (Node/Express), Python math engine, Electron main process.
**Method:** Static analysis over the real tree — LOC/complexity inventory, `npm audit`, dependency graph, a measured production build (including a throwaway chunk-split build to size dependencies), and pattern greps for render/leak/duplication/a11y/security issues. No runtime profiler was attached (see *Measurement caveats*), so latency figures are labelled as measured, estimated, or reasoned.

---

## Executive Summary

Option Obelisk is a **clean, well-architected codebase** with no critical security or correctness defects. Frontend and backend production dependencies report **0 vulnerabilities**; the Electron process is hardened (`contextIsolation`, `sandbox: true`, `nodeIntegration: false`, external-link handler). The Python engine's hot path is already numpy-vectorized. Test coverage is real (126 backend + ~1,300 pytest).

The genuine opportunities are concentrated and mostly low-effort:

- **1 robustness gap worth fixing first:** no React error boundary — any render throw blanks the whole app.
- **2 high-ROI performance optimizations:** code-split the charting library (**84 KB gzipped, 36% of the bundle**, measured) off the initial load; and stop 8 large components from subscribing to the entire store.
- **~5 code-quality cleanups:** extract 3 duplicated helpers and a 6×-repeated basis calculation; the rest is polish.

There are **no "critical" issues in the security sense** — this section header exists in the template, so the one item that most warrants doing before others (the error boundary) is listed there, with an honest severity note.

| Category | Count | Headline |
|---|---|---|
| Critical / correctness | 0 | No crashes, no data-loss, no injection paths found |
| Robustness gaps | 1 | No error boundary (white-screen on render throw) |
| Performance opportunities | 3 | Chart code-split · whole-store subscriptions · list virtualization (future) |
| Code-quality cleanups | 5 | Duplicated `cssVar`/`pnlClass`/basis math; large files |
| Security findings | 1 (info) | Electron **dev-only** toolchain CVEs; 0 in shipped deps |
| Accessibility gaps | 3 | Focus-trap in modals, skip-link, a few live-region gaps |

**Estimated total implementation time for everything worth doing: ~6–8 hours.** None of it blocks launch.

---

## Measurement caveats (read this before quoting numbers)

- **Bundle sizes are measured** from a real `vite build` and a throwaway `manualChunks` split build (reverted immediately; nothing committed).
- **Render-frequency claims are reasoned** from the store's `set()` call sites and timer cadence, not captured with React DevTools Profiler. They describe *when re-renders fire*, which is deterministic; they do **not** claim a measured millisecond cost.
- **No fabricated latencies.** Where the template asks for "Current: Xms → Target: Yms", I give the mechanism and an honest basis instead of inventing a stopwatch reading.

---

## Codebase Inventory

| Layer | Files | LOC (excl. tests/vendor) |
|---|---|---|
| Frontend `src` (TS/TSX) | 60 | 12,162 |
| Backend services + routes (JS) | ~30 | 5,087 |
| Python math engine | 11 | 1,454 |

**Largest files (LOC):**

| File | LOC | Note |
|---|---|---|
| `frontend/src/components/shared/SettingsPanel.tsx` | 1,253 | 43 functions / 8 tab components in one file |
| `frontend/src/store.ts` | 1,087 | 119 actions; single zustand store |
| `frontend/src/components/EtfScreener.tsx` | 792 | filters + sort + columns + recs + modals |
| `frontend/src/components/Journal.tsx` | 724 | rows + trash + log modal + close modal + CSV modal |
| `backend/services/tradeStore.js` | 506 | trade CRUD + trash + FX stamping |
| `backend/services/paperTrading.js` | 479 | paper engine (settlement, assignment, marks) |

These are large but **cohesive** — each is one feature area with co-located sub-components. They read fine; the only concrete downside is that `SettingsPanel.tsx` and `store.ts` are approaching the size where splitting would help editor performance and review scope (see Code Quality #4). No cyclomatic-complexity hotspots stood out; the deepest logic (`detector.js`, `paperTrading.js` settlement) is already decomposed into helpers.

---

## Robustness Gap (Fix First)

### 1. No React error boundary — a single render throw blanks the app

**Impact:** There is no `componentDidCatch` / `getDerivedStateFromError` anywhere in `frontend/src`. In an Electron desktop app there is no browser "reload" affordance the user reaches for; an uncaught render error (a malformed stored trade, an unexpected `null` from a future data shape) leaves a white window with no recovery path.

**Fix:** Add one class `ErrorBoundary` at the App root wrapping `<MainApp/>` (and ideally each lazy route once code-splitting lands), rendering a themed "Something went wrong — reload" panel with a Reset button that clears the offending view. ~30–45 min.

**Severity note:** This is *robustness*, not a live bug — nothing currently throws. It's in "fix first" because it's the highest-value, lowest-effort safety net for a shipping desktop app.

---

## Performance Optimizations (High ROI)

### 1. Code-split the charting library off the initial load — **measured 84 KB gzipped (36% of bundle)**

**Current (measured, `vite build` at `9eda0a5`):**
- Single JS chunk: **824,626 B raw / 230,782 B gzipped**
- CSS: 48,823 B raw / 8,633 B gzipped
- Build warns: "Some chunks are larger than 500 kB."

**Throwaway split build (measured, reverted):** isolating `recharts` + `d3-*` + `victory-vendor` into their own chunk produced:
- `charts` chunk: **333,425 B raw / 83,857 B gzipped**
- app `index`: 272,045 B / 74,668 B gzipped
- other `vendor` (React, zustand): 218,858 B / 72,887 B gzipped

**The lever:** recharts is imported by exactly **three components — `Analytics.tsx`, `PaperTrading.tsx`, `PayoffChart.tsx`** (grep-confirmed). **None render on the initial Home view.** Wrapping those three in `React.lazy` + `Suspense` (or, at minimum, adding a `manualChunks` split) moves ~84 KB gzipped off the critical path so the first paint ships ~64% smaller.

- **Current initial JS:** 230 KB gzipped (everything).
- **Target initial JS:** ~147 KB gzipped (charts deferred until the user opens Analyzer/Sandbox/Analytics).
- **Effort:** ~1–1.5 h (lazy wrappers + a Suspense fallback + verify the three views still mount). Zero risk to the math or data layers.

### 2. Eight large components subscribe to the *entire* store

**Finding (grep-confirmed):** these use `const s = useStore()` with **no selector** —
`Calculator`, `Detector`, `EtfScreener`, `Home`, `IndexComponentScreener`, `Journal`, `PaperTrading`, `Recommender`.

In zustand v4 a selector-less `useStore()` subscribes to **every** state change. The store has **97 `set({...})` call sites**, and background timers fire writes on a schedule the user isn't interacting with:
- market pulse poll — `set({ pulse })` every **60 s** (`App.tsx`)
- paper marks — `processPaper({quiet})` every **60 s** (`PaperTrading.tsx`)
- FX hydration, alert sweeps, etc.

So e.g. the Journal subtree re-renders every 60 s when the pulse updates, even though nothing it displays changed. **The expensive derived data is already `useMemo`-guarded** (`journalStats`, `sorted`, `dashboardStats`), so the cost is React *reconciliation* of large subtrees (700+ lines, many rows), not recomputation — **moderate, not severe**, and invisible on a fast machine but real on the 100-position path.

**Fix:** replace whole-store grabs with field selectors (`const savedTrades = useStore(s => s.savedTrades)`), or `useStore(useShallow(s => ({...})))` for multi-field cases. App.tsx already models the right pattern (18 discrete selectors). **Effort ~1.5–2 h** across the 8 files; mechanical and testable.

### 3. Long lists are not virtualized (future-proofing, not urgent)

`Journal`, `EtfScreener` (49-ETF universe), and the Trash view render every row. For today's scale (tens of positions, 49 ETFs) this is **fine and simpler than virtualization**. The roadmap's "100+ positions / no lag" target is the trigger: at ~150+ rows with the glass/glow per-row effects, first render and theme-switch reflow become noticeable. **Recommendation:** leave as-is now; add `react-window` to the Journal + ETF tables only if/when a user library crosses ~150 rows. **Effort when needed: ~2 h.** Not counted in the launch total.

### Python / backend hot paths — reviewed, no action

- `payoff.py` is **already numpy-vectorized** (`np.asarray`, `np.maximum` over the price grid); the per-leg loop is O(legs) = 2–4. No win available.
- `iv_solver.py` Newton loop is inherently iterative (root-finding, capped `max_iter`). Correct as written.
- `etf_metrics.py` ATR loop runs over ~250 daily bars per ETF — negligible; vectorizing would trade clarity for microseconds.
- The engine runs **persistent/warm** (`engine.py --serve`, ~40 ms for a 200-item batch). Good.

---

## Code Quality (Nice-to-Have)

1. **Duplicated `cssVar` helper (3×)** — identical implementations in `Analytics.tsx`, `PaperTrading.tsx`, `PayoffChart.tsx`. Extract to `lib/cssVar.ts`. ~15 min.
2. **Duplicated `pnlClass` helper (3×)** — identical in `Analytics.tsx`, `Journal.tsx`, `PaperTrading.tsx`. Extract to `lib/format.ts` alongside `money`/`pct`. ~15 min.
3. **Basis math repeated 6×** — `Math.abs(t.entryPrice) * t.entryQty * t.multiplier` appears in `analytics.ts` (×2), `journalCsv.ts`, `journalStats.ts` (×2), and `PremiumTotal.tsx`. `PremiumTotal.tsx` already **exports** `premiumTotal(t)` — point the other five at it (or a shared `positionBasis(t)` in `journalStats.ts`). Single source of truth for the premium/debit basis, which several features depend on. ~30 min.
4. **Split the two largest files** — `SettingsPanel.tsx` (1,253 LOC / 8 tab components) and `store.ts` (1,087 LOC / 119 actions). Extract each Settings tab to `components/shared/settings/*Tab.tsx`, and split the store into slice files combined at creation. Improves review scope and editor responsiveness; **no behavior change**. ~2 h, optional.
5. **`dteOf` / `signedMoney`** are re-declared locally — minor; fold into `lib/format.ts` opportunistically when touching those files.

---

## Dependency Cleanup

**Frontend (prod):** `react`, `react-dom`, `recharts`, `zustand` — all current, `0` vulnerabilities, no bloat (no lodash/moment/dayjs — date math is hand-rolled and small). **Nothing to remove.**

**Backend (prod):** `express@5`, `cors` — `0` vulnerabilities. Minimal by design. **Nothing to remove.**

**Electron (dev):** `electron`, `electron-builder`. `npm audit` reports **11 vulnerabilities (10 high, 1 critical)** — but `npm audit --omit=dev` reports **0**. Every finding is in the **build toolchain** (`node-gyp` → `make-fetch-happen` → `cacache`/`tar`), which runs only during `npm run dist` on your machine and is **never shipped** in the installer. **Action:** optional `npm audit fix` to quiet the toolchain; **not a product security issue.**

**Update note:** `recharts` is at `2.15.4`. If you ever want a smaller charting footprint, a targeted swap (e.g. hand-rolled SVG for the two simple area/line curves, keeping recharts only for the MAE/MFE scatter) would cut most of the 84 KB — but that's a rewrite, out of scope here. Code-splitting (Perf #1) captures most of the benefit with none of the risk.

---

## Bundle Size Breakdown (measured)

| Slice | Raw | Gzipped | Loads on first paint today? |
|---|---|---|---|
| Charts (`recharts` + `d3-*` + `victory-vendor`) | 333 KB | **84 KB** | Yes (should be **no**) |
| App code (`index`) | 272 KB | 75 KB | Yes |
| React + zustand (`vendor`) | 219 KB | 73 KB | Yes |
| **Total JS (current single chunk)** | **825 KB** | **231 KB** | — |
| CSS | 49 KB | 9 KB | Yes |

**Recommendations:**
1. **Lazy-load the 3 chart views** → initial JS ~147 KB gzipped (−36%). *(Perf #1.)*
2. **Add `manualChunks`** to split `vendor` from app code so a code change doesn't bust the (cacheable) React/zustand chunk — helps HMR and repeat loads. ~20 min.
3. Compression: for the **installed Electron app** assets are read from disk over `file://`, so HTTP gzip/brotli is moot; the win is purely parse/eval time from a smaller initial chunk, which #1 delivers.

---

## Memory Audit

- **Timers:** every `setInterval` has a matching `clearInterval` in its effect cleanup — verified in `App.tsx` (pulse), `PaperTrading.tsx` (marks), `useAlerts.ts` (3 timers). All guard on `document.hidden`. **No leaks.**
- **Event listeners:** `addEventListener` (8) vs `removeEventListener` (6). The two "unpaired" sites are **not leaks**: `Button.tsx` attaches a one-shot `animationend` to a ripple element that removes itself (plus a `setTimeout` backstop), and `motionPref.ts` registers **one** module-level `matchMedia('change')` listener for the app's lifetime. Both correct.
- **Caches:** all bounded/keyed — `dataLayer` Map keyed by symbol with `{at}` TTL, `fx` 24 h cache, `marketPulse` keyed 60 s cache, `mathEngine.pending` Map cleared on resolve/reject/timeout. The `dataLayer` symbol Map is technically unbounded but keys are bounded by the ETF universe + user watchlist (tens). **No unbounded growth in practice.** *(Optional: add a max-entries LRU cap to `dataLayer` for defense-in-depth — 20 min, low priority.)*
- **No circular references** found in the store or services.

---

## Error Handling

- **Backend:** central error middleware present (`server.js`), routes wrap handlers, `AuthError` carries status codes, stores use atomic `tmp`+`rename` writes. **Solid.**
- **Frontend:** store actions catch and surface errors to the toast/error banner; auth actions throw for inline display. The gap is the **missing render-level error boundary** (Robustness #1) — logic errors are handled, *rendering* errors are not.
- **Silent failures:** a few `catch {}` blocks intentionally swallow (localStorage in private mode, best-effort file cleanup) — these are correctly silent and commented. No accidental swallows found.
- **Input validation:** backend validates (username regex, password rules, `passesFilters` bounds, `/account/import` shape-checks before touching disk). Frontend guards numeric inputs. **Good.**

---

## Security Findings

- **Shipped dependencies: 0 vulnerabilities** (frontend + backend prod). Electron CVEs are **dev-toolchain only** (see Dependency Cleanup).
- **Electron hardening (good):** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, preload exposes a **fixed** IPC surface (no arbitrary `invoke`), and `setWindowOpenHandler` denies in-app windows / routes `https` links to the OS browser.
- **Auth (good):** scrypt with per-user salt, `timingSafeEqual`, identical 401 for unknown-user vs wrong-password (no enumeration), remember-tokens SHA-256-hashed at rest.
- **No secrets in the bundle:** the feedback feature deliberately ships **no** GitHub token (opens a pre-filled issue instead) — the correct call for a distributed binary.
- **Known, documented limitation:** local account data is **not encrypted at rest** (stated in-UI). Acceptable for a single-user local desktop app; only revisit if the app ever syncs or multi-tenants.
- **No `dangerouslySetInnerHTML`, no `eval`, no string-built SQL** (there is no SQL — flat JSON stores). No injection surface found.

---

## Accessibility Issues

Baseline is reasonable — **26 `aria-label`s, 15 `role=`s, 4 `aria-expanded`, 4 `aria-live`**, all inputs wrapped in `<label>` via `FormInput`, no `<img>` (SVG/canvas only, so no missing `alt`), and **no raw-hex text colors** (all through WCAG-tuned theme tokens). Gaps:

1. **Modal focus management** — `Modal.tsx` closes on Escape and backdrop click, but does not **trap focus** inside the dialog or restore focus to the trigger on close. Keyboard/screen-reader users can Tab out of an open modal into the page behind it. **Fix:** focus the first control on open, cycle Tab within the modal, restore on close (or adopt a headless dialog primitive). ~1 h. *This is the single most impactful a11y fix.*
2. **No skip-link** to jump past the header nav to main content. ~15 min.
3. **Live-region coverage is partial** — the toast has `data-testid` but isn't an `aria-live` region, so alert/feedback confirmations aren't announced. Add `role="status"` / `aria-live="polite"` to the toast container. ~15 min.

No contrast failures were found (the theme tokens were explicitly tuned for AA during the theme work, including the B&W/Obsidian grays lifted above the spec's failing values).

---

## Recommendations (Prioritized)

| # | Item | Impact | Effort | Bucket |
|---|---|---|---|---|
| 1 | **Add a root error boundary** | High (crash safety) | ~0.5 h | High impact / low effort — do first |
| 2 | **Code-split the 3 chart views (`React.lazy`)** | High (−84 KB gz initial) | ~1.5 h | High impact / low effort |
| 3 | **Field selectors instead of whole-store `useStore()` (8 files)** | Medium (fewer 60 s re-renders) | ~1.5–2 h | High impact / medium effort |
| 4 | **Trap + restore focus in `Modal.tsx`** | Medium (a11y) | ~1 h | Medium impact / low effort |
| 5 | **Extract `cssVar` / `pnlClass` / `premiumTotal` basis** | Low (maintainability) | ~1 h | Medium impact / low effort |
| 6 | **`manualChunks` vendor split + `npm audit fix` (electron dev)** | Low (cache/hygiene) | ~0.5 h | Low effort |
| 7 | Toast `aria-live` + skip-link | Low (a11y polish) | ~0.5 h | Low effort |
| 8 | Split `SettingsPanel.tsx` / `store.ts` into modules | Low (DX) | ~2 h | Do if time permits |
| — | List virtualization | Deferred | ~2 h | Only when a library exceeds ~150 rows |

**Sprint-ready total for #1–#7: ~6–8 hours.** #8 and virtualization are optional/future.

---

## Deliverables Summary

**One-paragraph executive summary:** Option Obelisk v1.9.2 audits clean — zero vulnerabilities in shipped dependencies, a hardened Electron shell, sound error handling and input validation on the backend, and an already-vectorized Python engine. The codebase's real optimization headroom is small and concentrated: it ships one 231 KB-gzipped JS bundle whose charting library (84 KB gzipped, measured) loads on first paint despite being used only by three secondary views, eight large components subscribe to the whole state store and so re-render on unrelated 60-second background updates, and there is no React error boundary to catch a render throw. Fixing those three, plus modal focus-trapping and a handful of duplicated-helper extractions, is ~6–8 hours of low-risk work that measurably shrinks the initial load, cuts idle re-renders, and hardens crash recovery — none of it blocking launch.

**Top 3 recommendations:**
1. **Root error boundary** — ~0.5 h — converts a potential white-screen into a recoverable, themed error panel.
2. **Lazy-load the chart views** — ~1.5 h — measured −84 KB gzipped (−36%) off the initial bundle, faster first paint, zero risk to math/data.
3. **Field selectors over whole-store subscriptions** — ~1.5–2 h — stops 8 large subtrees from reconciling on every 60 s background write.

**Action items for next sprint (in order):** error boundary → chart code-split → store selectors → modal focus-trap → helper extraction (`cssVar`/`pnlClass`/`premiumTotal`) → `manualChunks` + electron `audit fix` → toast `aria-live` + skip-link.

---

*No code was modified for this audit. The one build experiment (a `manualChunks` split to size the chart chunk) used a throwaway config that was deleted and the original `vite.config.ts` restored — `git status` is clean apart from this report.*
