import { useEffect, useState } from "react";
import { useStore } from "../store";
import { money, pct, shortDate, strategyLabel } from "../lib/format";
import { DEFAULT_SORT, sortCandidates, type SortSpec } from "../lib/candidateQuery";
import { DEFAULT_WEIGHTS, weightsEqual } from "../lib/scoring";
import CandidateCard from "./shared/CandidateCard";
import SortControl from "./shared/SortControl";
import { RecommenderSkeleton } from "./shared/Skeleton";
import { useMode } from "../contexts/ModeContext";

// Optimal Strategies view (renamed from Recommender, v1.4.0): the top
// strategy under the active sort is featured full-width with the violet
// glow; the rest rank below. Trade-off facts and broker export unchanged.
export default function Recommender() {
  const s = useStore();
  const { expertMode } = useMode();
  const rec = s.recommendation;
  // local re-ordering of the top five (v1.1 §1); rank badges keep the
  // composite rank so the original ranking stays visible
  const [sort, setSort] = useState<SortSpec>(DEFAULT_SORT);

  useEffect(() => {
    s.loadJournal(); // so Save buttons reflect what's already logged
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  if (s.status === "recommending") {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Optimal strategies</h2>
          <p className="text-sm text-content-3">Ranking…</p>
        </div>
        <RecommenderSkeleton />
      </section>
    );
  }
  if (!rec) {
    return (
      <div className="rounded-lg border border-dashed border-dark-600 p-10 text-center text-content-3">
        Run a screen in the Screener, then compare the optimal strategies here.
      </div>
    );
  }

  // when the user has custom weights, the store re-scored the candidates
  // before ranking — show the weights that actually produced this order
  const customWeights = !weightsEqual(s.weights, DEFAULT_WEIGHTS);
  const weightLine = Object.entries(customWeights ? s.weights : rec.weights)
    .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
    .join(" · ") + (customWeights ? " (custom)" : "");

  const sorted = sortCandidates(rec.ranked, sort);
  const [top, ...rest] = sorted;

  const cardProps = (c: typeof sorted[number]) => ({
    candidate: c,
    exported: s.exportedId === c.id,
    saved: s.savedTrades.some((t) => t.candidate?.id === c.id),
    onOpen: () => s.openCandidate(c),
    onExport: () => s.exportTrade(c.id, c.exportText),
    onSave: () => s.saveToJournal(c, { exportText: c.exportText }),
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Optimal strategies</h2>
          {expertMode ? (
            <p className="text-sm text-content-3" title="How the composite score is weighted">
              Ranked by composite score: {weightLine}
            </p>
          ) : (
            <p className="text-sm text-content-3">
              Best first. Each card says what the strategy is good for.
            </p>
          )}
        </div>
        <SortControl sort={sort} onChange={setSort} />
      </div>

      {top && (
        <div data-testid="top-strategy">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-accent-primary-text">
            Top strategy
          </div>
          <CandidateCard featured {...cardProps(top)} />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {rest.map((c) => (
          <CandidateCard key={c.id} {...cardProps(c)} />
        ))}
      </div>

      {rec.tradeoffs.length > 0 && (
        <div className="card-glass p-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-content-3">
            Trade-offs
          </h3>
          <ul className="mt-2 space-y-2 text-sm text-content-2">
            {rec.tradeoffs.flatMap((t) => t.facts).map((fact) => (
              <li key={fact} className="flex gap-2">
                <span className="text-accent-primary-text">›</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-xs text-content-3">
        <summary className="cursor-pointer">How to read this</summary>
        <p className="mt-1 max-w-2xl">
          Every number comes from the deterministic math engine — POP {pct(0.62)} means the
          lognormal model gives 62 profitable paths out of 100, not a promise. Max loss is as
          important as max profit: it is the number your position size is built on. Export
          copies a broker-ready order ticket to your clipboard; paste it into your broker and
          verify prices before sending.
        </p>
      </details>

      <div className="text-xs text-content-3">
        {sorted[0] && (
          <>Top pick: {strategyLabel(sorted[0].strategyType)} expiring {shortDate(sorted[0].expiration)},
          needs {money(sorted[0].sizing.capitalRequired)}.</>
        )}
      </div>
    </section>
  );
}
