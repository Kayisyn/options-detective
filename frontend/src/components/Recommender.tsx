import { useEffect } from "react";
import { useStore } from "../store";
import { money, pct, shortDate, strategyLabel } from "../lib/format";
import CandidateCard from "./shared/CandidateCard";

// View 3: top candidates ranked by composite score, trade-off facts,
// broker-format export to clipboard.
export default function Recommender() {
  const s = useStore();
  const rec = s.recommendation;

  useEffect(() => {
    s.loadJournal(); // so Save buttons reflect what's already journaled
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  if (s.status === "recommending") {
    return <div className="rounded-md bg-slate-900 px-4 py-3 text-sm text-slate-400">Ranking candidates…</div>;
  }
  if (!rec) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
        Run a screen in the Detector, then compare candidates here.
      </div>
    );
  }

  const weightLine = Object.entries(rec.weights)
    .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
    .join(" · ");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Top candidates</h2>
        <p className="text-sm text-slate-500" title="How the composite score is weighted">
          Ranked by composite score: {weightLine}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {rec.ranked.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            exported={s.exportedId === c.id}
            saved={s.savedTrades.some((t) => t.candidate.id === c.id)}
            onOpen={() => s.openCandidate(c)}
            onExport={() => s.exportTrade(c.id, c.exportText)}
            onSave={() => s.saveToJournal(c, c.exportText)}
          />
        ))}
      </div>

      {rec.tradeoffs.length > 0 && (
        <div className="rounded-lg border border-slate-800 p-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Trade-offs
          </h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-300">
            {rec.tradeoffs.flatMap((t) => t.facts).map((fact) => (
              <li key={fact} className="flex gap-2">
                <span className="text-sky-500">›</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer">How to read this</summary>
        <p className="mt-1 max-w-2xl">
          Every number comes from the deterministic math engine — POP {pct(0.62)} means the
          lognormal model gives 62 profitable paths out of 100, not a promise. Max loss is as
          important as max profit: it is the number your position size is built on. Export
          copies a broker-ready order ticket to your clipboard; paste it into your broker and
          verify prices before sending.
        </p>
      </details>

      <div className="text-xs text-slate-600">
        {rec.ranked[0] && (
          <>Top pick: {strategyLabel(rec.ranked[0].strategyType)} expiring {shortDate(rec.ranked[0].expiration)},
          needs {money(rec.ranked[0].sizing.capitalRequired)}.</>
        )}
      </div>
    </section>
  );
}
