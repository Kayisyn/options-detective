import { useState } from "react";
import { useStore } from "../store";
import { money, num, pct, shortDate, signed, strategyLabel } from "../lib/format";
import Button from "./ui/Button";
import { Badge, Card, CardContent, CardFooter, CardHeader, MetricBox } from "./ui/Card";
import { FormInput, FormSelect } from "./ui/Input";
import type { Candidate, DirectionalView } from "../types";

const VIEWS: Array<{ id: DirectionalView; label: string }> = [
  { id: "bullish", label: "Bullish" },
  { id: "bearish", label: "Bearish" },
  { id: "neutral", label: "Neutral" },
  { id: "income", label: "Income" },
];

const STAGGER_MS = 50;
const STAGGER_CAP = 8; // cards past #9 enter together; nobody waits a second

function riskReward(c: Candidate): string {
  if (c.metrics.riskRewardRatio !== null) return `${num(c.metrics.riskRewardRatio)}x`;
  return c.payoff.maxProfit === null ? "∞" : "—";
}

// View 1: symbol + intent -> ranked candidate cards across all expirations.
export default function Detector() {
  const s = useStore();
  const result = s.screenResult;
  const screening = s.status === "screening";
  const [detailsId, setDetailsId] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormInput
          label="Symbol"
          placeholder="AAPL, SPY, NVDA"
          value={s.symbol}
          onChange={(e) => s.setIntent({ symbol: e.target.value.toUpperCase() })}
          onKeyDown={(e) => e.key === "Enter" && !screening && s.screen()}
          className="w-36 font-mono uppercase"
          data-testid="symbol-input"
        />
        <FormSelect
          label="View"
          hint="Your directional opinion drives which strategies are screened"
          value={s.directionalView}
          onChange={(e) => s.setIntent({ directionalView: e.target.value as DirectionalView })}
        >
          {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </FormSelect>
        <FormInput
          label="Capital"
          type="number"
          min={1000}
          step={1000}
          value={s.capital}
          onChange={(e) => s.setIntent({ capital: Number(e.target.value) })}
          className="w-32"
          error={s.capital < 1000 ? "at least $1,000" : undefined}
          data-testid="capital-input"
        />
        <label className="flex items-center gap-2 pb-3 text-sm text-content-2"
          title="Exclude strategies whose loss is theoretically unlimited (e.g. short strangles)">
          <input
            type="checkbox"
            checked={s.definedRiskOnly}
            onChange={(e) => s.setIntent({ definedRiskOnly: e.target.checked })}
            className="accent-blue-600"
          />
          Defined risk only
        </label>
        <Button
          size="lg"
          onClick={() => s.screen()}
          disabled={screening || s.symbol.trim() === "" || s.capital < 1000}
          data-testid="screen-button"
        >
          {screening ? "Screening…" : "Screen"}
        </Button>
        {result && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => s.screen(true)}
            disabled={screening}
            title="Bypass the 60s cache and refetch quotes"
            className="mb-1"
          >
            Refresh
          </Button>
        )}
      </div>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-md bg-dark-800 px-4 py-3 text-sm">
            <span className="font-mono text-base font-semibold">{result.symbol}</span>
            <span className="font-bold tabular-nums">{money(result.price, 2)}</span>
            <span title="Where today's implied volatility sits in the past year's range (0-100). High = options are expensive, favors selling premium.">
              IV rank <b>{result.ivRank ?? "n/a"}</b> ({result.ivBand})
            </span>
            <span className="text-content-3">
              screened {result.strategiesScreened.map(strategyLabel).join(", ")}
            </span>
            <span className="text-content-3">
              {result.generated} candidates from {result.expirationsScreened.length} expirations
            </span>
          </div>

          {result.warnings.map((w) => (
            <div key={w} className="rounded-md border border-amber-800 bg-amber-950/50 px-4 py-2 text-sm text-amber-200">
              ⚠ {w}
            </div>
          ))}

          {result.ivBand === "high" && (
            <div className="rounded-md border border-sky-900 bg-sky-950/50 px-4 py-2 text-sm text-sky-200">
              💡 IV rank {result.ivRank} is high — options are expensive right now, so the
              screen favors premium-selling structures (condors, strangles, covered calls).
            </div>
          )}
          {result.ivBand === "low" && (
            <div className="rounded-md border border-sky-900 bg-sky-950/50 px-4 py-2 text-sm text-sky-200">
              💡 IV rank {result.ivRank} is low — options are cheap right now, so the screen
              favors long-volatility structures (straddles) and debit spreads.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2" data-testid="candidate-grid">
            {result.candidates.map((c, i) => (
              <Card
                key={c.id}
                interactive
                glow={i === 0}
                enterDelayMs={Math.min(i, STAGGER_CAP) * STAGGER_MS}
                onClick={() => s.openCandidate(c)}
                data-testid="candidate-card"
              >
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <span className="rounded bg-dark-700 px-2 py-0.5 text-xs font-semibold text-blue-400">
                      #{i + 1}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold capitalize text-content-1">
                        {strategyLabel(c.strategyType)}
                      </h3>
                      <p className="text-xs text-content-3">
                        {shortDate(c.expiration)} · {c.daysToExpiry}d
                        {c.sizing.totalDebit >= 0
                          ? ` · ${money(c.sizing.totalDebit)} debit`
                          : ` · ${money(-c.sizing.totalDebit)} credit`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.meta.marksQuality === "indicative" && (
                      <Badge variant="orange" title="Market closed — closing marks, verify live spreads">
                        indicative
                      </Badge>
                    )}
                    <Badge variant={c.probability.pop >= 0.6 ? "green" : "blue"}
                      title="Probability of any profit at expiry (lognormal model)">
                      {pct(c.probability.pop)} POP
                    </Badge>
                    <span className="font-bold tabular-nums text-blue-300"
                      title="Composite: POP 30% · risk/reward 20% · theta 20% · capital efficiency 15% · liquidity 15%">
                      {c.compositeScore.toFixed(1)}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="grid grid-cols-3 gap-3">
                  <MetricBox label="Max Profit" value={money(c.payoff.maxProfit)}
                    highlight="green" hint="Best possible outcome at expiry" />
                  <MetricBox label="Max Loss" value={money(c.payoff.maxLoss)}
                    highlight="red" hint="Worst possible outcome — size positions off this number" />
                  <MetricBox label="Risk/Reward" value={riskReward(c)}
                    hint="Max profit divided by max loss" />
                </CardContent>

                <CardFooter>
                  <Button size="sm" onClick={() => s.openCandidate(c)}>
                    Analyze
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsId(detailsId === c.id ? null : c.id);
                    }}
                  >
                    Details
                  </Button>
                  <span className="ml-auto text-xs tabular-nums text-content-3"
                    title="Dollars gained (+) or lost (-) per calendar day from time decay">
                    θ {signed(c.metrics.thetaPerDay)}/day
                  </span>
                </CardFooter>

                {detailsId === c.id && (
                  <div className="mt-3 border-t border-dark-700 pt-3 text-sm text-content-2"
                    onClick={(e) => e.stopPropagation()}>
                    <p>{c.rationale}</p>
                    <p className="mt-1 text-xs text-content-3">
                      needs {money(c.sizing.capitalRequired)}
                      {c.sizing.capitalApproximate ? " (margin approx.)" : ""} ·
                      suggested {c.sizing.contractsSuggested > 0
                        ? `${c.sizing.contractsSuggested} contract${c.sizing.contractsSuggested > 1 ? "s" : ""}`
                        : "manual sizing"} ·
                      breakevens {c.payoff.breakevens.map((b) => b.toFixed(2)).join(" / ") || "—"}
                    </p>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {result.candidates.length > 0 && (
            <Button variant="secondary" onClick={() => s.recommend()}>
              Compare top candidates →
            </Button>
          )}
        </>
      )}

      {!result && !screening && (
        <div className="rounded-lg border border-dashed border-dark-600 p-10 text-center text-content-3">
          Enter a symbol and hit <b>Screen</b>. Every expiration and eligible
          strategy is checked, priced, and ranked — top 20 shown.
        </div>
      )}
    </section>
  );
}
