// CSV + confirmation-text exports for the journal (v1.1 §3).
// v1.8.0: columns are selectable — CSV_COLUMNS is the catalog (id, label,
// on-by-default), the chosen ids persist under od.csvColumns.v1, and
// journalToCsv takes the selection. Watchlist CSV export lives here too.
import type { EtfRecord, JournalTrade } from "../types";

export interface CsvColumn {
  id: string;
  label: string;
  onByDefault: boolean;
  value: (t: JournalTrade) => string | number | null;
}

// %gain mirrors lib/journalStats.pctReturn: signed P&L over the premium
// basis (realized when settled, marked when open)
function pctGain(t: JournalTrade): number | null {
  const basis = Math.abs(t.entryPrice) * t.entryQty * t.multiplier;
  if (!basis) return null;
  const pnl = t.status !== "open" ? t.actualPnl : t.lastMark?.unrealizedPnl ?? null;
  if (pnl === null) return null;
  return Math.round((pnl / basis) * 10000) / 100;
}

export const CSV_COLUMNS: CsvColumn[] = [
  { id: "id", label: "Trade id", onByDefault: false, value: (t) => t.id },
  { id: "status", label: "Status", onByDefault: true, value: (t) => t.status },
  { id: "symbol", label: "Symbol", onByDefault: true, value: (t) => t.symbol },
  { id: "strategy", label: "Strategy", onByDefault: true, value: (t) => t.strategy },
  { id: "side", label: "Side", onByDefault: true, value: (t) => t.side },
  { id: "entry_date", label: "Entry date", onByDefault: true, value: (t) => t.entryDate },
  { id: "entry_price", label: "Entry price", onByDefault: true, value: (t) => t.entryPrice },
  { id: "entry_qty", label: "Qty", onByDefault: true, value: (t) => t.entryQty },
  { id: "multiplier", label: "Multiplier", onByDefault: false, value: (t) => t.multiplier },
  { id: "exit_date", label: "Exit date", onByDefault: true, value: (t) => t.exitDate },
  { id: "exit_price", label: "Exit price", onByDefault: true, value: (t) => t.exitPrice },
  { id: "actual_pnl", label: "P&L ($)", onByDefault: true, value: (t) => t.actualPnl },
  { id: "pct_gain", label: "% gain", onByDefault: true, value: pctGain },
  // v1.7.0 CAD columns: realized converts at the stamped close/entry rate
  // (blank when the trade predates rate stamping — no invented history)
  { id: "fx_rate_used", label: "FX rate used", onByDefault: false,
    value: (t) => t.exchangeRateAtClose ?? t.exchangeRateUsed ?? null },
  { id: "actual_pnl_cad", label: "P&L (C$)", onByDefault: false, value: (t) => {
    const rate = t.exchangeRateAtClose ?? t.exchangeRateUsed;
    return t.actualPnl != null && rate != null
      ? Math.round(t.actualPnl * rate * 100) / 100 : null;
  } },
  { id: "unrealized_pnl", label: "Unrealized P&L", onByDefault: false,
    value: (t) => t.lastMark?.unrealizedPnl ?? null },
  { id: "max_loss_target", label: "Max-loss target", onByDefault: false, value: (t) => t.maxLossTarget },
  { id: "max_profit_target", label: "Max-profit target", onByDefault: false, value: (t) => t.maxProfitTarget },
  { id: "mae", label: "MAE", onByDefault: false, value: (t) => t.mae },
  { id: "mfe", label: "MFE", onByDefault: false, value: (t) => t.mfe },
  { id: "tags", label: "Tags", onByDefault: false, value: (t) => t.tags.join(";") },
  { id: "notes", label: "Notes", onByDefault: true, value: (t) => t.notes },
];

const CSV_COLUMNS_KEY = "od.csvColumns.v1";

export function defaultCsvColumnIds(): string[] {
  return CSV_COLUMNS.filter((c) => c.onByDefault).map((c) => c.id);
}

export function loadCsvColumnIds(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(CSV_COLUMNS_KEY) ?? "null");
    if (Array.isArray(stored)) {
      const known = stored.filter((id) => CSV_COLUMNS.some((c) => c.id === id));
      if (known.length > 0) return known;
    }
  } catch {
    // fall through to defaults
  }
  return defaultCsvColumnIds();
}

