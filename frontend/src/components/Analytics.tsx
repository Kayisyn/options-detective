import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, ResponsiveContainer, Scatter,
  ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "../store";
import { money, pct, pnlClass, strategyLabel } from "../lib/format";
import { cssVar } from "../lib/cssVar";
import { useTheme } from "../contexts/ThemeContext";
import {
  advancedStats, dashboardStats, RANGES,
  type DrawdownPoint, type EquityCurvePoint, type MaeMfePoint, type RangeId,
} from "../lib/analytics";
import { DualValue } from "../lib/currency";
import { MetricBox } from "./ui/Card";
import { cx } from "../lib/cx";

// v1.7.2 Analytics Dashboard: realized-performance overview across the
// Position Log — overview cards, cumulative-P&L equity curve, a metrics
// grid and an expandable by-strategy breakdown, all under a shared
// time-range filter. Aggregation lives in lib/analytics.ts.

type Scope = "all" | "real" | "paper";

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

// v1.8.2 drawdown chart: distance below the high-water mark per settled
// trade — flat at 0 on peaks, dipping red through troughs.
function DrawdownChart({ points }: { points: DrawdownPoint[] }) {
  useTheme();
  const red = cssVar("--od-accent-red", "#ef4444");
  const grid = cssVar("--od-dark-700", "#252535");
  const axis = cssVar("--od-text-3", "#9e9eb2");
  if (points.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-dark-600 px-4 text-center text-sm text-content-3">
        Drawdown analysis needs two or more settled positions in this range.
      </div>
    );
  }
  return (
    <div className="chart-trace h-48 w-full" data-testid="drawdown-chart">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} opacity={0.2} />
          <XAxis dataKey="at" tickFormatter={(v: string) => v.slice(5)}
            stroke={axis} fontSize={11} minTickGap={40} />
          <YAxis tickFormatter={(v: number) => money(v)} stroke={axis} fontSize={11}
            width={72} domain={["auto", 0]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as DrawdownPoint;
              return (
                <div className="rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-xs shadow-glass">
                  <div className="font-medium text-content-1">{p.at} · trade {p.n}</div>
                  <div className="text-content-2">Equity {money(p.equity)} · peak {money(p.peak)}</div>
                  <div className={p.drawdown < 0 ? "text-accent-red" : "text-accent-green"}>
                    Drawdown {money(p.drawdown)}
                  </div>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="drawdown" stroke={red} strokeWidth={2}
            fill={red} fillOpacity={0.15} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// v1.8.2 MAE/MFE scatter: one dot per settled trade with observed marks —
// green if it closed a winner, red if a loser. Far-right dots suffered deep
// adverse excursions; high dots left unrealized profit on the table.
function MaeMfeChart({ points }: { points: MaeMfePoint[] }) {
  useTheme();
  const green = cssVar("--od-accent-green", "#10b981");
  const red = cssVar("--od-accent-red", "#ef4444");
  const grid = cssVar("--od-dark-700", "#252535");
  const axis = cssVar("--od-text-3", "#9e9eb2");
  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-dark-600 px-4 text-center text-sm text-content-3">
        MAE/MFE appear for positions whose marks were refreshed while open.
        Use “Refresh marks” in the Position Log, then close positions.
      </div>
    );
  }
  return (
    <div className="h-64 w-full" data-testid="maemfe-chart">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} opacity={0.2} />
          <XAxis type="number" dataKey="maePct" name="MAE %" unit="%"
            stroke={axis} fontSize={11}
            label={{ value: "MAE % (worst point)", position: "insideBottom", offset: -2, fill: axis, fontSize: 11 }} />
          <YAxis type="number" dataKey="mfePct" name="MFE %" unit="%"
            stroke={axis} fontSize={11} width={56}
            label={{ value: "MFE %", angle: -90, position: "insideLeft", fill: axis, fontSize: 11 }} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as MaeMfePoint;
              return (
                <div className="rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-xs shadow-glass">
                  <div className="font-medium text-content-1">
                    {p.symbol} {strategyLabel(p.strategy)} · {p.at}
                  </div>
                  <div className="text-content-2">MAE {p.maePct}% · MFE {p.mfePct}%</div>
                  <div className={p.win ? "text-accent-green" : "text-accent-red"}>
                    Realized {p.realizedPct}%
                  </div>
                </div>
              );
            }}
          />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.win ? green : red} fillOpacity={0.85} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Analytics() {
  const savedTrades = useStore((s) => s.savedTrades);
  const loadJournal = useStore((s) => s.loadJournal);
  const [range, setRange] = useState<RangeId>("all");
  const [scope, setScope] = useState<Scope>("all");
  const [page, setPage] = useState<"overview" | "advanced">("overview"); // v1.8.2
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
  const adv = useMemo(
    () => (page === "advanced" ? advancedStats(scoped, range) : null),
    [scoped, range, page],
  );

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

      {/* v1.8.2: Overview | Advanced page strip */}
      <div className="flex gap-1 border-b border-white/10" role="tablist" aria-label="Analytics pages">
        {([["overview", "Overview"], ["advanced", "Advanced"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={page === id}
            data-testid={`analytics-page-${id}`}
            onClick={() => setPage(id)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150",
              page === id
                ? "border-accent-primary text-content-1"
                : "border-transparent text-content-3 hover:text-content-1",
            )}>
            {label}
          </button>
        ))}
      </div>

      {stats.totalTrades === 0 ? (
        <div className="card-glass flex flex-col items-center gap-2 p-10 text-center" data-testid="analytics-empty">
          <div className="text-base font-medium text-content-1">No settled trades in this range</div>
          <p className="max-w-md text-sm text-content-3">
            Close a position in the Position Log (or widen the time range) and
            the dashboard fills in, win rate, profit factor, equity curve and
            a per-strategy breakdown.
          </p>
        </div>
      ) : page === "advanced" && adv ? (
        <>
          {/* risk-adjusted returns */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="advanced-ratios">
            <MetricBox label="Sharpe ratio"
              value={adv.sharpe === null ? "-" : adv.sharpe.toFixed(2)}
              hint="Mean per-trade return over its volatility, above 1 is good, above 2 excellent"
              highlight={adv.sharpe !== null && adv.sharpe >= 1 ? "green" : "none"} />
            <MetricBox label="Sortino ratio"
              value={adv.sortino === null ? "-" : adv.sortino.toFixed(2)}
              hint="Like Sharpe but only downside swings count against you, needs at least one loss"
              highlight={adv.sortino !== null && adv.sortino >= 1 ? "green" : "none"} />
            <MetricBox label="Calmar ratio"
              value={adv.calmar === null ? "-" : adv.calmar.toFixed(2)}
              hint="Annualized P&L over max drawdown, treat with care on short histories" />
          </div>

          {/* drawdown analysis */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="advanced-drawdown">
            <MetricBox label="Max drawdown"
              value={adv.maxDrawdown === null ? "-"
                : `${money(adv.maxDrawdown)}${adv.maxDrawdownPct !== null ? ` (${adv.maxDrawdownPct}%)` : ""}`}
              hint="Biggest peak-to-trough drop of realized equity" highlight="red" />
            <MetricBox label="Current drawdown"
              value={adv.currentDrawdown < 0 ? money(adv.currentDrawdown) : "At peak"}
              highlight={adv.currentDrawdown < 0 ? "red" : "green"}
              hint="Distance below the high-water mark right now" />
            <MetricBox label="Drawdown duration"
              value={adv.drawdownDays === 0 ? "-" : `${adv.drawdownDays} ${adv.drawdownDays === 1 ? "day" : "days"}`}
              hint="Days since the current peak was set" />
          </div>
          <div className="card-glass p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-heading">
              Drawdown, distance below the high-water mark
            </h3>
            <DrawdownChart points={adv.drawdownCurve} />
          </div>

          {/* trade quality */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="advanced-quality">
            <MetricBox label="Expectancy"
              value={adv.expectancy === null ? "-" : `${signedMoney(adv.expectancy)}/trade`}
              hint="Win% × avg win − loss% × avg loss, expected P&L of the next trade"
              highlight={adv.expectancy !== null && adv.expectancy > 0 ? "green" : "red"} />
            <MetricBox label="Profit factor"
              value={stats.profitFactor === null ? "∞" : stats.profitFactor.toFixed(2)}
              hint="Gross profit ÷ gross loss, above 1.5 is solid, above 2.0 excellent" />
            <MetricBox label="Recovery factor"
              value={adv.recoveryFactor === null ? "-" : adv.recoveryFactor.toFixed(2)}
              hint="Net P&L over max drawdown, how thoroughly losses were recovered" />
          </div>

          {/* MAE/MFE */}
          <div className="card-glass p-4">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-heading">
              MAE / MFE, exit quality
            </h3>
            <p className="mb-3 text-xs text-content-3">
              Each dot is a settled trade: how far it went against you at its
              worst (MAE) vs how much was on the table at its best (MFE).
              Green closed a winner, red a loser.
            </p>
            <MaeMfeChart points={adv.maeMfe} />
          </div>
        </>
      ) : (
        <>
          {/* overview cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="analytics-overview">
            <MetricBox label="Total trades" value={String(stats.totalTrades)}
              hint="Settled positions in this range (manual close, assignment or expiry)" />
            <MetricBox label="Win rate"
              value={stats.winRate === null ? "-" : pct(stats.winRate)}
              hint={`${stats.wins} wins, ${stats.losses} losses`} />
            <MetricBox label="Profit factor"
              value={stats.profitFactor === null ? "∞" : stats.profitFactor.toFixed(2)}
              hint="Gross profit ÷ gross loss, above 1.0 means the wins pay for the losses"
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
              Equity curve, cumulative realized P&L
            </h3>
            <EquityCurveChart points={stats.equityCurve} />
          </div>

          {/* performance metrics grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="analytics-metrics">
            <MetricBox label="Average win"
              value={stats.avgWin === null ? "-" : money(stats.avgWin)} highlight="green" />
            <MetricBox label="Average loss"
              value={stats.avgLoss === null ? "-" : money(stats.avgLoss)} highlight="red" />
            <MetricBox label="Max win"
              value={stats.maxWin === null ? "-" : money(stats.maxWin)} highlight="green" />
            <MetricBox label="Max loss"
              value={stats.maxLoss === null ? "-" : money(stats.maxLoss)} highlight="red" />
            <MetricBox label="Risk-reward"
              value={stats.riskReward === null ? "-" : stats.riskReward.toFixed(2)}
              hint="Average win ÷ average loss" />
            <MetricBox label="Best day"
              value={stats.bestDay === null ? "-" : signedMoney(stats.bestDay.pnl)}
              hint={stats.bestDay?.date} highlight="green" />
            <MetricBox label="Worst day"
              value={stats.worstDay === null ? "-" : signedMoney(stats.worstDay.pnl)}
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
