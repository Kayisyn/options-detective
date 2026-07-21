// v1.7.2 Analytics Dashboard aggregations. Like journalStats, these are
// display sums over backend-computed realized P&L — no P&L is derived here.
// Only settled trades (closed/assigned/expired with a stored actualPnl)
// participate; open positions never move the equity curve.
import { positionBasis } from "./journalStats";
import type { JournalTrade } from "../types";

export type RangeId = "30d" | "3m" | "6m" | "all";

export const RANGES: Array<{ id: RangeId; label: string; days: number | null }> = [
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "3m", label: "Last 3 months", days: 91 },
  { id: "6m", label: "Last 6 months", days: 182 },
  { id: "all", label: "All time", days: null },
];

export interface EquityCurvePoint {
  n: number;            // 1-based settled-trade index
  at: string;           // settle date (YYYY-MM-DD)
  pnl: number;          // this trade's realized P&L
  cumulative: number;   // running net P&L
  symbol: string;
  strategy: string;
}

export interface StrategyRow {
  strategy: string;
  trades: number;
  winRate: number;      // 0..1
  avgPnl: number;
  totalPnl: number;
}

export interface DashboardStats {
  totalTrades: number;      // settled in range
  wins: number;
  losses: number;
  winRate: number | null;   // 0..1 over settled
  grossProfit: number;
  grossLoss: number;        // positive magnitude
  netPnl: number;
  profitFactor: number | null;   // null when no losses yet
  avgWin: number | null;
  avgLoss: number | null;        // negative (as stored)
  maxWin: number | null;
  maxLoss: number | null;        // negative
  riskReward: number | null;     // avgWin / |avgLoss|
  bestDay: { date: string; pnl: number } | null;
  worstDay: { date: string; pnl: number } | null;
  maxConsecutiveWins: number;
  equityCurve: EquityCurvePoint[];
  byStrategy: StrategyRow[];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// A trade settles at closedAt (set for manual close, assignment and expiry);
// exitDate/entryDate are date-only fallbacks for hand-edited rows.
function settleStamp(t: JournalTrade): string {
  return t.closedAt ?? t.exitDate ?? t.createdAt;
}

export function settledInRange(trades: JournalTrade[], range: RangeId): JournalTrade[] {
  const settled = trades.filter((t) => t.status !== "open" && t.actualPnl !== null);
  const days = RANGES.find((r) => r.id === range)?.days ?? null;
  if (days === null) return settled;
  const cutoff = Date.now() - days * 86_400_000;
  return settled.filter((t) => {
    const at = Date.parse(settleStamp(t));
    return Number.isFinite(at) && at >= cutoff;
  });
}

// v1.8.2 advanced analytics -------------------------------------------------

export interface DrawdownPoint {
  n: number;
  at: string;
  equity: number;     // cumulative realized P&L
  peak: number;       // running high-water mark
  drawdown: number;   // equity - peak (<= 0)
}

export interface MaeMfePoint {
  symbol: string;
  strategy: string;
  at: string;
  maePct: number;     // worst observed unrealized P&L as % of basis (<= 0 usually)
  mfePct: number;     // best observed unrealized P&L as % of basis
  realizedPct: number;
  win: boolean;
}

export interface AdvancedStats {
  // risk-adjusted returns, computed over per-trade % returns (P&L over the
  // premium/debit basis) — dimensionless, comparable across position sizes
  sharpe: number | null;        // mean / stddev; null when < 2 trades or flat
  sortino: number | null;       // mean / downside deviation; null when no losses
  calmar: number | null;        // annualized $ P&L / |max drawdown $|
  // drawdown (dollar terms, over the settled-trade equity curve)
  maxDrawdown: number | null;       // most negative equity - peak (<= 0)
  maxDrawdownPct: number | null;    // vs the peak at the time (null if peak <= 0)
  currentDrawdown: number;          // 0 when at the high-water mark
  drawdownDays: number;             // days since the current peak was set
  drawdownCurve: DrawdownPoint[];
  // trade quality
  expectancy: number | null;    // winRate·avgWin + lossRate·avgLoss ($/trade)
  recoveryFactor: number | null; // net P&L / |max drawdown|
  maeMfe: MaeMfePoint[];        // only trades that carry observed marks
}

function pctReturnOf(t: JournalTrade): number | null {
  const basis = positionBasis(t);
  if (!basis || t.actualPnl === null) return null;
  return t.actualPnl / basis;
}

export function advancedStats(trades: JournalTrade[], range: RangeId): AdvancedStats {
  const settled = settledInRange(trades, range)
    .slice()
    .sort((a, b) => settleStamp(a).localeCompare(settleStamp(b)));
  const pnl = (t: JournalTrade) => t.actualPnl ?? 0;

  // ---- per-trade % returns → sharpe / sortino
  const returns = settled.map(pctReturnOf).filter((r): r is number => r !== null);
  const mean = returns.length ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const variance = returns.length >= 2
    ? returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length : 0;
  const std = Math.sqrt(variance);
  // downside deviation: root-mean-square of the below-zero part only
  const downside = Math.sqrt(
    returns.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / Math.max(returns.length, 1),
  );
  const sharpe = returns.length >= 2 && std > 0 ? round2(mean / std) : null;
  const sortino = returns.length >= 2 && downside > 0 ? round2(mean / downside) : null;

  // ---- drawdown over the settled equity curve
  let equity = 0;
  let peak = 0;
  let peakAt: string | null = null;
  let maxDrawdown = 0;
  let maxDrawdownPct: number | null = null;
  const drawdownCurve: DrawdownPoint[] = settled.map((t, i) => {
    equity = round2(equity + pnl(t));
    if (equity > peak || peakAt === null) {
      peak = equity;
      peakAt = settleStamp(t);
    }
    const drawdown = round2(equity - peak);
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPct = peak > 0 ? round2((-drawdown / peak) * 100) : null;
    }
    return { n: i + 1, at: settleStamp(t).slice(0, 10), equity, peak, drawdown };
  });
  const last = drawdownCurve[drawdownCurve.length - 1] ?? null;
  const currentDrawdown = last ? last.drawdown : 0;
  const drawdownDays = last && currentDrawdown < 0 && peakAt
    ? Math.max(0, Math.round((Date.parse(settleStamp(settled[settled.length - 1])) - Date.parse(peakAt)) / 86_400_000))
    : 0;

