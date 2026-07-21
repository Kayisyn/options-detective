import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { money, pct, pnlClass, strategyLabel } from "../lib/format";
import { ALL_STRATEGY_TYPES } from "../lib/copy";
import { accountImpactPct, journalStats, pctReturn } from "../lib/journalStats";
import {
  CSV_COLUMNS, confirmationText, defaultCsvColumnIds, downloadCsv,
  loadCsvColumnIds, saveCsvColumnIds,
} from "../lib/journalCsv";
import { cx } from "../lib/cx";
import { DualValue } from "../lib/currency";
import Button from "./ui/Button";
import { Badge, Card, MetricBox, PctBadge } from "./ui/Card";
import { FormInput, FormSelect } from "./ui/Input";
import Modal from "./ui/Modal";
import PremiumTotal, { premiumTotal } from "./ui/PremiumTotal";
import type { CloseTradeInput, JournalTrade, NewTradeInput, TradeSide } from "../types";

// Position Log view (renamed from Journal, v1.4.0): trade logging, live
// marks, close workflow with realized P&L, tags, filters/sorts, analytics,
// CSV export. Winner/loser positions carry green/red border glows; closed
// positions fade back.

type StatusFilter = "all" | "open" | "closed";
type ScopeFilter = "all" | "real" | "paper";
type JournalSort = "newest" | "oldest" | "pnlDesc" | "pnlAsc" | "symbol";

function displayPnl(t: JournalTrade): { value: number | null; realized: boolean } {
  if (t.status !== "open") return { value: t.actualPnl, realized: true };
  return { value: t.lastMark?.unrealizedPnl ?? null, realized: false };
}

function applyJournalFilters(
  trades: JournalTrade[], status: StatusFilter, scope: ScopeFilter,
  symbol: string, sort: JournalSort,
): JournalTrade[] {
  let list = trades;
  if (scope !== "all") list = list.filter((t) => (scope === "paper" ? t.paper : !t.paper));
  if (status === "open") list = list.filter((t) => t.status === "open");
  if (status === "closed") list = list.filter((t) => t.status !== "open");
  const sym = symbol.trim().toUpperCase();
  if (sym) list = list.filter((t) => t.symbol.includes(sym));
  const pnlOf = (t: JournalTrade) => displayPnl(t).value ?? Number.NEGATIVE_INFINITY;
  const sorted = [...list];
  switch (sort) {
    case "oldest": sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); break;
    case "pnlDesc": sorted.sort((a, b) => pnlOf(b) - pnlOf(a)); break;
    case "pnlAsc": sorted.sort((a, b) => pnlOf(a) - pnlOf(b)); break;
    case "symbol": sorted.sort((a, b) => a.symbol.localeCompare(b.symbol)); break;
    default: sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return sorted;
}

