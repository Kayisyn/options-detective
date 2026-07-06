import { classify, contributions, effectiveScore, type ScoreWeights } from "../../lib/scoring";
import { COMPONENT_META } from "../../lib/scoring";
import { pct } from "../../lib/format";
import Hint from "../ui/Hint";
import { cx } from "../../lib/cx";
import type { Candidate } from "../../types";

// Per-candidate score breakdown (v1.1 roadmap §2): a stacked bar of the
// five weighted contributions plus a hover explanation per component.
// All numbers are backend components re-mixed with the active weights.
export default function ScoreBreakdown({ candidate, weights }: {
  candidate: Candidate;
  weights: ScoreWeights;
}) {
  const parts = contributions(candidate, weights);
  if (parts.length === 0) return null;
  const total = effectiveScore(candidate, weights);

  return (
    <div data-testid="score-breakdown">
      <div className="mb-1 flex items-center justify-between text-xs text-content-3">
        <span>Score breakdown</span>
        <span className="font-mono font-semibold text-content-2">{total.toFixed(2)} / 10</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-dark-700">
        {parts.map((p) => (
          <div
            key={p.key}
            className={cx(COMPONENT_META[p.key].color, "h-full")}
            style={{ width: `${(p.points / 10) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map((p) => (
          <Hint
            key={p.key}
            text={`${COMPONENT_META[p.key].explain} This candidate is ${classify(p.component)} here (${pct(p.component)}), contributing ${p.points.toFixed(2)} of ${total.toFixed(2)} points.`}
          >
            <span className="inline-flex cursor-help items-center gap-1 text-[11px] text-content-3">
              <span className={cx("h-2 w-2 rounded-full", COMPONENT_META[p.key].color)} />
              {p.label}
              <span className="font-mono text-content-2">{p.points.toFixed(1)}</span>
            </span>
          </Hint>
        ))}
      </div>
    </div>
  );
}
