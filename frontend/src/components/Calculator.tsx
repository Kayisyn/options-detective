import { useEffect, useState } from "react";
import { useStore } from "../store";
import { money, num, pct, shortDate, signed, strategyLabel } from "../lib/format";
import PayoffChart from "./shared/PayoffChart";
import GreeksSummary from "./shared/GreeksSummary";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import { FormInput, compactFieldClasses } from "./ui/Input";
import { CalculatorSkeleton } from "./shared/Skeleton";
import { useMode } from "../contexts/ModeContext";
import { BEST_FOR } from "../lib/copy";
import type { CalcResult, Candidate, Leg } from "../types";

// Plain-language readout of the payoff shape. Reads only backend-provided
// breakevens and curve signs — no finance computed here.
function narrative(result: CalcResult, symbol: string): string | null {
  const bes = result.payoff.breakevens;
  const curve = result.payoff.profitAtExpiry;
  if (bes.length === 0 || curve.length === 0) return null;
  const lowSideProfit = curve[0].profit > 0;
  const highSideProfit = curve[curve.length - 1].profit > 0;
  const fmt = (b: number) => `$${b.toFixed(2)}`;
  if (bes.length === 2 && lowSideProfit && highSideProfit) {
    return `Profitable if ${symbol} finishes below ${fmt(bes[0])} or above ${fmt(bes[1])} at expiry — a bet on movement.`;
  }
  if (bes.length === 2 && !lowSideProfit && !highSideProfit) {
    return `Profitable if ${symbol} finishes between ${fmt(bes[0])} and ${fmt(bes[1])} at expiry — a bet on calm.`;
  }
  if (bes.length === 1 && highSideProfit) {
    return `Profitable if ${symbol} finishes above ${fmt(bes[0])} at expiry.`;
  }
  if (bes.length === 1 && lowSideProfit) {
    return `Profitable if ${symbol} finishes below ${fmt(bes[0])} at expiry.`;
  }
  return null;
}