export default function Journal() {
  // v1.9.3: field selectors — see Recommender for the rationale
  const s = useStore(useShallow((st) => ({
    savedTrades: st.savedTrades, trashedTrades: st.trashedTrades, paper: st.paper,
    exportedId: st.exportedId,
    loadJournal: st.loadJournal, loadTrash: st.loadTrash, loadPaper: st.loadPaper,
    logTrade: st.logTrade, openPaperTrade: st.openPaperTrade,
    closeTrade: st.closeTrade, closePaperTrade: st.closePaperTrade,
    updateTrade: st.updateTrade, exportTrade: st.exportTrade,
    refreshMarks: st.refreshMarks, clearAllPositions: st.clearAllPositions,
    trashPosition: st.trashPosition, restorePosition: st.restorePosition,
    deletePositionForever: st.deletePositionForever,
    restoreAllTrash: st.restoreAllTrash, purgeTrash: st.purgeTrash,
    showToast: st.showToast,
  })));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [sort, setSort] = useState<JournalSort>("newest");
  const [logOpen, setLogOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<JournalTrade | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [marksBusy, setMarksBusy] = useState(false);
  const [tab, setTab] = useState<"log" | "trash">("log"); // v1.5.1
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportOpen, setExportOpen] = useState(false); // v1.8.0 column picker

  useEffect(() => {
    s.loadJournal();
    s.loadTrash(); // v1.5.1: keep the Trash tab count live
    // account-impact % on sandbox rows needs the paper balance
    if (s.paper === null) s.loadPaper();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  // scope applies to stats too (§1.3I: analytics separate real vs paper)
  const scoped = scope === "all" ? s.savedTrades
    : s.savedTrades.filter((t) => (scope === "paper" ? t.paper : !t.paper));
  const stats = useMemo(() => journalStats(scoped), [scoped]);
  const visible = applyJournalFilters(s.savedTrades, statusFilter, scope, symbolFilter, sort);

  async function onRefreshMarks() {
    setMarksBusy(true);
    await s.refreshMarks();
    setMarksBusy(false);
  }

  return (
    <section className="space-y-4" data-testid="journal">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Position log</h2>
          {stats.winRate !== null && (
            <p className="font-mono text-sm tabular-nums text-accent-primary-text"
              data-testid="journal-winrate">
              {pct(stats.winRate)} win rate ({stats.wins} {stats.wins === 1 ? "win" : "wins"},{" "}
              {stats.losses} {stats.losses === 1 ? "loss" : "losses"})
            </p>
          )}
          <p className="text-sm text-content-3">
            Marks are Black-Scholes theoretical values at the latest quote;
            MAE/MFE are watermarks of marks observed here, not tick data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setLogOpen(true)} data-testid="log-trade-button">
            Log New Trade
          </Button>
          <Button variant="secondary" size="sm" onClick={onRefreshMarks}
            disabled={marksBusy || stats.open === 0} data-testid="refresh-marks">
            {marksBusy ? "Refreshing…" : "Refresh marks"}
          </Button>
          <Button variant="ghost" size="sm" disabled={s.savedTrades.length === 0}
            onClick={() => setExportOpen(true)} data-testid="export-csv">
            Export CSV
          </Button>
        </div>
      </div>

      {/* v1.5.1: Position Log / Trash tab strip */}
      <div className="flex gap-1 border-b border-white/10" role="tablist">
        {([["log", "Position Log"], ["trash", `Trash${s.trashedTrades.length ? ` (${s.trashedTrades.length})` : ""}`]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id}
            data-testid={`journal-tab-${id}`}
            onClick={() => setTab(id)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150",
              tab === id
                ? "border-accent-primary text-content-1"
                : "border-transparent text-content-3 hover:text-content-1",
            )}>
            {label}
          </button>
        ))}
      </div>

      {tab === "trash" && (
        <TrashView trades={s.trashedTrades}
          onRestore={s.restorePosition} onDelete={s.deletePositionForever}
          onRestoreAll={s.restoreAllTrash} onPurge={s.purgeTrash} />
      )}

      {tab === "log" && (
      <div className="flex flex-col gap-4 lg:flex-row">
        {s.savedTrades.length > 0 && (
          <aside className="card-glass h-fit w-full shrink-0 p-4 lg:w-64" data-testid="journal-stats">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-heading">
              Stats
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <MetricBox label="Trades" value={String(stats.total)} />
              <MetricBox label="Open" value={String(stats.open)} />
              <MetricBox label="Win rate" value={stats.winRate === null ? "—" : pct(stats.winRate)}
                hint="Winners among closed trades" />
              <MetricBox label="Realized P&L"
                value={<DualValue usd={stats.totalPnl} title="Aggregates convert at today's rate" />}
                highlight={stats.totalPnl > 0 ? "green" : stats.totalPnl < 0 ? "red" : "none"} />
              <MetricBox label="Avg win" value={stats.avgWin === null ? "—" : <DualValue usd={stats.avgWin} />} highlight="green" />
              <MetricBox label="Avg loss" value={stats.avgLoss === null ? "—" : <DualValue usd={stats.avgLoss} />} highlight="red" />
              <MetricBox label="Best" value={stats.largestWin === null ? "—" : <DualValue usd={stats.largestWin} />} highlight="green" />
              <MetricBox label="Worst" value={stats.largestLoss === null ? "—" : <DualValue usd={stats.largestLoss} />} highlight="red" />
            </div>
            {(stats.byStrategy.length > 0 || stats.bySymbol.length > 0) && (
              <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-content-3">
                {stats.byStrategy.length > 0 && (
                  <div>
                    P&L by strategy:{" "}
                    {stats.byStrategy.slice(0, 4).map((b) => (
                      <span key={b.key} className="mr-2 capitalize">
                        {strategyLabel(b.key)} <b className={pnlClass(b.pnl)}>{money(b.pnl)}</b>
                      </span>
                    ))}
                  </div>
                )}
                {stats.bySymbol.length > 0 && (
                  <div>
                    By symbol:{" "}
                    {stats.bySymbol.slice(0, 4).map((b) => (
                      <span key={b.key} className="mr-2 font-mono">
                        {b.key} <b className={pnlClass(b.pnl)}>{money(b.pnl)}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <FormSelect label="Status" value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Settled</option>
            </FormSelect>
            <FormSelect label="Scope" value={scope} data-testid="scope-filter"
              onChange={(e) => setScope(e.target.value as ScopeFilter)}>
              <option value="all">Real + sandbox</option>
              <option value="real">Real only</option>
              <option value="paper">Sandbox only</option>
            </FormSelect>
            <FormInput label="Symbol" placeholder="AAPL" value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
              className="w-28 font-mono uppercase" />
            <FormSelect label="Sort" value={sort}
              onChange={(e) => setSort(e.target.value as JournalSort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="pnlDesc">P&L high → low</option>
              <option value="pnlAsc">P&L low → high</option>
              <option value="symbol">Symbol A→Z</option>
            </FormSelect>
            <span className="pb-3 text-xs text-content-3">
              {visible.length} of {s.savedTrades.length}
            </span>
          </div>

          {s.savedTrades.length === 0 ? (
            <div className="rounded-lg border border-dashed border-dark-600 p-10 text-center text-content-3">
              No positions yet. <b>Log New Trade</b> to enter one manually, or
              save a candidate from the Recommendations view.
            </div>
          ) : (
            <div className="space-y-2">
          {visible.map((t) => {
            const pnl = displayPnl(t);
            const expanded = expandedId === t.id;
            const settled = t.status !== "open";
            // v1.5.0 contextual P&L glow: winners radiate green, losers red —
            // open rows glow by their live mark, settled rows by the outcome
            const outcome = pnl.value !== null
              ? pnl.value > 0 ? "glow-pnl-win" : pnl.value < 0 ? "glow-pnl-loss" : ""
              : "";
            const returnPct = pctReturn(t);
            const impactPct = accountImpactPct(t, s.paper?.balance?.accountValue);
            return (
              <Card key={t.id} interactive data-testid="journal-row"
                className={`${settled ? "opacity-70" : ""} ${outcome}`}
                onClick={() => setExpandedId(expanded ? null : t.id)}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-16 font-mono font-semibold">{t.symbol}</span>
                  <span className="capitalize">{strategyLabel(t.strategy)}</span>
                  <Badge variant={t.side === "debit" ? "blue" : "orange"}>{t.side}</Badge>
                  <Badge variant={t.status === "open" ? "green" : t.status === "assigned" ? "orange" : "neutral"}>
                    {t.status}
                  </Badge>
                  {t.paper && (
                    <Badge variant="violet" title="Simulated position — Sandbox budget, not real money">
                      sandbox
                    </Badge>
                  )}
                  <span className="font-mono text-sm text-content-2">
                    ${t.entryPrice.toFixed(2)} × {t.entryQty}
                  </span>
                  <PremiumTotal trade={t} />
                  <span className="text-xs text-content-3">{t.entryDate.slice(0, 10)}</span>
                  {t.tags.map((tag) => <Badge key={tag} variant="neutral">{tag}</Badge>)}
                  <span className="ml-auto flex items-center gap-2">
                    {returnPct !== null && (
                      <PctBadge value={returnPct}
                        title={pnl.realized
                          ? "Total % return on the entry premium/debit"
                          : "Live % return on the entry premium/debit (from the latest mark)"} />
                    )}
                    {impactPct !== null && (
                      <PctBadge value={impactPct} muted suffix="of acct"
                        title="Capital this position reserves, as % of the sandbox account" />
                    )}
                    <span className={`font-mono font-bold tabular-nums ${pnlClass(pnl.value)}`}
                      title={pnl.realized ? "Realized P&L" : "Unrealized P&L from the latest mark"}>
                      {pnl.value === null ? "—" : (
                        <DualValue usd={pnl.value}
                          histRate={pnl.realized
                            ? (t.exchangeRateAtClose ?? t.exchangeRateUsed ?? null)
                            : undefined} />
                      )}
                      {!pnl.realized && pnl.value !== null && (
                        <span className="ml-1 text-[10px] font-normal text-content-3">unrl</span>
                      )}
                    </span>
                  </span>
                </div>

                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-dark-700 pt-3 text-sm"
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-content-2">
                      <span>Targets: max profit <b className="text-accent-green">{money(t.maxProfitTarget)}</b>
                        {" "}· max loss <b className="text-accent-red">{money(t.maxLossTarget)}</b></span>
                      {t.lastMark && (
                        <span>
                          Last mark: underlying <b className="font-mono">{money(t.lastMark.underlying, 2)}</b>
                          {t.lastMark.mark !== null && <> · structure <b className="font-mono">${Math.abs(t.lastMark.mark).toFixed(2)}</b></>}
                          {t.lastMark.stale && <span className="text-accent-orange"> (stale)</span>}
                          <span className="text-content-3"> · {t.lastMark.at.slice(0, 16).replace("T", " ")}</span>
                        </span>
                      )}
                      {(t.mae !== null || t.mfe !== null) && (
                        <span title="Watermarks of marks observed while the app was open">
                          MAE <b className="text-accent-red">{t.mae === null ? "—" : money(t.mae)}</b>
                          {" "}/ MFE <b className="text-accent-green">{t.mfe === null ? "—" : money(t.mfe)}</b>
                        </span>
                      )}
                      {t.status === "closed" && (
                        <span>Exit ${t.exitPrice?.toFixed(2)} on {(t.exitDate ?? "").slice(0, 10)}</span>
                      )}
                    </div>
                    {t.exportText && (
                      <div className="rounded bg-dark-900/60 px-3 py-2 font-mono text-xs text-content-2">
                        {t.exportText}
                      </div>
                    )}
                    <NotesEditor trade={t} onSave={(notes, tags) => s.updateTrade(t.id, { notes, tags })} />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {t.status === "open" && (
                        <Button size="xs" onClick={() => setCloseTarget(t)} data-testid="close-position">
                          Close position
                        </Button>
                      )}
                      <Button variant="ghost" size="xs"
                        onClick={() => s.exportTrade(t.id, confirmationText(t))}>
                        {s.exportedId === t.id ? "Copied ✓" : "Copy confirmation"}
                      </Button>
                      <Button variant="secondary" size="xs" data-testid="trash-position"
                        title="Move to Trash — recoverable from the Trash tab"
                        onClick={() => s.trashPosition(t.id)}>
                        Move to Trash
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
            </div>
          )}

          {s.savedTrades.length > 0 && (
            <div className="flex justify-end border-t border-white/10 pt-3">
              <Button variant="ghost" size="sm" data-testid="clear-all"
                onClick={() => setConfirmClear(true)}>
                Clear All
              </Button>
            </div>
          )}
        </div>
      </div>
      )}

      <ClearAllModal open={confirmClear} onClose={() => setConfirmClear(false)}
        onConfirm={async () => { await s.clearAllPositions(); setConfirmClear(false); }} />

      <CsvExportModal open={exportOpen} onClose={() => setExportOpen(false)}
        trades={s.savedTrades}
        onExported={() => { setExportOpen(false); s.showToast("✓ CSV downloaded"); }} />

      <LogTradeModal open={logOpen} onClose={() => setLogOpen(false)}
        onSubmit={async (input) => {
          // paper trades go through the paper engine (budget reservation)
          const ok = input.paper
            ? await s.openPaperTrade(input)
            : await s.logTrade(input);
          if (ok) setLogOpen(false);
        }} />
      <CloseTradeModal trade={closeTarget} onClose={() => setCloseTarget(null)}
        onSubmit={async (id, input) => {
          const target = s.savedTrades.find((t) => t.id === id);
          const ok = target?.paper
            ? await s.closePaperTrade(id, input)
            : await s.closeTrade(id, input);
          if (ok) setCloseTarget(null);
        }} />
    </section>
  );
}

// v1.8.0 CSV export with selectable columns. The picked set persists
// (od.csvColumns.v1) so the next export starts from the same shape.
function CsvExportModal({ open, onClose, trades, onExported }: {
  open: boolean;
  onClose: () => void;
  trades: JournalTrade[];
  onExported: () => void;
}) {
  const [ids, setIds] = useState<string[]>(loadCsvColumnIds);

  function toggle(id: string) {
    setIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <Modal open={open} onClose={onClose} testid="csv-export-modal" maxWidth="max-w-md">
      <h2 className="text-lg font-semibold">Export Position Log CSV</h2>
      <p className="mt-1 text-sm text-content-3">
        Pick the columns to include — the selection is remembered.
      </p>
      <div className="mt-3 grid max-h-72 grid-cols-2 gap-x-3 overflow-y-auto">
        {CSV_COLUMNS.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm text-content-2 hover:text-content-1">
            <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)}
              data-csv-column={c.id}
              className="accent-[rgb(var(--od-accent-primary))]" />
            {c.label}
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        <button className="text-content-3 underline underline-offset-2 hover:text-accent-primary-text"
          onClick={() => setIds(CSV_COLUMNS.map((c) => c.id))}>
          Select all
        </button>
        <button className="text-content-3 underline underline-offset-2 hover:text-accent-primary-text"
          onClick={() => setIds(defaultCsvColumnIds())}>
          Reset to defaults
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-content-3">
          {trades.length} {trades.length === 1 ? "trade" : "trades"} · {ids.length} {ids.length === 1 ? "column" : "columns"}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={ids.length === 0} data-testid="csv-download"
            onClick={() => { saveCsvColumnIds(ids); downloadCsv(trades, ids); onExported(); }}>
            Download CSV
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// v1.5.1 Clear All confirmation.
function ClearAllModal({ open, onClose, onConfirm }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} testid="clear-all-modal" maxWidth="max-w-sm">
      <h3 className="mb-2 text-lg font-semibold">Clear all positions?</h3>
      <p className="mb-4 text-sm text-content-2">
        This moves every real position to Trash. You can restore them any time
        from the Trash tab. Sandbox positions are left untouched.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" data-testid="clear-all-confirm" onClick={onConfirm}>
          Move to Trash
        </Button>
      </div>
    </Modal>
  );
}

// v1.5.1 Trash tab: deleted positions with restore / permanent-delete.
function relativeDeleted(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
    return hours <= 0 ? "just now" : `${hours}h ago`;
  }
  return `${days}d ago`;
}

function TrashView({ trades, onRestore, onDelete, onRestoreAll, onPurge }: {
  trades: JournalTrade[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onRestoreAll: () => void;
  onPurge: () => void;
}) {
  const [confirmPurge, setConfirmPurge] = useState(false);
  if (trades.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-dark-600 p-10 text-center text-content-3"
        data-testid="trash-empty">
        Trash is empty. Positions you clear from the log land here, recoverable
        until you delete them permanently.
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="trash-view">
      <div className="flex items-center justify-between">
        <p className="text-sm text-content-3">
          {trades.length} position{trades.length === 1 ? "" : "s"} in Trash.
          Restore to bring them back, or delete permanently to free the space.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="xs" data-testid="restore-all"
            onClick={onRestoreAll}>Restore All</Button>
          {confirmPurge ? (
            <Button variant="destructive" size="xs" data-testid="purge-confirm"
              onClick={() => { onPurge(); setConfirmPurge(false); }}>
              Confirm — delete {trades.length} forever
            </Button>
          ) : (
            <Button variant="ghost" size="xs" data-testid="purge-trash"
              onClick={() => { setConfirmPurge(true); setTimeout(() => setConfirmPurge(false), 4000); }}>
              Clear Trash Permanently
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {trades.map((t) => (
          <Card key={t.id} className="opacity-90" data-testid="trash-row">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-16 font-mono font-semibold">{t.symbol}</span>
              <span className="capitalize">{strategyLabel(t.strategy)}</span>
              <Badge variant={t.status === "open" ? "green" : "neutral"}>{t.status}</Badge>
              {t.paper && <Badge variant="violet">sandbox</Badge>}
              <span className="font-mono text-sm text-content-2">
                ${t.entryPrice.toFixed(2)} × {t.entryQty}
              </span>
              <span className="text-xs text-content-3" title={t.deletedAt ?? ""}>
                Deleted {relativeDeleted(t.deletedAt)}
              </span>
              <span className="ml-auto flex gap-2">
                <Button variant="secondary" size="xs" data-testid="trash-restore"
                  onClick={() => onRestore(t.id)}>Restore</Button>
                <Button variant="destructive" size="xs" data-testid="trash-delete"
                  onClick={() => onDelete(t.id)}>Delete Permanently</Button>
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NotesEditor({ trade, onSave }: {
  trade: JournalTrade;
  onSave: (notes: string, tags: string[]) => void;
}) {
  const [notes, setNotes] = useState(trade.notes);
  const [tags, setTags] = useState(trade.tags.join(", "));
  const dirty = notes !== trade.notes || tags !== trade.tags.join(", ");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-56 flex-1">
        <span className="text-[11px] uppercase tracking-wide text-content-3">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="mt-0.5 w-full rounded-md border border-white/15 bg-dark-700 px-2 py-1.5 text-sm text-content-1 focus:border-accent-primary focus:outline-none" />
      </label>
      <FormInput label="Tags (comma-sep)" value={tags}
        onChange={(e) => setTags(e.target.value)} className="w-52" />
      {dirty && (
        <Button size="xs" onClick={() => onSave(notes, tags.split(",").map((t) => t.trim()).filter(Boolean))}>
          Save
        </Button>
      )}
    </div>
  );
}

function LogTradeModal({ open, onClose, onSubmit }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: NewTradeInput) => void;
}) {
  const [form, setForm] = useState({
    symbol: "", strategy: "covered_call", side: "debit" as TradeSide,
    entryPrice: "", entryQty: "1", multiplier: "100",
    maxLossTarget: "", maxProfitTarget: "", notes: "", tags: "",
    paper: false, expiration: "", assignmentStrike: "",
  });
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  // paper credit trades need a risk basis or the simulator can't reserve capital
  const paperCreditOk = !form.paper || form.side !== "credit"
    || Number(form.assignmentStrike) > 0 || Number(form.maxLossTarget) > 0;
  const valid = form.symbol.trim() !== "" && Number(form.entryPrice) > 0
    && Number.isInteger(Number(form.entryQty)) && Number(form.entryQty) > 0
    && paperCreditOk;

  return (
    <Modal open={open} onClose={onClose} testid="log-trade-modal">
      <h2 className="mb-3 text-lg font-semibold">Log a trade</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormInput label="Symbol" value={form.symbol} placeholder="AAPL"
          onChange={(e) => patch({ symbol: e.target.value.toUpperCase() })}
          className="font-mono uppercase" data-testid="log-symbol" />
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-content-3">Strategy</span>
          <input list="od-strategies" value={form.strategy}
            onChange={(e) => patch({ strategy: e.target.value })}
            className="mt-1 block w-full rounded-md border border-white/15 bg-dark-700 px-3 py-2.5 text-sm text-content-1 focus:border-accent-primary focus:outline-none" />
          <datalist id="od-strategies">
            {ALL_STRATEGY_TYPES.map((st) => <option key={st} value={st} />)}
          </datalist>
        </label>
        <FormSelect label="Side" value={form.side}
          hint="Credit positions profit when the closing price falls"
          onChange={(e) => patch({ side: e.target.value as TradeSide })}>
          <option value="debit">Debit (paid)</option>
          <option value="credit">Credit (collected)</option>
        </FormSelect>
        <FormInput label="Entry price" type="number" step="0.01" value={form.entryPrice}
          placeholder="2.30" hint="Per spread/contract as your broker quotes it"
          onChange={(e) => patch({ entryPrice: e.target.value })} data-testid="log-price" />
        <FormInput label="Qty" type="number" step="1" value={form.entryQty}
          onChange={(e) => patch({ entryQty: e.target.value })} />
        <FormSelect label="Unit" value={form.multiplier}
          onChange={(e) => patch({ multiplier: e.target.value })}>
          <option value="100">Options (×100)</option>
          <option value="1">Shares (×1)</option>
        </FormSelect>
        <FormInput label="Max profit target $" type="number" value={form.maxProfitTarget}
          onChange={(e) => patch({ maxProfitTarget: e.target.value })} />
        <FormInput label="Max loss target $" type="number" value={form.maxLossTarget}
          onChange={(e) => patch({ maxLossTarget: e.target.value })} />
        <FormInput label="Tags (comma-sep)" value={form.tags}
          onChange={(e) => patch({ tags: e.target.value })} />
        <FormInput label="Expiration" type="date" value={form.expiration}
          hint="Enables automatic expiry/assignment processing (sandbox trades)"
          onChange={(e) => patch({ expiration: e.target.value })} />
        <FormInput label="Assignment strike" type="number" step="0.5" value={form.assignmentStrike}
          hint="Short strike for CSP/covered-call assignment logic"
          error={paperCreditOk ? undefined : "needed for paper credit trades"}
          onChange={(e) => patch({ assignmentStrike: e.target.value })} />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-content-2"
        title="Simulated position against your Sandbox budget — capital is reserved, P&L tracked, no real money">
        <input type="checkbox" checked={form.paper} data-testid="paper-toggle"
          onChange={(e) => patch({ paper: e.target.checked })}
          className="accent-accent-primary" />
        Sandbox trade (simulated budget)
      </label>
      <label className="mt-3 block">
        <span className="text-xs uppercase tracking-wide text-content-3">Notes</span>
        <textarea value={form.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2}
          className="mt-1 w-full rounded-md border border-white/15 bg-dark-700 px-3 py-2 text-sm text-content-1 focus:border-accent-primary focus:outline-none" />
      </label>
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" disabled={!valid} data-testid="log-submit"
          onClick={() => onSubmit({
            symbol: form.symbol,
            strategy: form.strategy.trim() || "unknown",
            side: form.side,
            entryPrice: Number(form.entryPrice),
            entryQty: Number(form.entryQty),
            multiplier: Number(form.multiplier) === 1 ? 1 : 100,
            maxLossTarget: form.maxLossTarget === "" ? null : Number(form.maxLossTarget),
            maxProfitTarget: form.maxProfitTarget === "" ? null : Number(form.maxProfitTarget),
            notes: form.notes,
            tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
            paper: form.paper,
            expiration: form.expiration === "" ? null : form.expiration,
            assignmentStrike: form.assignmentStrike === "" ? null : Number(form.assignmentStrike),
          })}>
          Log trade
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function CloseTradeModal({ trade, onClose, onSubmit }: {
  trade: JournalTrade | null;
  onClose: () => void;
  onSubmit: (id: string, input: CloseTradeInput) => void;
}) {
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate, setExitDate] = useState("");
  const [mae, setMae] = useState("");
  const [mfe, setMfe] = useState("");

  useEffect(() => {
    setExitPrice("");
    setExitDate(new Date().toISOString().slice(0, 10));
    setMae(trade?.mae?.toString() ?? "");
    setMfe(trade?.mfe?.toString() ?? "");
  }, [trade?.id]);

  if (!trade) return null;
  const valid = exitPrice !== "" && Number(exitPrice) >= 0;

  return (
    <Modal open onClose={onClose} testid="close-trade-modal" maxWidth="max-w-md">
      <h2 className="mb-1 text-lg font-semibold">Close {trade.symbol} {strategyLabel(trade.strategy)}</h2>
      <p className="mb-3 text-xs text-content-3">
        Entered {trade.side} ${trade.entryPrice.toFixed(2)} × {trade.entryQty}{" "}
        ({trade.side === "credit" ? "premium collected" : "debit paid"}{" "}
        <b className="text-content-2">{money(premiumTotal(trade))}</b>).
        P&L is computed server-side from your exit price.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FormInput label="Exit price" type="number" step="0.01" value={exitPrice}
          hint="Per spread/contract, as quoted at close"
          onChange={(e) => setExitPrice(e.target.value)} data-testid="close-price" />
        <FormInput label="Exit date" type="date" value={exitDate}
          onChange={(e) => setExitDate(e.target.value)} />
        <FormInput label="MAE $ (optional)" type="number" value={mae}
          hint="Max adverse excursion — worst unrealized P&L you saw"
          onChange={(e) => setMae(e.target.value)} />
        <FormInput label="MFE $ (optional)" type="number" value={mfe}
          hint="Max favorable excursion — best unrealized P&L you saw"
          onChange={(e) => setMfe(e.target.value)} />
      </div>
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" disabled={!valid} data-testid="close-submit"
          onClick={() => onSubmit(trade.id, {
            exitPrice: Number(exitPrice),
            exitDate,
            mae: mae === "" ? null : Number(mae),
            mfe: mfe === "" ? null : Number(mfe),
          })}>
          Close position
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
