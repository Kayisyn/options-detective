import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "../store";
import { money, pct, strategyLabel } from "../lib/format";
import { useTheme } from "../contexts/ThemeContext";
import Button from "./ui/Button";
import { Badge, Card, MetricBox } from "./ui/Card";
import { FormInput } from "./ui/Input";
import { CloseTradeModal } from "./Journal";
import type { EquityPoint, JournalTrade } from "../types";

// Paper Trading dashboard (v2.0 §1.5): budget header, open positions with
// marks, equity curve, statistics, settled history. All money numbers come
// from the backend paper engine; this view only renders them.

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}

function pnlClass(v: number | null): string {
  if (v === null) return "text-content-3";
  return v > 0 ? "text-accent-green" : v < 0 ? "text-accent-red" : "text-content-2";
}

function dteOf(expiration: string | null): number | null {
  if (!expiration) return null;
  return Math.round((Date.parse(`${expiration}T21:00:00Z`) - Date.now()) / 86_400_000);
}

function EquityCurve({ points }: { points: EquityPoint[] }) {
  useTheme();
  const line = cssVar("--od-accent-blue", "#3b82f6");
  const grid = cssVar("--od-dark-700", "#2a3050");
  const panel = cssVar("--od-dark-800", "#1a1f3a");
  const axis = cssVar("--od-text-3", "#9ca3af");
  if (points.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-dark-600 text-sm text-content-3">
        The equity curve appears after a few snapshots (open, close or process positions).
      </div>
    );
  }
  return (
    <div className="h-48 w-full" data-testid="equity-curve">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} opacity={0.2} />
          <XAxis dataKey="at" tickFormatter={(v: string) => v.slice(5, 10)}
            stroke={axis} fontSize={11} minTickGap={40} />
          <YAxis tickFormatter={(v: number) => money(v)} stroke={axis} fontSize={11}
            width={78} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(value: number) => [money(value, 2), "Account value"]}
            labelFormatter={(label: string) => label.slice(0, 16).replace("T", " ")}
            contentStyle={{ backgroundColor: panel, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="accountValue" stroke={line} strokeWidth={2}
            fill={line} fillOpacity={0.08} isAnimationActive animationDuration={800} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PaperTrading() {
  const s = useStore();
  const [initial, setInitial] = useState("50000");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [closeTarget, setCloseTarget] = useState<JournalTrade | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [curveDays, setCurveDays] = useState(90);

  useEffect(() => {
    s.loadPaper(curveDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount + range change
  }, [curveDays]);

  const paper = s.paper;
  const balance = paper?.balance ?? null;

  if (paper && !balance) {
    return (
      <section className="mx-auto max-w-md space-y-4 py-10 text-center" data-testid="paper-setup">
        <h2 className="text-xl font-semibold">Paper Trading Simulator</h2>
        <p className="text-sm text-content-3">
          Test strategies risk-free against a simulated budget. Positions are
          tracked with the same engine marks as the journal; assignment and
          expiry settle deterministically at market prices.
        </p>
        <FormInput label="Starting balance $" type="number" step="1000" value={initial}
          onChange={(e) => setInitial(e.target.value)} data-testid="paper-initial" />
        <Button size="lg" className="w-full" disabled={Number(initial) <= 0}
          data-testid="paper-create"
          onClick={() => s.createPaperAccount(Number(initial))}>
          Start paper trading
        </Button>
      </section>
    );
  }
  if (!paper || !balance) {
    return <div className="rounded-md bg-dark-800 px-4 py-3 text-sm text-content-3">Loading…</div>;
  }

  const open = paper.trades.filter((t) => t.status === "open");
  const settled = paper.trades.filter((t) => t.status !== "open");
  const stats = paper.stats;
  const totalReturn = balance.accountValue - balance.initialBalance;

  async function onProcess() {
    setBusy(true);
    await s.processPaper();
    setBusy(false);
  }

  return (
    <section className="space-y-4" data-testid="paper-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Paper Trading Simulator</h2>
          <p className="text-sm text-content-3" data-testid="paper-headline">
            {money(balance.initialBalance)} initial →{" "}
            <b className={pnlClass(totalReturn)}>{money(balance.accountValue, 2)}</b>{" "}
            ({totalReturn >= 0 ? "+" : ""}{((totalReturn / balance.initialBalance) * 100).toFixed(2)}%)
            — simulated money, engine marks, cash-settled assignment.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onProcess} disabled={busy || open.length === 0}
            title="Refresh marks and settle anything past expiry (assignment is deterministic)"
            data-testid="paper-process">
            {busy ? "Processing…" : "Process marks & expiry"}
          </Button>
          {confirmReset ? (
            <Button variant="destructive" size="sm" data-testid="paper-reset-confirm"
              onClick={() => { setConfirmReset(false); s.resetPaper(); }}>
              Confirm reset — archives {open.length + settled.length} trades
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => {
              setConfirmReset(true);
              setTimeout(() => setConfirmReset(false), 4000);
            }} data-testid="paper-reset">
              Reset account
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="paper-balance">
        <MetricBox label="Account value" value={money(balance.accountValue, 2)}
          highlight={totalReturn > 0 ? "green" : totalReturn < 0 ? "red" : "none"}
          hint="Initial + realized + unrealized (marked positions only)" />
        <MetricBox label="Available" value={money(balance.available, 2)}
          hint="Initial + realized − capital reserved by open positions" />
        <MetricBox label="Reserved" value={money(balance.reserved, 2)}
          hint="Capital held against open positions (cash-secured amounts, max losses, debits)" />
        <MetricBox label="Realized P&L" value={money(balance.realizedPnl, 2)}
          highlight={balance.realizedPnl > 0 ? "green" : balance.realizedPnl < 0 ? "red" : "none"} />
        <MetricBox label="Unrealized"
          value={balance.unrealizedPnl === null ? "—" : money(balance.unrealizedPnl, 2)}
          highlight={(balance.unrealizedPnl ?? 0) > 0 ? "green" : (balance.unrealizedPnl ?? 0) < 0 ? "red" : "none"}
          hint="From the latest marks — run Process to refresh" />
        <MetricBox label="Win rate" value={stats.winRate === null ? "—" : pct(stats.winRate)}
          hint={`Profit factor ${stats.profitFactor ?? "—"} · ${stats.assigned} assigned`} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wide text-content-3">Equity curve</h3>
        <div className="flex gap-1.5">
          {[30, 90, 0].map((d) => (
            <button key={d} onClick={() => setCurveDays(d)}
              className={`rounded border px-2 py-1 text-xs transition-all duration-150 ease-out ${
                curveDays === d
                  ? "border-accent-blue/60 bg-accent-blue/15 text-accent-blue"
                  : "border-dark-600 text-content-3 hover:border-dark-500"
              }`}>
              {d === 0 ? "All" : `${d}d`}
            </button>
          ))}
        </div>
      </div>
      <EquityCurve points={s.paperCurve} />

      <h3 className="text-sm font-medium uppercase tracking-wide text-content-3">
        Open positions ({open.length})
      </h3>
      {open.length === 0 ? (
        <div className="rounded-lg border border-dashed border-dark-600 p-6 text-center text-sm text-content-3">
          No open paper positions. Log one in the Journal with the “Paper trade”
          toggle, or hit “Paper” on a Recommender candidate.
        </div>
      ) : (
        <div className="space-y-2">
          {open.map((t) => {
            const dte = dteOf(t.expiration);
            const unrl = t.lastMark?.unrealizedPnl ?? null;
            const expanded = expandedId === t.id;
            return (
              <Card key={t.id} interactive data-testid="paper-row"
                onClick={() => setExpandedId(expanded ? null : t.id)}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-16 font-mono font-semibold">{t.symbol}</span>
                  <span className="capitalize">{strategyLabel(t.strategy)}</span>
                  <Badge variant={t.side === "debit" ? "blue" : "orange"}>{t.side}</Badge>
                  <span className="font-mono text-sm text-content-2">
                    ${t.entryPrice.toFixed(2)} × {t.entryQty}
                  </span>
                  <span className="text-xs text-content-3"
                    title="Capital reserved against this position">
                    reserves {money(t.reservedCapital)}
                  </span>
                  {dte !== null && (
                    <Badge variant={dte <= 3 ? "orange" : "neutral"}>
                      {dte <= 0 ? "expiry due" : `${dte}d`}
                    </Badge>
                  )}
                  <span className={`ml-auto font-mono font-bold tabular-nums ${pnlClass(unrl)}`}>
                    {unrl === null ? "—" : money(unrl)}
                    {unrl !== null && <span className="ml-1 text-[10px] font-normal text-content-3">unrl</span>}
                  </span>
                </div>
                {expanded && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-dark-700 pt-3 text-sm text-content-2"
                    onClick={(e) => e.stopPropagation()}>
                    {t.lastMark && (
                      <span>
                        Underlying <b className="font-mono">{money(t.lastMark.underlying, 2)}</b>
                        {t.lastMark.mark !== null && <> · structure <b className="font-mono">${Math.abs(t.lastMark.mark).toFixed(2)}</b></>}
                        {t.lastMark.stale && <span className="text-accent-orange"> (stale)</span>}
                      </span>
                    )}
                    {t.assignmentStrike !== null && <span>Assignment strike ${t.assignmentStrike}</span>}
                    <span>Targets {money(t.maxProfitTarget)} / {money(t.maxLossTarget)}</span>
                    <Button size="xs" onClick={() => setCloseTarget(t)} data-testid="paper-close">
                      Close position
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {(stats.byStrategy.length > 0 || stats.bySymbol.length > 0) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-content-3">
          <span>
            Avg win <b className="text-accent-green">{stats.avgWin === null ? "—" : money(stats.avgWin)}</b>
            {" "}· avg loss <b className="text-accent-red">{stats.avgLoss === null ? "—" : money(stats.avgLoss)}</b>
            {" "}· best <b className="text-accent-green">{stats.largestWin === null ? "—" : money(stats.largestWin)}</b>
            {" "}· worst <b className="text-accent-red">{stats.largestLoss === null ? "—" : money(stats.largestLoss)}</b>
          </span>
          {stats.byStrategy.length > 0 && (
            <span>
              By strategy: {stats.byStrategy.slice(0, 4).map((b) => (
                <span key={b.key} className="mr-2 capitalize">
                  {strategyLabel(b.key)} <b className={pnlClass(b.pnl)}>{money(b.pnl)}</b>
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      <h3 className="text-sm font-medium uppercase tracking-wide text-content-3">
        History ({settled.length})
      </h3>
      {settled.length === 0 ? (
        <p className="text-sm text-content-3">Nothing settled yet.</p>
      ) : (
        <div className="space-y-2" data-testid="paper-history">
          {settled.map((t) => (
            <Card key={t.id}>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-16 font-mono font-semibold">{t.symbol}</span>
                <span className="capitalize">{strategyLabel(t.strategy)}</span>
                <Badge variant={t.status === "assigned" ? "orange" : "neutral"}>{t.status}</Badge>
                <span className="font-mono text-content-2">
                  ${t.entryPrice.toFixed(2)} → {t.exitPrice === null ? "—" : `$${t.exitPrice.toFixed(2)}`}
                </span>
                <span className="text-xs text-content-3">{(t.exitDate ?? "").slice(0, 10)}</span>
                <span className={`ml-auto font-mono font-bold tabular-nums ${pnlClass(t.actualPnl)}`}>
                  {t.actualPnl === null ? "—" : money(t.actualPnl)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CloseTradeModal trade={closeTarget} onClose={() => setCloseTarget(null)}
        onSubmit={async (id, input) => {
          const ok = await s.closePaperTrade(id, input);
          if (ok) setCloseTarget(null);
        }} />
    </section>
  );
}
