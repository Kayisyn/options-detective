// ETF screening: filtering, per-strategy scoring, presets (v2.0 §2.4/§2.5).
// Pure functions over merged ETF records — no I/O. Every scored number is a
// bounded, documented transform of a fetched metric, so a candidate's rank
// is explainable (the frontend shows the breakdown).

const STRATEGIES = new Set(["covered_call", "csp", "spread"]);

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function round(x, n = 2) {
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

// ---- component scores (0-1) ------------------------------------------------
// null metric -> 0: we never credit what we could not measure.
function components(etf) {
  const premium = etf.annualizedCallPremiumPct;
  const vol = etf.callVolume;
  const ivRank = etf.ivRank;
  const atmIv = etf.atmIv;
  const ytd = etf.ytdReturn;
  const erPct = etf.expenseRatio * 100;
  return {
    premium: premium == null ? 0 : clamp01(premium / 25),        // 25%+ annualized = full
    liquidity: vol == null ? 0 : clamp01(vol / 5000),            // 5000+ contracts/day = full
    ivRank: ivRank == null ? 0 : clamp01(ivRank / 100),
    lowIv: ivRank == null ? 0 : clamp01(1 - ivRank / 100),       // spreads want cheap IV
    size: clamp01(etf.aumBillions / 100),                        // $100B+ = full
    quality: 0.5 * clamp01(etf.aumBillions / 100)
      + 0.5 * clamp01(1 - erPct / 0.5),                          // low expense ratio = quality
    momentum: ytd == null ? 0 : clamp01((ytd + 10) / 40),        // -10%..+30% -> 0..1
    volatility: atmIv == null ? 0 : clamp01(atmIv / 0.6),        // 60% IV = full
  };
}

const STRATEGY_WEIGHTS = {
  covered_call: { premium: 0.4, liquidity: 0.3, ivRank: 0.2, size: 0.1 },
  csp: { premium: 0.4, quality: 0.3, ivRank: 0.2, momentum: 0.1 },
  spread: { lowIv: 0.5, liquidity: 0.3, volatility: 0.2 },
};

const COMPONENT_LABELS = {
  premium: "Annualized premium",
  liquidity: "Option liquidity",
  ivRank: "IV rank (high)",
  lowIv: "IV rank (low)",
  size: "Fund size",
  quality: "Quality (size + cost)",
  momentum: "YTD momentum",
  volatility: "Volatility",
};

// Composite 0-10 with a per-component breakdown (§2.5 step 3).
function scoreFor(etf, strategy) {
  const weights = STRATEGY_WEIGHTS[strategy] ?? STRATEGY_WEIGHTS.covered_call;
  const comp = components(etf);
  const breakdown = Object.entries(weights).map(([key, weight]) => ({
    key,
    label: COMPONENT_LABELS[key],
    component: round(comp[key], 3),
    points: round(weight * comp[key] * 10, 2),
  }));
  const score = round(breakdown.reduce((s, b) => s + b.points, 0), 2);
  return { score, breakdown };
}

// ---- filtering -------------------------------------------------------------
// Dynamic-metric filters exclude ETFs missing that metric — you cannot pass a
// premium floor on an ETF whose premium we have not fetched.
function passesFilters(etf, f = {}) {
  if (Array.isArray(f.sectors) && f.sectors.length && !f.sectors.includes(etf.sector)) return false;
  if (Array.isArray(f.assetClasses) && f.assetClasses.length && !f.assetClasses.includes(etf.assetClass)) return false;
  if (f.minAum != null && etf.aumBillions < f.minAum) return false;
  if (f.maxExpenseRatioPct != null && etf.expenseRatio * 100 > f.maxExpenseRatioPct) return false;

  const dyn = (value, min, max) => {
    if (min == null && max == null) return true;
    if (value == null) return false; // metric required but unavailable
    if (min != null && value < min) return false;
    if (max != null && value > max) return false;
    return true;
  };
  if (!dyn(etf.price, f.priceMin, f.priceMax)) return false;
  if (!dyn(etf.ivRank, f.ivRankMin, f.ivRankMax)) return false;
  if (!dyn(etf.annualizedCallPremiumPct, f.premiumMin, f.premiumMax)) return false;
  if (!dyn(etf.ytdReturn, f.ytdMin, f.ytdMax)) return false;
  // v1.7.0 filters
  if (!dyn(etf.dividendYieldPct, f.yieldMin, f.yieldMax)) return false;
  if (!dyn(etf.perf52wPct, f.perf52wMin, f.perf52wMax)) return false;
  if (!dyn(etf.atrPct20, f.atrMin, f.atrMax)) return false;
  if (!dyn(etf.thetaRank, f.thetaRankMin, f.thetaRankMax)) return false;
  if (f.minCallVolume != null) {
    if (etf.callVolume == null || etf.callVolume < f.minCallVolume) return false;
  }
  return true;
}

// ---- screen ----------------------------------------------------------------
function screen(universe, { filters = {}, strategy = "covered_call", limit = 10 } = {}) {
  const strat = STRATEGIES.has(strategy) ? strategy : "covered_call";
  const scored = universe
    .filter((etf) => passesFilters(etf, filters))
    .map((etf) => {
      const { score, breakdown } = scoreFor(etf, strat);
      return { ...etf, score, scoreBreakdown: breakdown };
    })
    .sort((a, b) => b.score - a.score);
  return {
    strategy: strat,
    total: scored.length,
    candidates: limit > 0 ? scored.slice(0, limit) : scored,
  };
}

// ---- presets (§2.4) --------------------------------------------------------
const PRESETS = [
  {
    id: "covered_call", name: "Covered Call Machine",
    hint: "High premium, liquid, stable: consistent income",
    strategy: "covered_call",
    filters: { ivRankMin: 60, premiumMin: 12, minAum: 5, priceMin: 30, priceMax: 300 },
  },
  {
    id: "csp", name: "CSP Income Hunter",
    hint: "High IV on quality funds: strong fundamentals + premium",
    strategy: "csp",
    filters: { ivRankMin: 60, maxExpenseRatioPct: 0.25, minAum: 20, assetClasses: ["Equity"] },
  },
  {
    id: "spread", name: "Low IV Spread Play",
    hint: "Cheap options to buy: defined-risk spread entries",
    strategy: "spread",
    filters: { ivRankMax: 35, priceMin: 50, minCallVolume: 500 },
  },
  {
    id: "tech", name: "Tech Growth",
    hint: "Technology momentum with tradeable options",
    strategy: "covered_call",
    filters: { sectors: ["Technology"], ytdMin: 5, priceMax: 400 },
  },
];

module.exports = {
  STRATEGIES, STRATEGY_WEIGHTS, COMPONENT_LABELS, PRESETS,
  components, scoreFor, passesFilters, screen,
};
