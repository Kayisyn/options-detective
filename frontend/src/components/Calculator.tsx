interface CalculatorProps {
  onRecommend: () => void;
}

// View 2: payoff diagram (left), greeks + leg breakdown + breakevens (right),
// adjustment controls (bottom). Phase 6, powered by POST /calculate (Phase 4).
export default function Calculator({ onRecommend }: CalculatorProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Calculator</h2>
        <p className="text-sm text-slate-400">
          Greeks, payoff diagram and probabilities for the selected candidate.
          Adjust strikes or expiry and recalculate in real time.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
        Payoff chart, greeks summary and leg breakdown land in Phase 6, powered
        by POST /calculate (Phase 4).
      </div>
      <button
        onClick={onRecommend}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500"
      >
        Recommend →
      </button>
    </section>
  );
}
