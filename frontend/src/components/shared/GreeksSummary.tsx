import { signed } from "../../lib/format";
import type { Greeks } from "../../types";

// Position greeks in dollar terms, each with a plain-language explainer.
const EXPLAINERS: Record<keyof Greeks, { unit: string; text: string }> = {
  delta: { unit: "$/1$ move", text: "Dollars gained or lost if the stock moves up $1" },
  gamma: { unit: "Δ/1$ move", text: "How much delta itself changes per $1 move — high gamma means your exposure shifts fast" },
  theta: { unit: "$/day", text: "Dollars gained (+) or lost (−) per calendar day from time passing" },
  vega: { unit: "$/IV pt", text: "Dollars gained or lost if implied volatility rises 1 point" },
  rho: { unit: "$/rate pt", text: "Dollars gained or lost if interest rates rise 1 point" },
};

export default function GreeksSummary({ greeks }: { greeks: Greeks }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="greeks-summary">
      {(Object.keys(EXPLAINERS) as Array<keyof Greeks>).map((key) => (
        <div
          key={key}
          className="cursor-help rounded-md bg-slate-900 p-3"
          title={EXPLAINERS[key].text}
        >
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            {key} <span className="normal-case text-slate-600">({EXPLAINERS[key].unit})</span>
          </dt>
          <dd className={`text-lg font-medium tabular-nums ${
            greeks[key] > 0 ? "text-emerald-400" : greeks[key] < 0 ? "text-rose-400" : ""
          }`}>
            {signed(greeks[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}