  // ---- calmar: annualize the net P&L over the settled span
  const netPnl = round2(settled.reduce((s, t) => s + pnl(t), 0));
  let calmar: number | null = null;
  if (settled.length >= 2 && maxDrawdown < 0) {
    const spanDays = Math.max(1,
      (Date.parse(settleStamp(settled[settled.length - 1])) - Date.parse(settleStamp(settled[0]))) / 86_400_000);
    calmar = round2((netPnl * (365 / spanDays)) / Math.abs(maxDrawdown));
  }

  // ---- trade quality
  const wins = settled.filter((t) => pnl(t) > 0);
  const losses = settled.filter((t) => pnl(t) < 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + pnl(t), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + pnl(t), 0) / losses.length : 0;
  const expectancy = settled.length
    ? round2((wins.length / settled.length) * avgWin + (losses.length / settled.length) * avgLoss)
    : null;
  const recoveryFactor = maxDrawdown < 0 ? round2(netPnl / Math.abs(maxDrawdown)) : null;

  // ---- MAE/MFE: only trades where marks were actually observed
  const maeMfe: MaeMfePoint[] = settled.flatMap((t) => {
    const basis = positionBasis(t);
    if (!basis || t.mae === null || t.mfe === null) return [];
    return [{
      symbol: t.symbol,
      strategy: t.strategy,
      at: settleStamp(t).slice(0, 10),
      maePct: round2((t.mae / basis) * 100),
      mfePct: round2((t.mfe / basis) * 100),
      realizedPct: round2(((t.actualPnl ?? 0) / basis) * 100),
      win: pnl(t) > 0,
    }];
  });

