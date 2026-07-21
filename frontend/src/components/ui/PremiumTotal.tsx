import { money } from "../../lib/format";
import { positionBasis } from "../../lib/journalStats";
import type { JournalTrade } from "../../types";

// v1.9.2: the total dollar premium at entry — the long-missing card line.
// The form takes a per-unit price as brokers quote it; the position's cash
// impact is price × qty × multiplier (positionBasis). Credits collect it,
// debits pay it.
export function premiumTotal(t: JournalTrade): number {
  return positionBasis(t);
}

export default function PremiumTotal({ trade }: { trade: JournalTrade }) {
  const credit = trade.side === "credit";
  return (
    <span
      className="font-mono text-sm tabular-nums"
      data-testid="premium-total"
      title={`${credit ? "Premium collected" : "Debit paid"} at entry — $${trade.entryPrice.toFixed(2)} × ${trade.entryQty} × ${trade.multiplier}`}
    >
      <span className="text-content-3">{credit ? "collected " : "paid "}</span>
      <b className={credit ? "text-accent-green" : "text-content-1"}>
        {money(premiumTotal(trade))}
      </b>
    </span>
  );
}
