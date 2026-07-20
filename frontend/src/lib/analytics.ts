// v1.7.2 Analytics Dashboard aggregations. Like journalStats, these are
// display sums over backend-computed realized P&L — no P&L is derived here.
// Only settled trades (closed/assigned/expired with a stored actualPnl)
// participate; open positions never move the equity curve.
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
