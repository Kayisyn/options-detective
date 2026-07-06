import { useEffect, useState } from "react";
import { useStore } from "../store";
import { money, pct, shortDate, strategyLabel } from "../lib/format";
import { DEFAULT_SORT, sortCandidates, type SortSpec } from "../lib/candidateQuery";
import { DEFAULT_WEIGHTS, weightsEqual } from "../lib/scoring";
import CandidateCard from "./shared/CandidateCard";
import SortControl from "./shared/SortControl";
import { RecommenderSkeleton } from "./shared/Skeleton";
import { useMode } from "../contexts/ModeContext";

// View 3: top candidates ranked by composite score, trade-off facts,
// broker-format export to clipboard.
export default function Recommender() {
  const s = useStore();
  const { expertMode } = useMode();
  const rec = s.recommendation;
  // local re-ordering of the top five (v1.1 §1); rank badges keep the
  // composite rank so the original ranking stays visible
  const [sort, setSort] = useState<SortSpec>(DEFAULT_SORT);

  useEffect(() => {
    s.loadJournal(); // so Save buttons reflect what's already journaled
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  if (s.status === "recommending") {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Top candidates</h2>
          <p className="text-sm text-content-3">Ranking…</p>
        </div>
        <RecommenderSkeleton />
      </section>
    );
  }
  if (!rec) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
        Run a screen in the Detector, then compare candidates here.
      </div>
    );
  }

  // when the user has custom weights, the store re-scored the candidates
  // before ranking — show the weights that actually produced this order
  const customWeights = !weightsEqual(s.weights, DEFAULT_WEIGHTS);
  const weightLine = Object.entries(customWeights ? s.weights : rec.weights)
    .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
    .join(" · ") + (customWeights ? " (custom)" : "");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Top candidates</h2>
          {expertMode ? (
            <p className="text-sm text-content-3" title="How the composite score is weighted">
              Ranked by composite score: {weightLine}
            </p>
          ) : (
            <p className="text-sm text-content-3">
              Best first — each card says what the strategy is good for.
            </p>
          )}
        </div>
        <SortControl sort={sort} onChange={setSort} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {sortCandidates(rec.ranked, sort).map((c) => (
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
