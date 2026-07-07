// Journal analytics (v1.1 §3): display aggregations over backend-computed
// P&L values. Sums and averages of stored numbers only — the P&L itself is
// always computed server-side at close time.
import type { JournalTrade } from "../types";

export interface PnlBucket {
  key: string;
  pnl: number;
  count: number;
}

export interface JournalStats {
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  winRate: number | null;      // over closed trades; null when none
  totalPnl: number;            // realized
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  unrealizedPnl: number | null; // sum of marked open trades; null if none marked
  byStrategy: PnlBucket[];
  bySymbol: PnlBucket[];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function buckets(trades: JournalTrade[], keyOf: (t: JournalTrade) => string): PnlBucket[] {
  const map = new Map<string, PnlBucket>();
  for (const t of trades) {
    const key = keyOf(t);
    const bucket = map.get(key) ?? { key, pnl: 0, count: 0 };
    bucket.pnl = round2(bucket.pnl + (t.actualPnl ?? 0));
    bucket.count += 1;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => b.pnl - a.pnl);
}

export function journalStats(trades: JournalTrade[]): JournalStats {
  // "closed" here means settled any way: manual close, assignment, expiry
  const closed = trades.filter((t) => t.status !== "open" && t.actualPnl !== null);
  const open = trades.filter((t) => t.status === "open");
  const wins = closed.filter((t) => (t.actualPnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.actualPnl ?? 0) < 0);
  const marked = open.filter((t) => t.lastMark?.unrealizedPnl !== null && t.lastMark !== null);

  const sum = (list: JournalTrade[], f: (t: JournalTrade) => number) =>
    round2(list.reduce((s, t) => s + f(t), 0));

  return {
    total: trades.length,
    open: open.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : null,
    totalPnl: sum(closed, (t) => t.actualPnl ?? 0),
    avgWin: wins.length ? round2(sum(wins, (t) => t.actualPnl ?? 0) / wins.length) : null,
    avgLoss: losses.length ? round2(sum(losses, (t) => t.actualPnl ?? 0) / losses.length) : null,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.actualPnl ?? 0)) : null,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.actualPnl ?? 0)) : null,
    unrealizedPnl: marked.length
      ? sum(marked, (t) => t.lastMark?.unrealizedPnl ?? 0) : null,
    byStrategy: buckets(closed, (t) => t.strategy),
    bySymbol: buckets(closed, (t) => t.symbol),
  };
}
