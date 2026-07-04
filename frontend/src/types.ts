// Shared domain types. These mirror docs/api-schema.md and the live backend
// responses; the backend is the source of truth for every numeric value —
// the frontend never computes one, it only formats.

export type StrategyType =
  | "covered_call"
  | "cash_secured_put"
  | "call_vertical"
  | "put_vertical"
  | "iron_condor"
  | "long_straddle"
  | "short_strangle";

export type DirectionalView = "bullish" | "bearish" | "neutral" | "income";

export type LegType =
  | "long_call"
  | "short_call"
  | "long_put"
  | "short_put"
  | "long_stock"
  | "short_stock";

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number; // $ per calendar day (position) / per share (leg)
  vega: number;  // $ per 1 IV point
  rho: number;   // $ per 1 rate point
}

export interface Leg {
  type: LegType;
  strike?: number;      // absent for stock legs
  price: number;        // per share
  qty: number;          // contracts (options) or shares (stock)
  iv?: number | null;
  spreadPct?: number | null;
  volume?: number;
  openInterest?: number;
  greeks?: Greeks;      // per-share greeks from the engine
  theoretical?: boolean; // price is BS theoretical, not a market mark
}

export interface PayoffPoint {
  underlyingPrice: number;
  profit: number;
}

export interface Payoff {
  maxProfit: number | null; // null = unbounded
  maxLoss: number | null;   // null = unbounded
  breakevens: number[];
  profitAtExpiry: PayoffPoint[];
}

export interface Probability {
  pop: number;           // 0-1
  probMaxProfit: number; // 0-1
}

export interface Metrics {
  riskRewardRatio: number | null;
  capitalEfficiency: number | null;
  thetaPerDay: number;
}

export interface Sizing {
  contractsSuggested: number;
  totalDebit: number; // negative = credit
  pctOfAccount: number;
  capitalRequired: number;
  capitalApproximate: boolean;
}

export interface Candidate {
  id: string;
  strategyType: StrategyType;
  symbol: string;
  expiration: string; // ISO date
  daysToExpiry: number;
  legs: Leg[];
  netGreeks: Greeks;  // dollar terms for the whole position
  payoff: Payoff;
  probability: Probability;
  metrics: Metrics;
  sizing: Sizing;
  liquidity: {
    bidAskSpread: number | null;
    volume: number;
    dataAgeSeconds: number;
  };
  meta: {
    sigma: number;
    riskFreeRate: number;
    spot: number;
    stale: boolean;
    marksQuality: "live" | "indicative";
  };
  compositeScore: number; // 0-10
  rationale: string;
}

export interface ScreenParams {
  symbol: string;
  directionalView: DirectionalView;
  capital: number;
  riskTolerancePct: number;
  maxLossDollars?: number | null;
  definedRiskOnly: boolean;
  refresh?: boolean;
}

export interface ScreenResult {
  symbol: string;
  price: number;
  ivRank: number | null;
  ivBand: "high" | "mid" | "low";
  atmIv: number | null;
  directionalView: DirectionalView;
  strategiesScreened: StrategyType[];
  expirationsScreened: string[];
  generated: number;
  candidates: Candidate[];
  dataAgeSeconds: number;
  stale: boolean;
  warnings: string[];
}

export interface CalcResult {
  legs: Leg[];
  netGreeks: Greeks;
  payoff: Payoff;
  probability: Probability;
  metrics: Metrics;
  sizing: Sizing;
  inputs: {
    spot: number;
    dte: number;
    sigma: number;
    riskFreeRate: number;
    capital: number;
    riskTolerancePct: number;
    strategyType: StrategyType | null;
  };
}

export interface RankedCandidate extends Candidate {
  rank: number;
  exportText: string;
}

export interface Recommendation {
  source: "provided" | "screened";
  ranked: RankedCandidate[];
  tradeoffs: Array<{ between: [string, string]; facts: string[] }>;
  weights: Record<string, number>;
  warnings?: string[];
}
