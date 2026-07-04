interface RecommenderProps {
  onOpenCandidate: (candidateId: string) => void;
}

// View 3: top candidates ranked by composite score with trade-off breakdown
// and clipboard export. Phase 6, powered by POST /recommend (Phase 5).
export default function Recommender(_props: RecommenderProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Recommender</h2>
        <p className="text-sm text-slate-400">
          Top candidates ranked by composite score (POP 0.30 · risk/reward 0.20
          · theta 0.20 · capital efficiency 0.15 · liquidity 0.15), with
          trade-offs explained.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
        Ranked candidates and broker-format export land in Phase 6, powered by
        POST /recommend (Phase 5).
      </div>
    </section>
  );
}
