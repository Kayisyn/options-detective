import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { money, pct, strategyLabel } from "../lib/format";
import { ALL_STRATEGY_TYPES } from "../lib/copy";
import { journalStats } from "../lib/journalStats";
import { confirmationText, downloadCsv } from "../lib/journalCsv";
import Button from "./ui/Button";
import { Badge, Card, MetricBox } from "./ui/Card";
import { FormInput, FormSelect } from "./ui/Input";
import Modal from "./ui/Modal";
import type { CloseTradeInput, JournalTrade, NewTradeInput, TradeSide } from "../types";

// Journal view, v1.1 Phase A: trade logging, live marks, close workflow
// with realized P&L, tags, filters/sorts, analytics, CSV export.

type StatusFilter = "all" | "open" | "closed";
type JournalSort = "newest" | "oldest" | "pnlDesc" | "pnlAsc" | "symbol";

function displayPnl(t: JournalTrade): { value: number | null; realized: boolean } {
  if (t.status === "closed") return { value: t.actualPnl, realized: true };
  return { value: t.lastMark?.unrealizedPnl ?? null, realized: false };
}

function pnlClass(v: number | null): string {
  if (v === null) return "text-content-3";
  return v > 0 ? "text-accent-green" : v < 0 ? "text-accent-red" : "text-content-2";
}

