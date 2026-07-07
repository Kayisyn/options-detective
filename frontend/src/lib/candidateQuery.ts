// Client-side filtering and sorting of screened candidates (v1.1 roadmap §1).
// Pure functions — the backend produced every number here; this module only
// selects and orders.
import type { Candidate, StrategyType } from "../types";

export interface CandidateFilters {
  strategies: StrategyType[]; // empty = all
  dteMin: number | null;
  dteMax: number | null;
  popMin: number | null;      // percent, 0-100
  popMax: number | null;
  minVolume: number | null;
  maxSpreadPct: number | null; // percent of mid
  maxCapital: number | null;   // dollars
  // expert-only
  deltaMin: number | null;
  deltaMax: number | null;
  thetaMin: number | null;     // $/day
}

export const EMPTY_FILTERS: CandidateFilters = {
  strategies: [],
  dteMin: null,
  dteMax: null,
  popMin: null,
  popMax: null,
  minVolume: null,
  maxSpreadPct: null,
  maxCapital: null,
  deltaMin: null,
  deltaMax: null,
  thetaMin: null,
};

export function countActiveFilters(f: CandidateFilters): number {
  let n = f.strategies.length > 0 ? 1 : 0;
  for (const key of Object.keys(EMPTY_FILTERS) as Array<keyof CandidateFilters>) {
    if (key === "strategies") continue;
    if (f[key] !== null) n += 1;
  }
  return n;
}

export function applyFilters<T extends Candidate>(candidates: T[], f: CandidateFilters): T[] {
  return candidates.filter((c) => {
    if (f.strategies.length > 0 && !f.strategies.includes(c.strategyType)) return false;
    if (f.dteMin !== null && c.daysToExpiry < f.dteMin) return false;
    if (f.dteMax !== null && c.daysToExpiry > f.dteMax) return false;
    const popPct = c.probability.pop * 100;
    if (f.popMin !== null && popPct < f.popMin) return false;
    if (f.popMax !== null && popPct > f.popMax) return false;
    if (f.minVolume !== null && c.liquidity.volume < f.minVolume) return false;
    if (f.maxSpreadPct !== null) {
      // unknown spread (closed-market indicative marks) fails a spread cap:
      // if you demand tight spreads, "unverifiable" doesn't qualify
      const spread = c.liquidity.bidAskSpread;
      if (spread === null || spread * 100 > f.maxSpreadPct) return false;
    }
    if (f.maxCapital !== null && c.sizing.capitalRequired > f.maxCapital) return false;
    if (f.deltaMin !== null && c.netGreeks.delta < f.deltaMin) return false;
    if (f.deltaMax !== null && c.netGreeks.delta > f.deltaMax) return false;
    if (f.thetaMin !== null && c.metrics.thetaPerDay < f.thetaMin) return false;
    return true;
  });
}

// ---- sorting ---------------------------------------------------------------

export type SortKey =
  | "score" | "pop" | "maxLoss" | "maxProfit" | "riskReward"
  | "theta" | "capitalEfficiency" | "liquidity";
export type SortDir = "asc" | "desc";
export interface SortSpec { key: SortKey; dir: SortDir }

export const DEFAULT_SORT: SortSpec = { key: "score", dir: "desc" };

export const SORT_OPTIONS: Array<{ key: SortKey; label: string; defaultDir: SortDir; hint: string }> = [
  { key: "score", label: "Score", defaultDir: "desc", hint: "Composite ranking (default)" },
  { key: "pop", label: "POP", defaultDir: "desc", hint: "Probability of profit" },
  { key: "maxLoss", label: "Max loss", defaultDir: "asc", hint: "Ascending = safest first; unlimited-risk positions always last" },
  { key: "maxProfit", label: "Max profit", defaultDir: "desc", hint: "Descending; unlimited upside counts as infinite" },
  { key: "riskReward", label: "Risk/reward", defaultDir: "desc", hint: "Max profit ÷ max loss; undefined ratios last" },
  { key: "theta", label: "Theta/day", defaultDir: "desc", hint: "Time decay in your favor first" },
  { key: "capitalEfficiency", label: "Capital efficiency", defaultDir: "desc", hint: "Max profit per dollar tied up; undefined last" },
  { key: "liquidity", label: "Spread", defaultDir: "asc", hint: "Tightest bid-ask first; unknown spreads last" },
];

// null from an extractor means "not comparable" -> always sorted last,
// in either direction. Infinity is a real, meaningful value (unbounded
// profit/risk) and sorts numerically.
const EXTRACTORS: Record<SortKey, (c: Candidate) => number | null> = {
  score: (c) => c.compositeScore,
  pop: (c) => c.probability.pop,
  maxLoss: (c) => (c.payoff.maxLoss === null ? Number.POSITIVE_INFINITY : c.payoff.maxLoss),
  maxProfit: (c) => (c.payoff.maxProfit === null ? Number.POSITIVE_INFINITY : c.payoff.maxProfit),
  riskReward: (c) => c.metrics.riskRewardRatio,
  theta: (c) => c.metrics.thetaPerDay,
  capitalEfficiency: (c) => c.metrics.capitalEfficiency,
  liquidity: (c) => c.liquidity.bidAskSpread,
};

export function sortCandidates<T extends Candidate>(candidates: T[], spec: SortSpec): T[] {
  const extract = EXTRACTORS[spec.key];
  const sign = spec.dir === "asc" ? 1 : -1;
  return [...candidates].sort((a, b) => {
    const va = extract(a);
    const vb = extract(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va === vb) return b.compositeScore - a.compositeScore; // stable tiebreak
    return (va - vb) * sign;
  });
}
