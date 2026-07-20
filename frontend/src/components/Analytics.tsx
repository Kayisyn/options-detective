import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "../store";
import { money, pct, strategyLabel } from "../lib/format";
import { useTheme } from "../contexts/ThemeContext";
import { dashboardStats, RANGES, type EquityCurvePoint, type RangeId } from "../lib/analytics";
import { DualValue } from "../lib/currency";
import { MetricBox } from "./ui/Card";
import { cx } from "../lib/cx";

// v1.7.2 Analytics Dashboard: realized-performance overview across the
// Position Log — overview cards, cumulative-P&L equity curve, a metrics
// grid and an expandable by-strategy breakdown, all under a shared
// time-range filter. Aggregation lives in lib/analytics.ts.

type Scope = "all" | "real" | "paper";

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}

function pnlClass(v: number | null): string {
  if (v === null) return "text-content-3";
  return v > 0 ? "text-accent-green" : v < 0 ? "text-accent-red" : "text-content-2";
}

function signedMoney(v: number): string {
  return `${v > 0 ? "+" : ""}${money(v)}`;
}

function EquityCurveChart({ points }: { points: EquityCurvePoint[] }) {
  useTheme(); // re-render on theme switch so cssVar() re-reads the palette
  const line = cssVar("--od-accent-primary", "#9733FF");
  const grid = cssVar("--od-dark-700", "#252535");
  const axis = cssVar("--od-text-3", "#9e9eb2");

  if (points.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-dark-600 px-4 text-center text-sm text-content-3">
        The equity curve appears once two or more positions have settled in
        this range.
      </div>
    );
  }
  return (
    <div className="chart-trace h-56 w-full" data-testid="analytics-equity-curve">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="analytics-curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line} stopOpacity={0.25} />
              <stop offset="100%" stopColor={line} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} opacity={0.2} />
          <XAxis dataKey="at" tickFormatter={(v: string) => v.slice(5)}
            stroke={axis} fontSize={11} minTickGap={40} />
          <YAxis tickFormatter={(v: number) => money(v)} stroke={axis} fontSize={11}
            width={72} domain={["auto", "auto"]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as EquityCurvePoint;
              return (
                <div className="rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-xs shadow-glass">
                  <div className="font-medium text-content-1">
                    Trade {p.n} · {p.symbol} {strategyLabel(p.strategy)}
                  </div>
                  <div className={pnlClass(p.pnl)}>
                    {signedMoney(p.pnl)} on {p.at}
                  </div>
                  <div className="text-content-3">Cumulative {money(p.cumulative)}</div>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="cumulative" stroke={line} strokeWidth={2}
            fill="url(#analytics-curve-fill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Analytics() {
  const savedTrades = useStore((s) => s.savedTrades);
  const loadJournal = useStore((s) => s.loadJournal);
  const [range, setRange] = useState<RangeId>("all");
  const [scope, setScope] = useState<Scope>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const scoped = useMemo(
    () => (scope === "all" ? savedTrades
      : savedTrades.filter((t) => (scope === "paper" ? t.paper : !t.paper))),
    [savedTrades, scope],
  );
  const stats = useMemo(() => dashboardStats(scoped, range), [scoped, range]);

  return (
    <section className="space-y-4" data-testid="analytics">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-content-3">
            Realized performance across your settled positions. Open trades
            don&apos;t move these numbers until they close.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md border border-white/10 p-0.5" role="group" aria-label="Scope">
            {([["all", "All"], ["real", "Real"], ["paper", "Sandbox"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setScope(id)}
                aria-pressed={scope === id}
                data-testid={`analytics-scope-${id}`}
                className={cx(
                  "rounded px-2.5 py-1 text-xs transition-colors duration-150",
                  scope === id ? "bg-accent-primary text-on-accent" : "text-content-3 hover:text-content-1",
                )}>
                {label}
              </button>
            ))}
          </div>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeId)}
            data-testid="analytics-range"
            aria-label="Time range"
            className="rounded-md border border-white/10 bg-dark-800 px-2.5 py-1.5 text-sm text-content-1 focus:border-accent-primary focus:outline-none"
          >
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {stats.totalTrades === 0 ? (
        <div className="card-glass flex flex-col items-center gap-2 p-10 text-center" data-testid="analytics-empty">
          <div className="text-base font-medium text-content-1">No settled trades in this range</div>
          <p className="max-w-md text-sm text-content-3">
            Close a position in the Position Log (or widen the time range) and
            the dashboard fills in — win rate, profit factor, equity curve and
            a per-strategy breakdown.
          </p>
        </div>
      ) : (
        <>
          {/* overview cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="analytics-overview">
            <MetricBox label="Total trades" value={String(stats.totalTrades)}
              hint="Settled positions in this range (manual close, assignment or expiry)" />
            <MetricBox label="Win rate"
              value={stats.winRate === null ? "—" : pct(stats.winRate)}
              hint={`${stats.wins} wins, ${stats.losses} losses`} />
            <MetricBox label="Profit factor"
              value={stats.profitFactor === null ? "∞" : stats.profitFactor.toFixed(2)}
              hint="Gross profit ÷ gross loss — above 1.0 means the wins pay for the losses"
              highlight={stats.profitFactor === null || stats.profitFactor >= 1 ? "green" : "red"} />
            <MetricBox label="Gross profit" value={money(stats.grossProfit)} highlight="green" />
            <MetricBox label="Gross loss" value={money(-stats.grossLoss)} highlight="red" />
            <MetricBox label="Net P&L"
              value={<DualValue usd={stats.netPnl} title="Aggregates convert at today's rate" />}
              highlight={stats.netPnl > 0 ? "green" : stats.netPnl < 0 ? "red" : "none"} />
          </div>

          {/* equity curve */}
          <div className="card-glass p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-heading">
              Equity curve — cumulative realized P&L
            </h3>
            <EquityCurveChart points={stats.equityCurve} />
          </div>

          {/* performance metrics grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="analytics-metrics">
            <MetricBox label="Average win"
              value={stats.avgWin === null ? "—" : money(stats.avgWin)} highlight="green" />
            <MetricBox label="Average loss"
              value={stats.avgLoss === null ? "—" : money(stats.avgLoss)} highlight="red" />
            <MetricBox label="Max win"
              value={stats.maxWin === null ? "—" : money(stats.maxWin)} highlight="green" />
            <MetricBox label="Max loss"
              value={stats.maxLoss === null ? "—" : money(stats.maxLoss)} highlight="red" />
            <MetricBox label="Risk-reward"
              value={stats.riskReward === null ? "—" : stats.riskReward.toFixed(2)}
              hint="Average win ÷ average loss" />
            <MetricBox label="Best day"
              value={stats.bestDay === null ? "—" : signedMoney(stats.bestDay.pnl)}
              hint={stats.bestDay?.date} highlight="green" />
            <MetricBox label="Worst day"
              value={stats.worstDay === null ? "—" : signedMoney(stats.worstDay.pnl)}
              hint={stats.worstDay?.date} highlight="red" />
            <MetricBox label="Consecutive wins" value={String(stats.maxConsecutiveWins)}
              hint="Longest winning streak in this range" />
          </div>

          {/* by-strategy breakdown */}
          {stats.byStrategy.length > 0 && (
            <div className="card-glass p-4" data-testid="analytics-strategies">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-heading">
                By strategy
              </h3>
              <div className="space-y-1">
                {stats.byStrategy.map((row) => (
                  <div key={row.strategy}>
                    <button
                      onClick={() => setExpanded(expanded === row.strategy ? null : row.strategy)}
                      aria-expanded={expanded === row.strategy}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors duration-150 hover:bg-dark-700/60"
                    >
                      <span className="text-sm font-medium capitalize text-content-1">
                        {strategyLabel(row.strategy)}
                        <span aria-hidden className="ml-2 text-xs text-content-3">
                          {expanded === row.strategy ? "▾" : "▸"}
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-content-2">
                        Trades: {row.trades} · Win: {pct(row.winRate)} · Avg:{" "}
                        <span className={pnlClass(row.avgPnl)}>{signedMoney(row.avgPnl)}</span> · Total:{" "}
                        <span className={pnlClass(row.totalPnl)}>{signedMoney(row.totalPnl)}</span>
                      </span>
                    </button>
                    {expanded === row.strategy && (
                      <div className="animate-card-enter mb-2 ml-3 space-y-0.5 border-l border-white/10 pl-3">
                        {stats.equityCurve
                          .filter((p) => p.strategy === row.strategy)
                          .map((p) => (
                            <div key={p.n} className="flex justify-between py-0.5 font-mono text-xs tabular-nums text-content-3">
                              <span>{p.at} · {p.symbol}</span>
                              <span className={pnlClass(p.pnl)}>{signedMoney(p.pnl)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
