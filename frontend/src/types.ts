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

export type ScoreComponentKey = "pop" | "ror" | "theta" | "capEff" | "liquidity";

// Normalized (0-1) scoring components from the backend, plus the default
// weights it used. theta is normalized relative to the screened set.
export interface ScoreBreakdown {
  components: Record<ScoreComponentKey, number>;
  weights: Record<ScoreComponentKey, number>;
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
  // optional: absent on journal snapshots saved before v1.1
  scoreBreakdown?: ScoreBreakdown;
}

export interface ScreenParams {
  symbol: string;
  directionalView: DirectionalView;
  capital: number;
  riskTolerancePct: number;
  maxLossDollars?: number | null;
  definedRiskOnly: boolean;
  refresh?: boolean;
  topN?: number;
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

export type TradeSide = "debit" | "credit";
export type TradeStatus = "open" | "closed" | "assigned" | "expired";

// Journal trade, v1.1 Phase A. Prices are per unit as brokers quote them
// (per spread for options, per share for stock); dollar P&L multiplies by
// qty × multiplier. Credit positions profit when the closing price falls.
export interface JournalTrade {
  id: string;
  createdAt: string;
  status: TradeStatus;
  paper: boolean;
  archived: boolean;
  deletedAt: string | null; // v1.5.1 soft delete: null = active, ISO = in trash
  expiration: string | null;
  assignmentStrike: number | null;
  reservedCapital: number | null; // paper trades: budget reserved at open
  symbol: string;
  strategy: string;
  side: TradeSide;
  entryPrice: number;
  entryQty: number;
  multiplier: number; // 100 options, 1 shares
  entryDate: string;
  maxLossTarget: number | null;
  maxProfitTarget: number | null;
  notes: string;
  tags: string[];
  exitPrice: number | null;
  exitDate: string | null;
  closedAt: string | null;
  actualPnl: number | null;
  mae: number | null; // worst unrealized P&L observed (signed, from marks)
  mfe: number | null; // best unrealized P&L observed
  lastMark: {
    underlying: number;
    mark: number | null;         // signed structure value per unit (theo)
    unrealizedPnl: number | null;
    stale: boolean;
    at: string;
  } | null;
  candidate: Candidate | null;
  exportText: string | null;
}

// Manual entry form payload (POST /journal).
export interface NewTradeInput {
  symbol: string;
  strategy: string;
  side: TradeSide;
  entryPrice: number;
  entryQty: number;
  multiplier: number;
  entryDate?: string;
  maxLossTarget?: number | null;
  maxProfitTarget?: number | null;
  notes?: string;
  tags?: string[];
  paper?: boolean;
  expiration?: string | null;
  assignmentStrike?: number | null;
}

// v2.0 paper trading
export interface PaperBalance {
  initialBalance: number;
  createdAt: string;
  resetAt: string | null;
  realizedPnl: number;
  unrealizedPnl: number | null;
  reserved: number;
  available: number;
  accountValue: number;
  openCount: number;
  closedCount: number;
  // v1.5.0 realism
  feesPaid?: number;
  holdingsCost?: number;
  holdingsValue?: number;
}

// v1.5.0 sandbox customization
export type ThetaMode = "normal" | "fast" | "slow";

export interface PaperSettings {
  commissionEnabled: boolean;
  commissionPerTrade: number;
  autoAssign: boolean;
  thetaMode: ThetaMode;
  maxRiskPct: number;
}

// Shares acquired through assignment (CSP), floating at market until sold.
export interface PaperHolding {
  symbol: string;
  shares: number;
  costBasis: number;
  lastPrice: number | null;
  acquiredAt: string;
  from: string;
}

export interface PaperStats {
  closed: number;
  wins: number;
  losses: number;
  assigned: number;
  winRate: number | null;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  byStrategy: Array<{ key: string; pnl: number; count: number }>;
  bySymbol: Array<{ key: string; pnl: number; count: number }>;
}

export interface EquityPoint {
  at: string;
  accountValue: number;
  realizedPnl: number;
  unrealizedPnl: number | null;
  openCount: number;
}

export interface PaperState {
  balance: PaperBalance | null;
  trades: JournalTrade[];
  stats: PaperStats;
  settings?: PaperSettings;
  holdings?: PaperHolding[];
}

// v2.0 ETF screener
export type EtfStrategy = "covered_call" | "csp" | "spread";

export interface EtfScoreComponent {
  key: string;
  label: string;
  component: number; // 0-1
  points: number;    // of the 0-10 score
}

export interface EtfRecord {
  ticker: string;
  name: string;
  issuer: string;
  sector: string;
  assetClass: string;
  expenseRatio: number;
  expenseRatioPct: number;
  aumBillions: number;
  // dynamic (null until refreshed)
  price: number | null;
  ytdReturn: number | null;
  atmIv: number | null;
  ivRank: number | null;
  annualizedCallPremiumPct: number | null;
  otmCallStrike: number | null;
  callVolume: number | null;
  dte: number | null;
  asOf: string | null;
  hasMetrics: boolean;
  stale: boolean;
  // present in screen results
  score?: number;
  scoreBreakdown?: EtfScoreComponent[];
}

export interface EtfDetail extends EtfRecord {
  scores: Record<EtfStrategy, { score: number; breakdown: EtfScoreComponent[] }>;
}

export interface EtfPreset {
  id: string;
  name: string;
  hint: string;
  strategy: EtfStrategy;
  filters: EtfFilters;
}

export interface EtfReference {
  sectors: string[];
  assetClasses: string[];
  count: number;
  presets: EtfPreset[];
}

export interface EtfFilters {
  sectors?: string[];
  assetClasses?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  ivRankMin?: number | null;
  ivRankMax?: number | null;
  premiumMin?: number | null;
  premiumMax?: number | null;
  maxExpenseRatioPct?: number | null;
  minAum?: number | null;
  ytdMin?: number | null;
  ytdMax?: number | null;
  minCallVolume?: number | null;
}

export interface EtfScreenResult {
  strategy: EtfStrategy;
  total: number;
  candidates: EtfRecord[];
  anyMetrics: boolean;
}

// v1.3.0 Index Component Screener
export interface EtfHolding {
  symbol: string;
  weight: number;        // 0-1, approximate
  sector: string | null; // null for yfinance-sourced holdings
  rank: number;          // 1 = largest weight
}

export type HoldingsSource = "curated" | "yfinance-top10";

export interface HoldingsInfo {
  etf: string;
  source: HoldingsSource;
  asOf: string;
  holdings: EtfHolding[];
  totalHoldings: number;
}

// a Detector candidate + the holding it came from (curves stripped;
// the Calculator recomputes them on open)
export type IcsCandidate = Candidate & { holding: EtfHolding };

export interface IcsSkipped {
  symbol: string;
  reason: string;
}

export interface IcsConstraints {
  directionalView?: DirectionalView;
  capital?: number;
  riskTolerancePct?: number;
  definedRiskOnly?: boolean;
  minDTE?: number;
  maxDTE?: number;
}

// v1.3.1: ICS list UI state lives in the store (not component state) so
// Calculator round-trips preserve filters, sort and pagination.
export interface IcsViewState {
  sectors: string[];
  subset: 10 | 25 | 0; // 0 = all
  strategy: string;    // "" = all
  sort: "score" | "pop" | "weight" | "maxProfit" | "capital" | "dte";
  shown: number;
}

// v1.3.1: optional edits from the Calculator's save modal; omitted fields
// keep the candidate-derived values (backend contract).
export interface JournalSaveOptions {
  exportText?: string | null;
  note?: string;
  entryPrice?: number;
  maxLossTarget?: number | null;
  maxProfitTarget?: number | null;
}

export interface IcsResult {
  etf: string;
  source: HoldingsSource;
  asOf: string;
  totalHoldings: number;
  holdings: EtfHolding[];
  screenedSymbols: number;
  skipped: IcsSkipped[];
  candidates: IcsCandidate[];
  totalCandidates: number;
  constraints: Required<IcsConstraints> & { maxExpirations: number };
  screeningTimeMs: number;
  screenedAt: string;
  cached: boolean;
}

export interface CloseTradeInput {
  exitPrice: number;
  exitDate?: string;
  mae?: number | null;
  mfe?: number | null;
  tags?: string[];
}

export interface Recommendation {
  source: "provided" | "screened";
  ranked: RankedCandidate[];
  tradeoffs: Array<{ between: [string, string]; facts: string[] }>;
  weights: Record<string, number>;
  warnings?: string[];
}

// v1.5.0 sidebars: one cached backend fetch feeds breadth, trending,
// watchlist quotes and headlines (GET /market/pulse).
export interface PulseQuote {
  price: number;
  prevClose: number;
  changePct: number;
}

export interface PulseNewsItem {
  title: string;
  url: string | null;
  publisher: string | null;
  publishedAt: string | null;
}

export interface MarketPulse {
  breadth: {
    score: number;
    advancers: number;
    decliners: number;
    unchanged: number;
    counted: number;
  } | null;
  trending: {
    gainers: Array<PulseQuote & { symbol: string }>;
    losers: Array<PulseQuote & { symbol: string }>;
  };
  watch: Record<string, PulseQuote>;
  news: PulseNewsItem[];
  errors?: Record<string, string>;
  asOf: string;
}
