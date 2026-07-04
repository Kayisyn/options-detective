// Shared domain types. These mirror docs/api-schema.md; the backend is the
// source of truth for every numeric value — the frontend never computes one.

export type StrategyType =
  | "covered_call"
  | "cash_secured_put"
  | "call_vertical"
  | "put_vertical"
  | "iron_condor"
  | "long_straddle"
  | "short_strangle";

export type DirectionalView = "bullish" | "bearish" | "neutral";

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number; // $ per calendar day
  vega: number;  // $ per 1 IV point
  rho: number;   // $ per 1 rate point
}

export interface Leg {
  type:
    | "long_call"
    | "short_call"
    | "long_put"
    | "short_put"
    | "long_stock"
    | "short_stock";
  strike?: number; // absent for stock legs
  price: number;   // per share
  qty: number;     // contracts (options) or shares (stock)
  greeks?: Greeks;
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

export interface UserIntent {
  symbol: string;
  currentPrice: number;
  directionalView: DirectionalView;
  ivRank: number;           // 0-100
  capital: number;
  riskTolerancePct: number; // 1-5
  maxLossDollars: number;
  allowedStrategies: StrategyType[]; // [] = all allowed
  constraints: {
    definedRiskOnly: boolean;
    maxDTE: number;
    minVolume: number;
    bidAskSpreadLimit: number;
  };
  accountType: "trader";
}

export interface Candidate {
  id: string;
  strategyType: StrategyType;
  symbol: string;
  expiration: string; // ISO date, e.g. "2026-08-21"
  daysToExpiry: number;
  legs: Leg[];
  netGreeks: Greeks;
  payoff: Payoff;
  probability: {
    pop: number;           // 0-1
    probMaxProfit: number; // 0-1
  };
  metrics: {
    riskRewardRatio: number;
    capitalEfficiency: number;
    thetaPerDay: number;
  };
  sizing: {
    contractsSuggested: number;
    totalDebit: number; // negative = credit
    pctOfAccount: number;
  };
  liquidity: {
    bidAskSpread: number;
    volume: number;
    dataAgeSeconds: number;
  };
  compositeScore: number; // 0-10
  rationale: string;
}

export interface CalculatorState {
  candidateId: string;
  currentUnderlying: number;
  adjustedStrikes?: number[];
  greeksSnapshot: Greeks;
  payoffSnapshot: Payoff;
}