function applyJournalFilters(
  trades: JournalTrade[], status: StatusFilter, symbol: string, sort: JournalSort,
): JournalTrade[] {
  let list = trades;
  if (status !== "all") list = list.filter((t) => t.status === status);
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
  const s = useStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [sort, setSort] = useState<JournalSort>("newest");
  const [logOpen, setLogOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<JournalTrade | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [marksBusy, setMarksBusy] = useState(false);

  useEffect(() => {
    s.loadJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const stats = useMemo(() => journalStats(s.savedTrades), [s.savedTrades]);
  const visible = applyJournalFilters(s.savedTrades, statusFilter, symbolFilter, sort);

  async function onRefreshMarks() {
    setMarksBusy(true);
    await s.refreshMarks();
    setMarksBusy(false);
  }

  return (
    <section className="space-y-4" data-testid="journal">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Trade journal</h2>
          <p className="text-sm text-content-3">
            Marks are Black-Scholes theoretical values at the latest quote;
            MAE/MFE are watermarks of marks observed here, not tick data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setLogOpen(true)} data-testid="log-trade-button">
            Log trade
          </Button>
          <Button variant="secondary" size="sm" onClick={onRefreshMarks}
            disabled={marksBusy || stats.open === 0} data-testid="refresh-marks">
            {marksBusy ? "Refreshing…" : "Refresh marks"}
          </Button>
          <Button variant="ghost" size="sm" disabled={s.savedTrades.length === 0}
            onClick={() => downloadCsv(s.savedTrades)} data-testid="export-csv">
            Export CSV
          </Button>
        </div>
      </div>

      {s.savedTrades.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" data-testid="journal-stats">
            <MetricBox label="Trades" value={String(stats.total)} />
            <MetricBox label="Open" value={String(stats.open)} />
            <MetricBox label="Win rate" value={stats.winRate === null ? "—" : pct(stats.winRate)}
              hint="Winners among closed trades" />
            <MetricBox label="Realized P&L" value={money(stats.totalPnl)}
              highlight={stats.totalPnl > 0 ? "green" : stats.totalPnl < 0 ? "red" : "none"} />
            <MetricBox label="Avg win" value={stats.avgWin === null ? "—" : money(stats.avgWin)} highlight="green" />
            <MetricBox label="Avg loss" value={stats.avgLoss === null ? "—" : money(stats.avgLoss)} highlight="red" />
            <MetricBox label="Best" value={stats.largestWin === null ? "—" : money(stats.largestWin)} highlight="green" />
            <MetricBox label="Worst" value={stats.largestLoss === null ? "—" : money(stats.largestLoss)} highlight="red" />
          </div>
          {(stats.byStrategy.length > 0 || stats.bySymbol.length > 0) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-content-3">
              {stats.byStrategy.length > 0 && (
                <span>
                  P&L by strategy:{" "}
                  {stats.byStrategy.slice(0, 4).map((b) => (
                    <span key={b.key} className="mr-2 capitalize">
                      {strategyLabel(b.key)} <b className={pnlClass(b.pnl)}>{money(b.pnl)}</b>
                    </span>
                  ))}
                </span>
              )}
              {stats.bySymbol.length > 0 && (
                <span>
                  By symbol:{" "}
                  {stats.bySymbol.slice(0, 4).map((b) => (
                    <span key={b.key} className="mr-2 font-mono">
                      {b.key} <b className={pnlClass(b.pnl)}>{money(b.pnl)}</b>
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <FormSelect label="Status" value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
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
          No trades yet. <b>Log trade</b> to enter one manually, or save a
          candidate from the Recommender.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => {
            const pnl = displayPnl(t);
            const expanded = expandedId === t.id;
            return (
              <Card key={t.id} interactive data-testid="journal-row"
                onClick={() => setExpandedId(expanded ? null : t.id)}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-16 font-mono font-semibold">{t.symbol}</span>
                  <span className="capitalize">{strategyLabel(t.strategy)}</span>
                  <Badge variant={t.side === "debit" ? "blue" : "orange"}>{t.side}</Badge>
                  <Badge variant={t.status === "open" ? "green" : "neutral"}>{t.status}</Badge>
                  <span className="font-mono text-sm text-content-2">
                    ${t.entryPrice.toFixed(2)} × {t.entryQty}
                  </span>
                  <span className="text-xs text-content-3">{t.entryDate.slice(0, 10)}</span>
                  {t.tags.map((tag) => <Badge key={tag} variant="neutral">{tag}</Badge>)}
                  <span className={`ml-auto font-mono font-bold tabular-nums ${pnlClass(pnl.value)}`}
                    title={pnl.realized ? "Realized P&L" : "Unrealized P&L from the latest mark"}>
                    {pnl.value === null ? "—" : money(pnl.value)}
                    {!pnl.realized && pnl.value !== null && (
                      <span className="ml-1 text-[10px] font-normal text-content-3">unrl</span>
                    )}
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
                      <Button variant="destructive" size="xs" onClick={() => s.removeFromJournal(t.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <LogTradeModal open={logOpen} onClose={() => setLogOpen(false)}
        onSubmit={async (input) => {
          const ok = await s.logTrade(input);
          if (ok) setLogOpen(false);
        }} />
      <CloseTradeModal trade={closeTarget} onClose={() => setCloseTarget(null)}
        onSubmit={async (id, input) => {
          const ok = await s.closeTrade(id, input);
          if (ok) setCloseTarget(null);
        }} />
    </section>
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
          className="mt-0.5 w-full rounded-sm border border-dark-600 bg-dark-700 px-2 py-1.5 text-sm text-content-1 focus:border-blue-500 focus:outline-none" />
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
  });
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  const valid = form.symbol.trim() !== "" && Number(form.entryPrice) > 0
    && Number.isInteger(Number(form.entryQty)) && Number(form.entryQty) > 0;

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
            className="mt-1 block w-full rounded-md border-2 border-dark-600 bg-dark-700 px-3 py-2.5 text-sm text-content-1 focus:border-blue-500 focus:outline-none" />
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
      </div>
      <label className="mt-3 block">
        <span className="text-xs uppercase tracking-wide text-content-3">Notes</span>
        <textarea value={form.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2}
          className="mt-1 w-full rounded-md border-2 border-dark-600 bg-dark-700 px-3 py-2 text-sm text-content-1 focus:border-blue-500 focus:outline-none" />
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
          })}>
          Log trade
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

function CloseTradeModal({ trade, onClose, onSubmit }: {
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
        Entered {trade.side} ${trade.entryPrice.toFixed(2)} × {trade.entryQty}.
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
