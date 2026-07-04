import { useStore } from "../store";
import { money, pct, shortDate, signed, strategyLabel } from "../lib/format";
import type { DirectionalView } from "../types";

const VIEWS: Array<{ id: DirectionalView; label: string }> = [
  { id: "bullish", label: "Bullish" },
  { id: "bearish", label: "Bearish" },
  { id: "neutral", label: "Neutral" },
  { id: "income", label: "Income" },
];

// View 1: symbol + intent -> ranked candidates across all expirations.
export default function Detector() {
  const s = useStore();
  const result = s.screenResult;
  const screening = s.status === "screening";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">Symbol</span>
          <input
            value={s.symbol}
            onChange={(e) => s.setIntent({ symbol: e.target.value.toUpperCase() })}
            onKeyDown={(e) => e.key === "Enter" && !screening && s.screen()}
            className="mt-1 block w-28 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm uppercase focus:border-sky-500 focus:outline-none"
            placeholder="AAPL"
            data-testid="symbol-input"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500"
            title="Your directional opinion drives which strategies are screened">
            View
          </span>
          <select
            value={s.directionalView}
            onChange={(e) => s.setIntent({ directionalView: e.target.value as DirectionalView })}
            className="mt-1 block rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          >
            {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">Capital</span>
          <input
            type="number"
            min={1000}
            step={1000}
            value={s.capital}
            onChange={(e) => s.setIntent({ capital: Number(e.target.value) })}
            className="mt-1 block w-32 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-400"
          title="Exclude strategies whose loss is theoretically unlimited (e.g. short strangles)">
          <input
            type="checkbox"
            checked={s.definedRiskOnly}
            onChange={(e) => s.setIntent({ definedRiskOnly: e.target.checked })}
            className="accent-sky-600"
          />
          Defined risk only
        </label>
        <button
          onClick={() => s.screen()}
          disabled={screening || s.symbol.trim() === ""}
          className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700"
          data-testid="screen-button"
        >
          {screening ? "Screening…" : "Screen"}
        </button>
        {result && (
          <button
            onClick={() => s.screen(true)}
            disabled={screening}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800"
            title="Bypass the 60s cache and refetch quotes"
          >
            Refresh
          </button>
        )}
      </div>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-md bg-slate-900 px-4 py-3 text-sm">
            <span className="font-mono text-base font-semibold">{result.symbol}</span>
            <span>{money(result.price, 2)}</span>
            <span title="Where today's implied volatility sits in the past year's range (0-100). High = options are expensive, favors selling premium.">
              IV rank <b>{result.ivRank ?? "n/a"}</b> ({result.ivBand})
            </span>
            <span className="text-slate-500">
              screened {result.strategiesScreened.map(strategyLabel).join(", ")}
            </span>
            <span className="text-slate-500">
              {result.generated} candidates from {result.expirationsScreened.length} expirations
            </span>
          </div>

          {result.warnings.map((w) => (
            <div key={w} className="rounded-md border border-amber-800 bg-amber-950/50 px-4 py-2 text-sm text-amber-200">
              ⚠ {w}
            </div>
          ))}

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm" data-testid="candidates-table">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Strategy</th>
                  <th className="px-3 py-2">Expiry</th>
                  <th className="px-3 py-2" title="Positive = you pay (debit); negative = you collect (credit)">Net</th>
                  <th className="px-3 py-2" title="Probability of any profit at expiry, from the lognormal model">POP</th>
                  <th className="px-3 py-2">Max profit</th>
                  <th className="px-3 py-2">Max loss</th>
                  <th className="px-3 py-2" title="Dollars gained (+) or lost (-) per calendar day from time decay">θ/day</th>
                  <th className="px-3 py-2" title="Composite: POP 30% · risk/reward 20% · theta 20% · capital efficiency 15% · liquidity 15%">Score</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => s.openCandidate(c)}
                    className="cursor-pointer border-b border-slate-800/60 transition-colors last:border-0 hover:bg-slate-800/60"
                  >
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium capitalize">{strategyLabel(c.strategyType)}</td>
                    <td className="px-3 py-2">{shortDate(c.expiration)} <span className="text-slate-500">({c.daysToExpiry}d)</span></td>
                    <td className="px-3 py-2 tabular-nums">
                      {c.sizing.totalDebit >= 0 ? money(c.sizing.totalDebit) : `${money(-c.sizing.totalDebit)} cr`}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{pct(c.probability.pop)}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-400">{money(c.payoff.maxProfit)}</td>
                    <td className="px-3 py-2 tabular-nums text-rose-400">{money(c.payoff.maxLoss)}</td>
                    <td className="px-3 py-2 tabular-nums">{signed(c.metrics.thetaPerDay)}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{c.compositeScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.candidates.length > 0 && (
            <button
              onClick={() => s.recommend()}
              className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Compare top candidates →
            </button>
          )}
        </>
      )}

      {!result && !screening && (
        <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
          Enter a symbol and hit <b>Screen</b>. Every expiration and eligible
          strategy is checked, priced, and ranked — top 20 shown.
        </div>
      )}
    </section>
  );
}
