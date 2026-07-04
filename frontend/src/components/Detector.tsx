interface DetectorProps {
  onSelectCandidate: (candidateId: string) => void;
}

// View 1: symbol selector + ranked candidate table (Phase 6),
// powered by POST /detect (Phase 3).
export default function Detector(_props: DetectorProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Detector</h2>
        <p className="text-sm text-slate-400">
          Pick a symbol and screen every expiration and strategy for ranked
          opportunities.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
        Symbol selector and ranked candidate table land in Phase 6, powered by
        POST /detect (Phase 3).
      </div>
    </section>
  );
}
