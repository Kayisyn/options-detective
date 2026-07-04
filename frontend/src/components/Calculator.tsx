import { useEffect, useState } from "react";
import { useStore } from "../store";
import { money, num, pct, shortDate, signed, strategyLabel } from "../lib/format";
import PayoffChart from "./shared/PayoffChart";
import GreeksSummary from "./shared/GreeksSummary";
import type { Leg } from "../types";

// View 2: payoff diagram + greeks + leg detail for the selected candidate,
// with strike adjustments (repriced at Black-Scholes theoretical, labelled).
export default function Calculator() {
  const s = useStore();
  const candidate = s.selected;
  const result = s.calcResult;
  const [draftLegs, setDraftLegs] = useState<Leg[] | null>(null);

  useEffect(() => {
    setDraftLegs(null); // reset edits whenever a new candidate is opened
  }, [candidate?.id]);

  if (!candidate) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
        Pick a candidate in the Detector first.
      </div>
    );
  }

  const legs = draftLegs ?? result?.legs ?? candidate.legs;
  const dirty = draftLegs !== null;

  function editStrike(index: number, strike: number) {
    const base = draftLegs ?? (result?.legs ?? candidate!.legs);
    setDraftLegs(base.map((leg, i) => (i === index ? { ...leg, strike } : leg)));
  }

  async function recalculate() {
    if (!draftLegs) return;
    await useStore.getState().recalculate(draftLegs, true);
    // show the repriced result legs (with their "theo" labels) unless it failed
    if (!useStore.getState().error) setDraftLegs(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium capitalize">
          {strategyLabel(candidate.strategyType)}
        </h2>
        <span className="text-sm text-slate-400">
          {candidate.symbol} · expires {shortDate(candidate.expiration)} ({candidate.daysToExpiry}d)
          · spot {money(candidate.meta.spot, 2)}
        </span>
        {candidate.meta.marksQuality === "indicative" && (
          <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300"
            title="Market was closed when these quotes were captured — verify live prices before trading">
            indicative marks
          </span>
        )}
        <button
          onClick={() => s.recommend()}
          className="ml-auto rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          Compare candidates →
        </button>
      </div>

      {s.status === "calculating" && (
        <div className="rounded-md bg-slate-900 px-4 py-2 text-sm text-slate-400">Recalculating…</div>
      )}

      {result && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <PayoffChart
              points={result.payoff.profitAtExpiry}
              breakevens={result.payoff.breakevens}
              spot={result.inputs.spot}
            />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <Stat label="Max profit" value={money(result.payoff.maxProfit)} tone="good"
                hint="Best possible outcome at expiry" />
              <Stat label="Max loss" value={money(result.payoff.maxLoss)} tone="bad"
                hint="Worst possible outcome at expiry — size positions off this number" />
              <Stat label="Breakevens"
                value={result.payoff.breakevens.map((b) => b.toFixed(2)).join(" / ") || "—"}
                hint="Underlying prices where the trade neither makes nor loses money" />
              <Stat label="POP" value={pct(result.probability.pop)}
                hint="Probability of any profit at expiry (lognormal model, risk-neutral drift)" />
            </div>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <GreeksSummary greeks={result.netGreeks} />

            <div className="rounded-lg border border-slate-800">
              <div className="border-b border-slate-800 px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                Legs — edit strikes to explore
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {legs.map((leg, i) => (
                    <tr key={`${leg.type}-${i}`} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-2 capitalize">{leg.type.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2">
                        {leg.type.endsWith("stock") ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <input
                            type="number"
                            step="0.5"
                            value={leg.strike}
                            onChange={(e) => editStrike(i, Number(e.target.value))}
                            className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 tabular-nums focus:border-sky-500 focus:outline-none"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {money(leg.price, 2)}
                        {leg.theoretical && (
                          <span className="ml-1 text-xs text-amber-400" title="Black-Scholes theoretical price at the leg's IV — not a market quote">
                            theo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-400">
                        {leg.greeks ? `Δ ${num(leg.greeks.delta)}` : ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-500">×{leg.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dirty && (
                <div className="flex gap-2 border-t border-slate-800 px-3 py-2">
                  <button
                    onClick={() => recalculate()}
                    className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                    title="Reprice adjusted legs at Black-Scholes theoretical value and recompute everything"
                  >
                    Recalculate (theoretical)
                  </button>
                  <button
                    onClick={() => setDraftLegs(null)}
                    className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Net cost" value={result.sizing.totalDebit >= 0
                ? `${money(result.sizing.totalDebit)} debit`
                : `${money(-result.sizing.totalDebit)} credit`}
                hint="What one unit of this position costs (debit) or collects (credit)" />
              <Stat label="Capital required"
                value={`${money(result.sizing.capitalRequired)}${result.sizing.capitalApproximate ? " ≈" : ""}`}
                hint="Cash or buying power needed for one unit; ≈ marks a margin approximation" />
              <Stat label="Suggested size"
                value={result.sizing.contractsSuggested > 0
                  ? `${result.sizing.contractsSuggested} contract${result.sizing.contractsSuggested > 1 ? "s" : ""}`
                  : "manual"}
                hint={`Sized so worst-case loss stays within ${s.riskTolerancePct}% of your ${money(s.capital)} account`} />
              <Stat label="Theta / day" value={signed(result.metrics.thetaPerDay)}
                tone={result.metrics.thetaPerDay >= 0 ? "good" : "bad"}
                hint="Dollars the position gains (+) or bleeds (−) each calendar day" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: "good" | "bad";
}) {
  return (
    <div className="cursor-help rounded-md bg-slate-900 p-3" title={hint}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 font-medium tabular-nums ${
        tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : ""
      }`}>
        {value}
      </div>
    </div>
  );
}