export function saveCsvColumnIds(ids: string[]) {
  try {
    localStorage.setItem(CSV_COLUMNS_KEY, JSON.stringify(ids));
  } catch {
    // private mode: selection lives for the session only
  }
}

function cell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function journalToCsv(trades: JournalTrade[], columnIds?: string[]): string {
  const wanted = columnIds ?? defaultCsvColumnIds();
  // catalog order, not click order — stable files whatever the user toggled
  const cols = CSV_COLUMNS.filter((c) => wanted.includes(c.id));
  const header = cols.map((c) => c.id).join(",");
  const rows = trades.map((t) => cols.map((c) => cell(c.value(t))).join(","));
  return [header, ...rows].join("\r\n");
}

function downloadBlob(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadCsv(trades: JournalTrade[], columnIds?: string[]) {
  downloadBlob(journalToCsv(trades, columnIds),
    `option-obelisk-position-log-${new Date().toISOString().slice(0, 10)}.csv`);
}

// v1.8.0 watchlist export: the metric set the Asset Screener actually holds
// (52w high/low aren't fetched — no invented columns)
const WATCHLIST_COLUMNS: Array<[string, (e: EtfRecord) => string | number | null]> = [
  ["ticker", (e) => e.ticker],
  ["name", (e) => e.name],
  ["price", (e) => e.price],
  ["iv_rank", (e) => e.ivRank],
  ["call_volume", (e) => e.callVolume],
  ["dividend_yield_pct", (e) => e.dividendYieldPct],
  ["perf_52w_pct", (e) => e.perf52wPct],
  ["atr_pct_20", (e) => e.atrPct20],
  ["theta_rank", (e) => e.thetaRank],
  ["expense_ratio_pct", (e) => e.expenseRatioPct],
  ["aum_billions", (e) => e.aumBillions],
];

export function watchlistToCsv(etfs: EtfRecord[]): string {
  const header = WATCHLIST_COLUMNS.map(([name]) => name).join(",");
  const rows = etfs.map((e) => WATCHLIST_COLUMNS.map(([, f]) => cell(f(e))).join(","));
  return [header, ...rows].join("\r\n");
}

export function downloadWatchlistCsv(etfs: EtfRecord[]) {
  downloadBlob(watchlistToCsv(etfs),
    `option-obelisk-watchlist-${new Date().toISOString().slice(0, 10)}.csv`);
}

// Email-ready trade confirmation text (roadmap "trade confirmation email").
export function confirmationText(t: JournalTrade): string {
  const lines = [
    `Trade confirmation — ${t.symbol} ${t.strategy.replace(/_/g, " ")}`,
    `Status: ${t.status}`,
    `Opened: ${t.entryDate.slice(0, 10)} — ${t.side} $${t.entryPrice.toFixed(2)} × ${t.entryQty} (multiplier ${t.multiplier})`,
  ];
  if (t.exportText) lines.push(`Order: ${t.exportText}`);
  if (t.status === "closed" && t.exitPrice !== null) {
    lines.push(`Closed: ${(t.exitDate ?? "").slice(0, 10)} at $${t.exitPrice.toFixed(2)}`);
    lines.push(`Realized P&L: $${(t.actualPnl ?? 0).toFixed(2)}`);
  } else if (t.lastMark) {
    lines.push(`Last mark: underlying $${t.lastMark.underlying.toFixed(2)}`
      + (t.lastMark.unrealizedPnl !== null ? `, unrealized $${t.lastMark.unrealizedPnl.toFixed(2)}` : "")
      + (t.lastMark.stale ? " (stale quotes)" : ""));
  }
  if (t.mae !== null || t.mfe !== null) {
    lines.push(`MAE ${t.mae ?? "—"} / MFE ${t.mfe ?? "—"} (from observed marks)`);
  }
  if (t.tags.length) lines.push(`Tags: ${t.tags.join(", ")}`);
  if (t.notes) lines.push(`Notes: ${t.notes}`);
  return lines.join("\n");
}
