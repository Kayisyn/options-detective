import type { Greeks } from "../../types";

// Plain-language explainers surface as tooltips now and feed the Phase 8
// in-app intelligence layer later.
const EXPLAINERS: Record<keyof Greeks, string> = {
  delta: "P&L per $1 move in the underlying",
  gamma: "How fast delta changes per $1 move",
  theta: "P&L per calendar day of time decay",
  vega: "P&L per 1 point change in implied volatility",
  rho: "P&L per 1 point change in interest rates",
};

export default function GreeksSummary({ greeks }: { greeks: Greeks }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {(Object.keys(EXPLAINERS) as Array<keyof Greeks>).map((key) => (
        <div
          key={key}
          className="rounded-md bg-slate-900 p-3"
          title={EXPLAINERS[key]}
        >
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            {key}
          </dt>
          <dd className="text-lg font-medium tabular-nums">
            {greeks[key].toFixed(4)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
