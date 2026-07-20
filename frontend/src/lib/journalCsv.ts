// CSV + confirmation-text exports for the journal (v1.1 §3).
import type { JournalTrade } from "../types";

const COLUMNS: Array<[string, (t: JournalTrade) => string | number | null]> = [
  ["id", (t) => t.id],
  ["status", (t) => t.status],
  ["symbol", (t) => t.symbol],
  ["strategy", (t) => t.strategy],
  ["side", (t) => t.side],
  ["entry_date", (t) => t.entryDate],
  ["entry_price", (t) => t.entryPrice],
  ["entry_qty", (t) => t.entryQty],
  ["multiplier", (t) => t.multiplier],
  ["exit_date", (t) => t.exitDate],
  ["exit_price", (t) => t.exitPrice],
  ["actual_pnl", (t) => t.actualPnl],
  // v1.7.0 CAD columns: realized converts at the stamped close/entry rate
  // (blank when the trade predates rate stamping — no invented history)
  ["fx_rate_used", (t) => t.exchangeRateAtClose ?? t.exchangeRateUsed ?? null],
  ["actual_pnl_cad", (t) => {
    const rate = t.exchangeRateAtClose ?? t.exchangeRateUsed;
    return t.actualPnl != null && rate != null
      ? Math.round(t.actualPnl * rate * 100) / 100 : null;
  }],
  ["unrealized_pnl", (t) => t.lastMark?.unrealizedPnl ?? null],
  ["max_loss_target", (t) => t.maxLossTarget],
  ["max_profit_target", (t) => t.maxProfitTarget],
  ["mae", (t) => t.mae],
  ["mfe", (t) => t.mfe],
  ["tags", (t) => t.tags.join(";")],
  ["notes", (t) => t.notes],
];

function cell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function journalToCsv(trades: JournalTrade[]): string {
  const header = COLUMNS.map(([name]) => name).join(",");
  const rows = trades.map((t) => COLUMNS.map(([, f]) => cell(f(t))).join(","));
  return [header, ...rows].join("\r\n");
}

export function downloadCsv(trades: JournalTrade[]) {
  const blob = new Blob([journalToCsv(trades)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `option-obelisk-position-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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
