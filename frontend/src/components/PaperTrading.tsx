import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "../store";
import { money, pct, strategyLabel } from "../lib/format";
import { useTheme } from "../contexts/ThemeContext";
import Button from "./ui/Button";
import { Badge, Card, MetricBox, PctBadge } from "./ui/Card";
import { accountImpactPct, pctReturn } from "../lib/journalStats";
import { FormInput } from "./ui/Input";
import { CloseTradeModal } from "./Journal";
import PremiumTotal from "./ui/PremiumTotal";
import { SandboxCustomize, SandboxHoldings } from "./shared/SandboxCustomize";
import { DualValue } from "../lib/currency";
import type { EquityPoint, JournalTrade } from "../types";

// Sandbox view (renamed from Paper Trading, v1.4.0): three-column layout —
// stats sidebar, open positions center, equity curve right. All money
// numbers come from the backend paper engine; this view only renders them.

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

function EquityCurve({ points, days }: { points: EquityPoint[]; days: number }) {
  useTheme();
  const line = cssVar("--od-accent-primary", "#9733FF");
  const grid = cssVar("--od-dark-700", "#252535");
  const panel = cssVar("--od-dark-800", "#15151f");
  const axis = cssVar("--od-text-3", "#9e9eb2");
  // short ranges tick by time of day; longer ones by date (v1.3.3)
  const intraday = days > 0 && days <= 7;
  if (points.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-dark-600 px-4 text-center text-sm text-content-3">
        {days > 0
          ? "No snapshots in this range yet — try a wider range, or open/close/process positions."
          : "The equity curve appears after a few snapshots (open, close or process positions)."}
      </div>
    );
  }
  return (
    // v1.5.0: the curve traces in on mount/range switch (chart-trace wipe);
    // background 60s mark refreshes deliberately do NOT replay it
    <div key={days} className="chart-trace h-44 w-full" data-testid="equity-curve">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} opacity={0.2} />
          <XAxis dataKey="at"
            tickFormatter={(v: string) => (intraday ? v.slice(11, 16) : v.slice(5, 10))}
            stroke={axis} fontSize={11} minTickGap={40} />
          <YAxis tickFormatter={(v: number) => money(v)} stroke={axis} fontSize={11}
            width={70} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(value: number) => [money(value, 2), "Account value"]}
            labelFormatter={(label: string) => label.slice(0, 16).replace("T", " ")}
            contentStyle={{ backgroundColor: panel, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="accountValue" stroke={line} strokeWidth={2}
            fill={line} fillOpacity={0.08} isAnimationActive={false} />
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

  // v1.3.2: track the market without a button press — one quiet mark pass on
  // mount, then every 60s while this view is open (matches the data layer's
  // 60s quote cache; more often would only re-read the cache). Skipped when
  // the window is hidden or a pass is already running.
  useEffect(() => {
    const st = useStore.getState();
    st.loadPaper().then(() => useStore.getState().processPaper({ quiet: true }));
    const timer = setInterval(() => {
      if (document.hidden) return;
      useStore.getState().processPaper({ quiet: true });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const paper = s.paper;
  const balance = paper?.balance ?? null;

  if (paper && !balance) {
    return (
      <section className="mx-auto max-w-md py-10" data-testid="paper-setup">
        <Card className="space-y-4 p-6 text-center">
          <h2 className="text-xl font-semibold">Sandbox</h2>
          <p className="text-sm text-content-3">
            Test strategies risk-free against a simulated budget. Positions are
            tracked with the same engine marks as the Position Log; assignment
            and expiry settle deterministically at market prices.
          </p>
          <FormInput label="Starting balance $" type="number" step="1000" value={initial}
            onChange={(e) => setInitial(e.target.value)} data-testid="paper-initial" />
          <Button size="lg" className="w-full" disabled={Number(initial) <= 0}
            data-testid="paper-create"
            onClick={() => s.createPaperAccount(Number(initial))}>
            Start the Sandbox
          </Button>
        </Card>
      </section>
    );
  }
  if (!paper || !balance) {
    return <div className="card-glass px-4 py-3 text-sm text-content-3">Loading…</div>;
  }

  const open = paper.trades.filter((t) => t.status === "open");
  const settled = paper.trades.filter((t) => t.status !== "open");
  const stats = paper.stats;
  const totalReturn = balance.accountValue - balance.initialBalance;
  const latestMarkAt = open.reduce<string | null>(
    (acc, t) => (t.lastMark && (!acc || t.lastMark.at > acc) ? t.lastMark.at : acc), null);

  async function onProcess() {
    setBusy(true);
    await s.processPaper();
    setBusy(false);
  }

  return (
    <section className="space-y-4" data-testid="paper-dashboard">
      <div className="card-glass flex flex-wrap items-end justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Sandbox</h2>
          <p className="text-sm text-content-3" data-testid="paper-headline">
            {money(balance.initialBalance)} initial →{" "}
            <b className={pnlClass(totalReturn)}>
              <DualValue usd={balance.accountValue} digits={2} />
            </b>{" "}
            ({totalReturn >= 0 ? "+" : ""}{((totalReturn / balance.initialBalance) * 100).toFixed(2)}%)
            — simulated money, engine marks, deterministic assignment.
            {open.length > 0 && (
              <span className="text-content-3" data-testid="paper-mark-freshness">
                {" "}Marks auto-refresh every minute
                {latestMarkAt ? ` · last ${latestMarkAt.slice(11, 16)} UTC` : " · fetching…"}
                {s.paperMarking && " ⟳"}
              </span>
            )}
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

      {paper.settings && (
        <SandboxCustomize settings={paper.settings} accountValue={balance.accountValue}
          initialBalance={balance.initialBalance} />
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* left: account stats */}
        <aside className="card-glass h-fit space-y-2 p-4 lg:col-span-3" data-testid="paper-balance">
          <div className="rounded-md bg-dark-700/50 p-3 text-center">
            <div className="text-xs uppercase tracking-wide text-heading">Account value</div>
            <div className="mt-1 font-mono text-2xl font-bold text-content-1">
              {money(balance.accountValue, 2)}
            </div>
            <div className={`text-xs font-medium ${pnlClass(totalReturn)}`}>
              <DualValue usd={totalReturn} digits={2} signed /> total
            </div>
          </div>
          <MetricBox label="Available" value={<DualValue usd={balance.available} digits={2} />}
            hint="Initial + realized − capital reserved by open positions" />
          <MetricBox label="Reserved" value={<DualValue usd={balance.reserved} digits={2} />}
            hint="Capital held against open positions (cash-secured amounts, max losses, debits)" />
          <MetricBox label="Realized P&L" value={<DualValue usd={balance.realizedPnl} digits={2} />}
            highlight={balance.realizedPnl > 0 ? "green" : balance.realizedPnl < 0 ? "red" : "none"} />
          <MetricBox label="Unrealized"
            value={balance.unrealizedPnl === null ? "—" : <DualValue usd={balance.unrealizedPnl} digits={2} />}
            highlight={(balance.unrealizedPnl ?? 0) > 0 ? "green" : (balance.unrealizedPnl ?? 0) < 0 ? "red" : "none"}
            hint="From theoretical marks, auto-refreshed every minute while this tab is open" />
          <MetricBox label="Win rate" value={stats.winRate === null ? "—" : pct(stats.winRate)}
            hint={`Profit factor ${stats.profitFactor ?? "—"} · ${stats.assigned} assigned`} />
          {(balance.feesPaid ?? 0) > 0 && (
            <MetricBox label="Commissions" value={money(balance.feesPaid ?? 0, 2)}
              highlight="red"
              hint="Total simulated trading fees paid (already deducted from realized P&L)" />
          )}
        </aside>

        {/* center: open positions */}
        <div className="min-w-0 space-y-3 lg:col-span-6">
          <h3 className="text-sm font-medium uppercase tracking-wide text-heading">
            Open positions ({open.length})
          </h3>
          {open.length === 0 ? (
            <div className="rounded-lg border border-dashed border-dark-600 p-6 text-center text-sm text-content-3">
              No open sandbox positions. Log one in the Position Log with the
              “Sandbox trade” toggle, or hit “Sandbox” on a recommended candidate.
            </div>
          ) : (
            <div className="space-y-2">
              {open.map((t) => {
                const dte = dteOf(t.expiration);
                const unrl = t.lastMark?.unrealizedPnl ?? null;
                const expanded = expandedId === t.id;
                const returnPct = pctReturn(t);
                const impactPct = accountImpactPct(t, balance.accountValue);
                return (
                  <Card key={t.id} interactive data-testid="paper-row"
                    className={unrl !== null
                      ? unrl > 0 ? "glow-pnl-win" : unrl < 0 ? "glow-pnl-loss" : ""
                      : ""}
                    onClick={() => setExpandedId(expanded ? null : t.id)}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-16 font-mono font-semibold">{t.symbol}</span>
                      <span className="capitalize">{strategyLabel(t.strategy)}</span>
                      <Badge variant={t.side === "debit" ? "blue" : "orange"}>{t.side}</Badge>
                      <span className="font-mono text-sm text-content-2">
                        ${t.entryPrice.toFixed(2)} × {t.entryQty}
                        {" "}<PremiumTotal trade={t} />
                        {t.lastMark?.mark != null && (
                          <span title={`Current theoretical value per share (marked ${t.lastMark.at.slice(11, 16)} UTC)`}>
                            <span className="text-content-3"> → </span>
                            ${Math.abs(t.lastMark.mark).toFixed(2)}
                            {t.lastMark.stale && <span className="text-accent-orange" title="Quotes are stale (market closed?)"> ⚠</span>}
                          </span>
                        )}
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
                      <span className="ml-auto flex items-center gap-2">
                        {returnPct !== null && (
                          <PctBadge value={returnPct}
                            title="Live % return on the entry premium/debit (from the latest mark)" />
                        )}
                        {impactPct !== null && (
                          <PctBadge value={impactPct} muted suffix="of acct"
                            title="Capital this position reserves, as % of the account value" />
                        )}
                        <span className={`font-mono font-bold tabular-nums ${pnlClass(unrl)}`}
                          title={unrl === null
                            ? "No pricing model for this position — it was logged manually without a linked candidate, so it can't be repriced. Close it manually at your own exit price."
                            : "Unrealized P&L at the latest theoretical mark"}>
                          {unrl === null ? "—" : money(unrl)}
                          {unrl !== null && <span className="ml-1 text-[10px] font-normal text-content-3">unrl</span>}
                        </span>
                      </span>
                    </div>
                    {expanded && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 pt-3 text-sm text-content-2"
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

          {paper.holdings && paper.holdings.length > 0 && (
            <SandboxHoldings holdings={paper.holdings} />
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
        </div>

        {/* right: equity curve */}
        <div className="space-y-2 lg:col-span-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-heading">
            Equity curve
          </h3>
          <Card className="p-3">
            <EquityCurve points={s.paperCurve} days={curveDays} />
            <div className="mt-2 flex flex-wrap justify-center gap-1.5" data-testid="curve-ranges">
              {([[1, "1d"], [7, "1w"], [30, "1m"], [90, "3m"], [180, "6m"], [0, "All"]] as const).map(([d, label]) => (
                <button key={d} onClick={() => setCurveDays(d)}
                  className={`rounded border px-2 py-1 text-xs transition-all duration-150 ease-out-quad ${
                    curveDays === d
                      ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                      : "border-dark-600 text-content-3 hover:border-dark-500"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <h3 className="text-sm font-medium uppercase tracking-wide text-heading">
        History ({settled.length})
      </h3>
      {settled.length === 0 ? (
        <p className="text-sm text-content-3">Nothing settled yet.</p>
      ) : (
        <div className="space-y-2" data-testid="paper-history">
          {settled.map((t) => (
            <Card key={t.id} className="opacity-70">
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
