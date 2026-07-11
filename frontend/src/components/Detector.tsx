import { useState } from "react";
import { useStore } from "../store";
import { money, num, pct, shortDate, signed, strategyLabel } from "../lib/format";
import Button from "./ui/Button";
import { Badge, Card, CardContent, CardFooter, CardHeader, MetricBox } from "./ui/Card";
import CountUp from "./ui/CountUp";
import { FormInput, FormSelect } from "./ui/Input";
import FilterPanel from "./shared/FilterPanel";
import ScoreBreakdown from "./shared/ScoreBreakdown";
import SortControl from "./shared/SortControl";
import { DetectorSkeleton } from "./shared/Skeleton";
import { useMode } from "../contexts/ModeContext";
import { applyFilters, countActiveFilters, sortCandidates } from "../lib/candidateQuery";
import {
  DEFAULT_WEIGHTS, WEIGHT_PRESETS, effectiveScore, weightsEqual,
} from "../lib/scoring";
import { BEST_FOR } from "../lib/copy";
import type { CandidateFilters } from "../lib/candidateQuery";
import type { Candidate, DirectionalView } from "../types";

// Dismissible chips for whatever filters are active.
function filterChips(f: CandidateFilters): Array<{ id: string; label: string; patch: Partial<CandidateFilters> }> {
  const chips: Array<{ id: string; label: string; patch: Partial<CandidateFilters> }> = [];
  for (const s of f.strategies) {
    chips.push({
      id: `strategy:${s}`,
      label: strategyLabel(s),
      patch: { strategies: f.strategies.filter((x) => x !== s) },
    });
  }
  const numeric: Array<[keyof CandidateFilters, string]> = [
    ["dteMin", `DTE ≥ ${f.dteMin}`],
    ["dteMax", `DTE ≤ ${f.dteMax}`],
    ["popMin", `POP ≥ ${f.popMin}%`],
    ["popMax", `POP ≤ ${f.popMax}%`],
    ["minVolume", `Vol ≥ ${f.minVolume}`],
    ["maxSpreadPct", `Spread ≤ ${f.maxSpreadPct}%`],
    ["maxCapital", `Capital ≤ $${f.maxCapital}`],
    ["deltaMin", `Δ ≥ ${f.deltaMin}`],
    ["deltaMax", `Δ ≤ ${f.deltaMax}`],
    ["thetaMin", `θ ≥ ${f.thetaMin}`],
  ];
  for (const [key, label] of numeric) {
    if (f[key] !== null) chips.push({ id: key, label, patch: { [key]: null } });
  }
  return chips;
}

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
  const { expertMode } = useMode();
  const result = s.screenResult;
  const screening = s.status === "screening";
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // filtered + sorted view of the screened set. Rank chips show the
  // composite rank under the ACTIVE weights, so custom weights visibly
  // re-rank (v1.1 §2) while re-sorting by other keys stays interpretable.
  const allCandidates = result?.candidates ?? [];
  const customWeights = !weightsEqual(s.weights, DEFAULT_WEIGHTS);
  const visible = sortCandidates(applyFilters(allCandidates, s.filters), s.sort, s.weights);
  const rankById = new Map(
    sortCandidates(allCandidates, { key: "score", dir: "desc" }, s.weights)
      .map((c, i) => [c.id, i + 1]));
  const activePreset = WEIGHT_PRESETS.find((p) => weightsEqual(s.weights, p.weights));

  return (
    <section className="space-y-4">
      <div className="card-glass flex flex-wrap items-end gap-3 p-4">
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
            className="accent-accent-primary"
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => s.setView("etf")}
          title="Don't know what to screen? Discover candidates in the Asset Screener"
          className="mb-1"
          data-testid="discover-etfs"
        >
          Asset Screener →
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

      {screening && <DetectorSkeleton />}

      {!screening && result && (
        <>
          <div className="card-glass flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
            <span className="font-mono text-base font-semibold">{result.symbol}</span>
            <span className="font-mono font-bold tabular-nums">{money(result.price, 2)}</span>
            {expertMode && (
              <span title="Where today's implied volatility sits in the past year's range (0-100). High = options are expensive, favors selling premium.">
                IV rank <b>{result.ivRank ?? "n/a"}</b> ({result.ivBand})
                <button
                  onClick={() => s.openHelp("iv-rank")}
                  aria-label="Glossary: IV rank"
                  title="Open in the glossary"
                  className="ml-1 text-content-3/70 transition-colors duration-150 hover:text-accent-primary-text"
                >
                  ⓘ
                </button>
              </span>
            )}
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

          {expertMode && result.ivBand === "high" && (
            <div className="rounded-md border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm text-accent-blue">
              💡 IV rank {result.ivRank} is high — options are expensive right now, so the
              screen favors premium-selling structures (condors, strangles, covered calls).
            </div>
          )}
          {expertMode && result.ivBand === "low" && (
            <div className="rounded-md border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm text-accent-blue">
              💡 IV rank {result.ivRank} is low — options are cheap right now, so the screen
              favors long-volatility structures (straddles) and debit spreads.
            </div>
          )}

          <div className="flex flex-col gap-4 lg:flex-row">
            <FilterPanel
              filters={s.filters}
              onPatch={s.patchFilters}
              onClear={s.clearFilters}
              expertMode={expertMode}
              activeCount={countActiveFilters(s.filters)}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {filterChips(s.filters).map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => s.patchFilters(chip.patch)}
                    data-testid="filter-chip"
                    className="inline-flex items-center gap-1 rounded border border-accent-primary/50 bg-accent-primary/15 px-2 py-1 text-xs capitalize text-accent-primary-text transition-all duration-150 ease-out-quad hover:bg-accent-primary/25"
                    title="Remove this filter"
                  >
                    {chip.label} <span aria-hidden>✕</span>
                  </button>
                ))}
                <span className="text-xs text-content-3" data-testid="result-count">
                  Showing {visible.length} of {result.candidates.length}
                </span>
                {customWeights && (
                  <button
                    onClick={() => s.setWeights({ ...DEFAULT_WEIGHTS })}
                    data-testid="weights-chip"
                    title="Scores and ranks use your custom weights (adjust in Settings). Click to reset to the default blend."
                    className="inline-flex items-center gap-1 rounded border border-accent-orange/40 bg-accent-orange/10 px-2 py-1 text-xs text-accent-orange transition-all duration-150 ease-out hover:bg-accent-orange/20"
                  >
                    Weights: {activePreset?.name ?? "custom"} <span aria-hidden>✕</span>
                  </button>
                )}
                <SortControl sort={s.sort} onChange={s.setSort} className="ml-auto" />
              </div>

              {visible.length === 0 ? (
                <div className="rounded-lg border border-dashed border-dark-600 p-8 text-center text-content-3">
                  No candidates match the current filters.
                  <Button variant="ghost" size="sm" className="ml-2" onClick={s.clearFilters}>
                    Clear all
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2" data-testid="candidate-grid">
                  {visible.map((c, i) => (
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
                    <span className="rounded bg-accent-primary px-2 py-0.5 text-xs font-semibold text-white"
                      title="Composite-score rank from the screen">
                      #{rankById.get(c.id)}
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
                      title={expertMode
                        ? "Probability of any profit at expiry (lognormal model)"
                        : "Rough odds this trade ends up profitable — 60%+ is favorable"}>
                      {pct(c.probability.pop)} POP
                    </Badge>
                    {expertMode && (
                      <span className="font-mono font-bold tabular-nums text-accent-primary-text"
                        title={customWeights
                          ? "Composite score under YOUR weights — open Settings → Scoring to adjust"
                          : "Composite: POP 30% · risk/reward 20% · theta 20% · capital efficiency 15% · liquidity 15%"}>
                        {effectiveScore(c, s.weights).toFixed(1)}
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className={expertMode ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
                  <MetricBox label="Max Profit"
                    value={c.payoff.maxProfit === null ? "∞"
                      : <CountUp to={c.payoff.maxProfit} format={(n) => money(n)} />}
                    highlight="green" hint="Best possible outcome at expiry" />
                  <MetricBox label="Max Loss"
                    value={c.payoff.maxLoss === null ? "∞"
                      : <CountUp to={c.payoff.maxLoss} format={(n) => money(n)} />}
                    highlight="red" hint="Worst possible outcome — size positions off this number" />
                  {expertMode && (
                    <MetricBox label="Risk/Reward" value={riskReward(c)}
                      hint="Max profit divided by max loss" />
                  )}
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
                    {expertMode ? "Details" : "Learn more"}
                  </Button>
                  {expertMode && (
                    <span className="ml-auto font-mono text-xs tabular-nums text-content-3"
                      title="Dollars gained (+) or lost (-) per calendar day from time decay">
                      θ {signed(c.metrics.thetaPerDay)}/day
                    </span>
                  )}
                </CardFooter>

                {detailsId === c.id && (
                  <div className="mt-3 border-t border-dark-700 pt-3 text-sm text-content-2"
                    onClick={(e) => e.stopPropagation()}>
                    {!expertMode && (
                      <p className="mb-1 text-accent-primary-text">
                        Best for: {BEST_FOR[c.strategyType]}
                      </p>
                    )}
                    {expertMode && (
                      <div className="mb-2">
                        <ScoreBreakdown candidate={c} weights={s.weights} />
                      </div>
                    )}
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
              )}

              {visible.length > 0 && (
                <Button variant="secondary" onClick={() => s.recommend()}>
                  Compare top candidates →
                </Button>
              )}
            </div>
          </div>

        </>
      )}

      {!result && !screening && (
        <div className="rounded-lg border border-dashed border-dark-600 p-10 text-center text-content-3">
          Enter a symbol and hit <b>Screen</b>. Every expiration and eligible
          strategy is checked, priced, and ranked — then filter and sort to taste.
        </div>
      )}
    </section>
  );
}
