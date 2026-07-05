import { useEffect } from "react";
import { useStore } from "../store";
import { money, pct, shortDate, strategyLabel } from "../lib/format";
import Button from "./ui/Button";

// View 4 (v1.x): saved trades. Snapshot of the candidate at save time —
// numbers here are historical, not live.
export default function Journal() {
  const s = useStore();

  useEffect(() => {
    s.loadJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  if (s.savedTrades.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
        No saved trades yet. Save one from the Recommender to start your journal.
      </div>
    );
  }

  return (
    <section className="space-y-3" data-testid="journal">
      <div>
        <h2 className="text-lg font-medium">Trade journal</h2>
        <p className="text-sm text-slate-500">
          Snapshots from the moment you saved them — quotes and probabilities
          are not refreshed here.
        </p>
      </div>
      {s.savedTrades.map((t) => (
        <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium capitalize">
              {strategyLabel(t.candidate.strategyType)}
            </span>
            <span className="font-mono text-sm">{t.candidate.symbol}</span>
            <span className="text-sm text-slate-500">
              expires {shortDate(t.candidate.expiration)}
            </span>
            <span className="text-sm text-slate-500">
              POP {pct(t.candidate.probability.pop)} · max loss {money(t.candidate.payoff.maxLoss)}
            </span>
            <span className="ml-auto text-xs text-slate-600">
              saved {new Date(t.savedAt).toLocaleString()}
            </span>
          </div>
          {t.exportText && (
            <div className="mt-2 rounded bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300">
              {t.exportText}
            </div>
          )}
          {t.note && <p className="mt-2 text-sm text-slate-400">{t.note}</p>}
          <div className="mt-3 flex gap-2">
            {t.exportText && (
              <Button size="xs" onClick={() => s.exportTrade(t.id, t.exportText!)}
                className={s.exportedId === t.id ? "bg-accent-green hover:bg-accent-green" : undefined}>
                {s.exportedId === t.id ? "Copied ✓" : "Copy order"}
              </Button>
            )}
            <Button variant="destructive" size="xs" onClick={() => s.removeFromJournal(t.id)}>
              Delete
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