// View 2: payoff diagram + greeks + leg detail for the selected candidate,
// with strike adjustments (repriced at Black-Scholes theoretical, labelled).
export default function Calculator() {
  const s = useStore();
  const { expertMode } = useMode();
  const candidate = s.selected;
  const result = s.calcResult;
  const [draftLegs, setDraftLegs] = useState<Leg[] | null>(null);
  const [captureMode, setCaptureMode] = useState<"journal" | "paper" | null>(null);

  useEffect(() => {
    setDraftLegs(null); // reset edits whenever a new candidate is opened
    setCaptureMode(null);
  }, [candidate?.id]);

  if (!candidate) {
    return (
      <div className="rounded-lg border border-dashed border-dark-600 p-10 text-center text-content-3">
        Pick a candidate in the Screener first.
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
      <div className="card-glass flex flex-wrap items-center gap-3 px-4 py-3">
        <h2 className="text-lg font-semibold capitalize">
          {strategyLabel(candidate.strategyType)}
        </h2>
        <span className="text-sm text-content-3">
          {candidate.symbol} · expires {shortDate(candidate.expiration)} ({candidate.daysToExpiry}d)
          · spot {money(candidate.meta.spot, 2)}
        </span>
        {candidate.meta.marksQuality === "indicative" && (
          <span className="rounded bg-accent-orange/15 px-2 py-0.5 text-xs text-accent-orange"
            title="Market was closed when these quotes were captured — verify live prices before trading">
            indicative marks
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {/* v1.3.1 Bug 2: returns to the list this candidate came from
              (ICS results or the Recommender), never the wrong one */}
          <Button variant="secondary" onClick={() => s.compareCandidates()}
            data-testid="compare-candidates">
            Compare candidates →
          </Button>
          <Button variant="secondary" onClick={() => setCaptureMode("paper")}
            title="Open this position in the risk-free Sandbox simulator"
            data-testid="log-paper-trade">
            Log to Sandbox
          </Button>
          <Button onClick={() => setCaptureMode("journal")} data-testid="save-to-journal">
            Save to Position Log
          </Button>
        </div>
      </div>

      {captureMode && (
        <TradeCaptureModal candidate={candidate} mode={captureMode}
          onClose={() => setCaptureMode(null)} />
      )}

      {s.status === "calculating" && !result && <CalculatorSkeleton />}
      {s.status === "calculating" && result && (
        <div className="card-glass px-4 py-2 text-sm text-content-2">
          Recalculating…
        </div>
      )}

      {result && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <PayoffChart
              points={result.payoff.profitAtExpiry}
              breakevens={result.payoff.breakevens}
              spot={result.inputs.spot}
              maxProfit={result.payoff.maxProfit}
              maxLoss={result.payoff.maxLoss}
            />
            {narrative(result, candidate.symbol) && (
              <p className="mt-2 text-sm text-accent-primary-text">
                {narrative(result, candidate.symbol)}
              </p>
            )}
            {!expertMode && (
              <div className="card-glass mt-3 p-4 text-sm text-content-2"
                data-testid="beginner-explainer">
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-content-3">
                  Understanding the payoff
                </h3>
                <p>
                  This is a {strategyLabel(candidate.strategyType).toLowerCase()} —{" "}
                  {BEST_FOR[candidate.strategyType].charAt(0).toLowerCase()}
                  {BEST_FOR[candidate.strategyType].slice(1)}{" "}
                  You {result.sizing.totalDebit >= 0
                    ? `pay ${money(result.sizing.totalDebit)} to open it`
                    : `collect ${money(-result.sizing.totalDebit)} for opening it`}.
                  The chart shows what you would make or lose at every stock
                  price when the options expire. The most you can lose is{" "}
                  <b className="text-accent-red">{money(result.payoff.maxLoss)}</b> —
                  never risk money you can't afford to lose on that number.
                </p>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <Stat label="Max profit" value={money(result.payoff.maxProfit)} tone="good"
                hint="Best possible outcome at expiry" />
              <Stat label="Max loss" value={money(result.payoff.maxLoss)} tone="bad"
                hint="Worst possible outcome at expiry — size positions off this number" />
              <Stat label="Breakevens"
                value={result.payoff.breakevens.map((b) => b.toFixed(2)).join(" / ") || "—"}
                hint="Underlying prices where the trade neither makes nor loses money" />
              <Stat label="POP" value={pct(result.probability.pop)}
                hint="Probability of any profit at expiry (lognormal model, risk-neutral drift)"
                onInfo={() => s.openHelp("pop")} />
            </div>
          </div>

          <div className="space-y-4 lg:col-span-2">
            {!expertMode && (
              <details className="rounded-md border border-dark-700 bg-dark-800/50 p-3"
                data-testid="beginner-greeks-details">
                <summary className="cursor-pointer text-sm text-content-2">
                  See detailed greeks?
                </summary>
                <div className="mt-3">
                  <GreeksSummary greeks={result.netGreeks} />
                </div>
              </details>
            )}
            {expertMode && <GreeksSummary greeks={result.netGreeks} />}

            <div className="card-glass overflow-hidden p-0">
              <div className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wide text-content-3">
                Legs: edit strikes to explore
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {legs.map((leg, i) => (
                    <tr key={`${leg.type}-${i}`} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-2 capitalize">{leg.type.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2">
                        {leg.type.endsWith("stock") ? (
                          <span className="text-content-3">—</span>
                        ) : (
                          <input
                            type="number"
                            step="0.5"
                            value={leg.strike}
                            onChange={(e) => editStrike(i, Number(e.target.value))}
                            className={`w-24 ${compactFieldClasses}`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {money(leg.price, 2)}
                        {leg.theoretical && (
                          <span className="ml-1 text-xs text-accent-orange" title="Black-Scholes theoretical price at the leg's IV — not a market quote">
                            theo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-content-3">
                        {leg.greeks ? `Δ ${num(leg.greeks.delta)}` : ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-content-3">×{leg.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dirty && (
                <div className="flex gap-2 border-t border-white/10 px-3 py-2">
                  <Button size="xs" onClick={() => recalculate()}
                    title="Reprice adjusted legs at Black-Scholes theoretical value and recompute everything">
                    Recalculate (theoretical)
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setDraftLegs(null)}>
                    Reset
                  </Button>
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

// v1.3.1 Bug 1 (+ v1.3.3 paper mode): capture the on-screen strategy into
// the Position Log or the Sandbox without leaving the Trade Analyzer.
// Pre-filled from the candidate; entry price, size and targets are editable
// and ride along as overrides — the full candidate snapshot is still stored,
// so marks and paper settlement keep working. Paper mode reserves capital
// server-side and rejects the open if the paper budget can't cover it.
function TradeCaptureModal({ candidate, mode, onClose }: {
  candidate: Candidate; mode: "journal" | "paper"; onClose: () => void;
}) {
  const saveToJournal = useStore((st) => st.saveToJournal);
  const openPaperTrade = useStore((st) => st.openPaperTrade);
  const paper = mode === "paper";
  const isCredit = candidate.sizing.totalDebit < 0;
  const [entryPrice, setEntryPrice] = useState(
    (Math.abs(candidate.sizing.totalDebit) / 100).toFixed(2));
  const [qty, setQty] = useState("1");
  const [maxLoss, setMaxLoss] = useState(
    candidate.payoff.maxLoss === null ? "" : String(candidate.payoff.maxLoss));
  const [maxProfit, setMaxProfit] = useState(
    candidate.payoff.maxProfit === null ? "" : String(candidate.payoff.maxProfit));
  const [note, setNote] = useState("");
  const [priceError, setPriceError] = useState<string | undefined>();
  const [qtyError, setQtyError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function save() {
    const price = Number(entryPrice);
    const priceBad = entryPrice.trim() === "" || !Number.isFinite(price) || price <= 0;
    setPriceError(priceBad ? "Entry price is required (per share, > 0)" : undefined);
    const contracts = Number(qty);
    const qtyBad = paper && (!Number.isInteger(contracts) || contracts <= 0);
    setQtyError(qtyBad ? "Whole contracts only (≥ 1)" : undefined);
    if (priceBad || qtyBad) return;

    setSaving(true);
    const overrides = {
      note,
      entryPrice: price,
      maxLossTarget: maxLoss.trim() === "" ? null : Number(maxLoss),
      maxProfitTarget: maxProfit.trim() === "" ? null : Number(maxProfit),
    };
    const ok = paper
      ? await openPaperTrade({ candidate, entryQty: contracts, ...overrides })
      : await saveToJournal(candidate, overrides);
    setSaving(false);
    if (ok) onClose(); // success toast comes from the store
  }

  const cta = paper ? "Log to Sandbox" : "Save to Position Log";
  return (
    <Modal open onClose={onClose} testid="trade-capture-modal" maxWidth="max-w-md">
      <h3 className="mb-1 text-base font-medium">
        {paper ? "Log to Sandbox" : "Save to Position Log"}
      </h3>
      <p className="mb-4 text-sm text-content-3">
        <span className="font-mono font-semibold text-content-1">{candidate.symbol}</span>
        {" · "}<span className="capitalize">{strategyLabel(candidate.strategyType)}</span>
        {" · "}expires {shortDate(candidate.expiration)}
        {paper
          ? " · reserves capital from your sandbox budget"
          : " · logged as open, dated today"}
      </p>
      <div className="space-y-3">
        <div className={paper ? "grid grid-cols-2 gap-3" : ""}>
          <FormInput label={`Entry price (per share, ${isCredit ? "credit" : "debit"})`}
            type="number" step="0.01" value={entryPrice} error={priceError}
            data-testid="save-entry-price"
            onChange={(e) => setEntryPrice(e.target.value)} />
          {paper && (
            <FormInput label="Contracts" type="number" step="1" min="1" value={qty}
              error={qtyError} data-testid="save-qty"
              onChange={(e) => setQty(e.target.value)} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Max loss target ($)" type="number" step="1" value={maxLoss}
            hint="blank = none" onChange={(e) => setMaxLoss(e.target.value)} />
          <FormInput label="Max profit target ($)" type="number" step="1" value={maxProfit}
            hint="blank = none" onChange={(e) => setMaxProfit(e.target.value)} />
        </div>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-content-3">Notes (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            data-testid="save-note"
            className="mt-0.5 w-full rounded-md border border-white/15 bg-dark-700 px-2 py-1.5 text-sm text-content-1 focus:border-accent-primary focus:outline-none" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="save-capture-submit">
            {saving ? "Saving…" : cta}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, hint, tone, onInfo }: {
  label: string; value: string; hint?: string; tone?: "good" | "bad";
  onInfo?: () => void;
}) {
  return (
    <div className="cursor-help rounded-md bg-dark-700/50 p-3" title={hint}>
      <div className="text-xs uppercase tracking-wide text-content-3">
        {label}
        {onInfo && (
          <button onClick={onInfo} title="Open in the glossary" aria-label={`Glossary: ${label}`}
            className="ml-1 text-content-3/70 transition-colors duration-150 hover:text-accent-primary-text">
            ⓘ
          </button>
        )}
      </div>
      <div className={`mt-0.5 font-mono font-medium tabular-nums ${
        tone === "good" ? "text-accent-green" : tone === "bad" ? "text-accent-red" : "text-accent-primary-text"
      }`}>
        {value}
      </div>
    </div>
  );
}