  return {
    sharpe, sortino, calmar,
    maxDrawdown: maxDrawdown < 0 ? maxDrawdown : null,
    maxDrawdownPct,
    currentDrawdown,
    drawdownDays,
    drawdownCurve,
    expectancy,
    recoveryFactor,
    maeMfe,
  };
}

export function dashboardStats(trades: JournalTrade[], range: RangeId): DashboardStats {
  const settled = settledInRange(trades, range)
    .slice()
    .sort((a, b) => settleStamp(a).localeCompare(settleStamp(b)));

  const pnl = (t: JournalTrade) => t.actualPnl ?? 0;
  const wins = settled.filter((t) => pnl(t) > 0);
  const losses = settled.filter((t) => pnl(t) < 0);
  const grossProfit = round2(wins.reduce((s, t) => s + pnl(t), 0));
  const grossLoss = round2(Math.abs(losses.reduce((s, t) => s + pnl(t), 0)));
  const avgWin = wins.length ? round2(grossProfit / wins.length) : null;
  const avgLoss = losses.length ? round2(-grossLoss / losses.length) : null;

  // equity curve: one point per settled trade, in settle order
  let cumulative = 0;
  const equityCurve: EquityCurvePoint[] = settled.map((t, i) => {
    cumulative = round2(cumulative + pnl(t));
    return {
      n: i + 1,
      at: settleStamp(t).slice(0, 10),
      pnl: round2(pnl(t)),
      cumulative,
      symbol: t.symbol,
      strategy: t.strategy,
    };
  });

  // daily buckets for best/worst day
  const byDay = new Map<string, number>();
  for (const t of settled) {
    const day = settleStamp(t).slice(0, 10);
    byDay.set(day, round2((byDay.get(day) ?? 0) + pnl(t)));
  }
  let bestDay: DashboardStats["bestDay"] = null;
  let worstDay: DashboardStats["worstDay"] = null;
  for (const [date, dayPnl] of byDay) {
    if (!bestDay || dayPnl > bestDay.pnl) bestDay = { date, pnl: dayPnl };
    if (!worstDay || dayPnl < worstDay.pnl) worstDay = { date, pnl: dayPnl };
  }

  let maxConsecutiveWins = 0;
  let streak = 0;
  for (const t of settled) {
    streak = pnl(t) > 0 ? streak + 1 : 0;
    if (streak > maxConsecutiveWins) maxConsecutiveWins = streak;
  }

  const stratMap = new Map<string, JournalTrade[]>();
  for (const t of settled) {
    const list = stratMap.get(t.strategy) ?? [];
    list.push(t);
    stratMap.set(t.strategy, list);
  }
  const byStrategy: StrategyRow[] = [...stratMap.entries()]
    .map(([strategy, list]) => {
      const total = round2(list.reduce((s, t) => s + pnl(t), 0));
      return {
        strategy,
        trades: list.length,
        winRate: list.filter((t) => pnl(t) > 0).length / list.length,
        avgPnl: round2(total / list.length),
        totalPnl: total,
      };
    })
    .sort((a, b) => b.totalPnl - a.totalPnl);

  return {
    totalTrades: settled.length,
    wins: wins.length,
    losses: losses.length,
    winRate: settled.length ? wins.length / settled.length : null,
    grossProfit,
    grossLoss,
    netPnl: round2(grossProfit - grossLoss),
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : null,
    avgWin,
    avgLoss,
    maxWin: wins.length ? Math.max(...wins.map(pnl)) : null,
    maxLoss: losses.length ? Math.min(...losses.map(pnl)) : null,
    riskReward: avgWin !== null && avgLoss !== null && avgLoss !== 0
      ? round2(avgWin / Math.abs(avgLoss)) : null,
    bestDay,
    worstDay,
    maxConsecutiveWins,
    equityCurve,
    byStrategy,
  };
}
