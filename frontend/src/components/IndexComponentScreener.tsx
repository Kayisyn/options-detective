import { useMemo, useState } from "react";
import { useStore } from "../store";
import { money, pct, shortDate, strategyLabel } from "../lib/format";
import { cx } from "../lib/cx";
import Button from "./ui/Button";
import { Badge, Card } from "./ui/Card";
import { FormSelect } from "./ui/Input";
import type { IcsCandidate } from "../types";

// Index Component Screener (v1.3.0 §4): every holding of the selected ETF is
// screened by the Detector; this view filters and ranks the merged result.
// Sector / subset / strategy filters are CLIENT-side over the returned
// candidate set — instant, no re-screen. Clicking a row opens the Calculator
// with the full candidate (openCandidate, same path as the Detector).

type Subset = 10 | 25 | 0; // 0 = all
type SortKey = "score" | "pop" | "weight" | "maxProfit" | "capital" | "dte";
const PAGE = 50;

function sortValue(c: IcsCandidate, key: SortKey): number {
  switch (key) {
    case "pop": return c.probability.pop;
    case "weight": return c.holding.weight;
    case "maxProfit": return c.payoff.maxProfit ?? Infinity; // unbounded first
    case "capital": return -c.sizing.capitalRequired;        // cheaper first
    case "dte": return -c.daysToExpiry;                      // nearer first
    default: return c.compositeScore;
  }
}

export default function IndexComponentScreener() {
  const s = useStore();
  const result = s.icsResult;

  const [sectors, setSectors] = useState<string[]>([]);
  const [subset, setSubset] = useState<Subset>(0);
  const [strategy, setStrategy] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("score");
  const [shown, setShown] = useState(PAGE);

  const sectorOptions = useMemo(() => {
    if (!result) return [];
    return [...new Set(result.holdings.map((h) => h.sector).filter((x): x is string => !!x))].sort();
  }, [result]);

  const strategyOptions = useMemo(() => {
    if (!result) return [];
    return [...new Set(result.candidates.map((c) => c.strategyType))].sort();
  }, [result]);

  const filtered = useMemo(() => {
    if (!result) return [];
    return result.candidates
      .filter((c) => (sectors.length === 0 || (c.holding.sector !== null && sectors.includes(c.holding.sector)))
        && (subset === 0 || c.holding.rank <= subset)
        && (strategy === "" || c.strategyType === strategy))
      .sort((a, b) => sortValue(b, sort) - sortValue(a, sort));
  }, [result, sectors, subset, strategy, sort]);

  const toggleSector = (sec: string) => {
    setShown(PAGE);
    setSectors((cur) => (cur.includes(sec) ? cur.filter((x) => x !== sec) : [...cur, sec]));
  };

  const headerCell = (label: string, key: SortKey | null, align = "text-right") => (
    <th
      className={cx("px-3 py-2", align, key && "cursor-pointer select-none hover:text-content-1")}
      onClick={key ? () => setSort(key) : undefined}
      title={key ? `Sort by ${label}` : undefined}
    >
      {label}{key && sort === key ? " ↓" : ""}
    </th>
  );

  if (!s.icsEtf) {
    return (
      <section className="rounded-lg border border-dashed border-dark-600 p-8 text-center text-content-3">
        Pick an ETF in the <button className="text-accent-blue underline" onClick={() => s.setView("etf")}>ETF Screener</button> and
        hit “Expand holdings” to screen options across all of its components.
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="ics">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button className="mb-1 text-xs text-content-3 hover:text-content-1" onClick={() => s.setView("etf")}>
            ← ETF Screener
          </button>
          <h2 className="text-lg font-medium">
            {s.icsEtf} — component screener
            {result?.cached && <Badge variant="blue" className="ml-2 align-middle">cached</Badge>}
          </h2>
          {result && (
            <p className="text-sm text-content-3" data-testid="ics-meta">
              {result.source === "curated"
                ? `Top ${result.totalHoldings} holdings (curated, approx. weights as of ${result.asOf})`
                : `Top ${result.totalHoldings} holdings via Yahoo Finance (as of ${result.asOf})`}
              {" · "}{result.screenedSymbols} screened · {result.totalCandidates} candidates
              {" · "}{(result.screeningTimeMs / 1000).toFixed(1)}s
              {" · "}screened {shortDate(result.screenedAt.slice(0, 10))}
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" disabled={s.icsBusy} data-testid="ics-refresh"
          title="Re-screen every holding with live data (bypasses the daily cache)"
          onClick={() => s.runIcs(true)}>
          {s.icsBusy ? "Working…" : "Refresh"}
        </Button>
      </div>

      {s.icsError && (
        <div className="rounded-lg border border-dashed border-dark-600 p-6 text-center text-content-2"
          data-testid="ics-error">
          {s.icsError}
        </div>
      )}

      {s.icsBusy && !result && (
        <Card className="space-y-3 p-6 text-center" data-testid="ics-loading">
          <div className="text-content-2">Screening every holding of {s.icsEtf}…</div>
          <div className="mx-auto h-1.5 w-64 overflow-hidden rounded-full bg-dark-700">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-accent-blue" />
          </div>
          <div className="text-xs text-content-3">
            First run fetches live option chains for each holding (typically 30–90s).
            Results are cached for a day — re-opening is instant.
          </div>
        </Card>
      )}

      {result && (
        <>
          {/* filters — client-side over the screened set, instant */}
          <Card className="flex flex-wrap items-end gap-4" data-testid="ics-filters">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-content-3">Holdings</div>
              <div className="flex gap-1.5">
                {([10, 25, 0] as Subset[]).map((n) => (
                  <button key={n} data-subset={n}
                    onClick={() => { setSubset(n); setShown(PAGE); }}
                    className={cx(
                      "rounded border px-2 py-1 text-xs transition-all duration-150 ease-out",
                      subset === n
                        ? "border-accent-blue/60 bg-accent-blue/15 text-accent-blue"
                        : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
                    )}>
                    {n === 0 ? "All" : `Top ${n}`}
                  </button>
                ))}
              </div>
            </div>
            {sectorOptions.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-content-3">Sector</div>
                <div className="flex flex-wrap gap-1.5" data-testid="ics-sectors">
                  {sectorOptions.map((sec) => (
                    <button key={sec} onClick={() => toggleSector(sec)}
                      className={cx(
                        "rounded border px-2 py-1 text-xs transition-all duration-150 ease-out",
                        sectors.includes(sec)
                          ? "border-accent-blue/60 bg-accent-blue/15 text-accent-blue"
                          : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
                      )}>
                      {sec}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <FormSelect label="Strategy" value={strategy}
              onChange={(e) => { setStrategy(e.target.value); setShown(PAGE); }}>
              <option value="">All strategies</option>
              {strategyOptions.map((st) => (
                <option key={st} value={st}>{strategyLabel(st)}</option>
              ))}
            </FormSelect>
            <div className="ml-auto text-sm text-content-3" data-testid="ics-count">
              {filtered.length} of {result.totalCandidates}
            </div>
          </Card>

          <div className="overflow-hidden rounded-lg border border-dark-700" data-testid="ics-results">
            <table className="w-full text-sm">
              <thead className="bg-dark-800 text-xs uppercase tracking-wide text-content-3">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  {headerCell("Symbol", null, "text-left")}
                  {headerCell("Weight", "weight")}
                  <th className="px-3 py-2 text-left">Sector</th>
                  <th className="px-3 py-2 text-left">Strategy</th>
                  {headerCell("DTE", "dte")}
                  {headerCell("POP", "pop")}
                  {headerCell("Max P/L", "maxProfit")}
                  {headerCell("Capital", "capital")}
                  {headerCell("Score", "score")}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((c, i) => (
                  <tr key={c.symbol + c.id} data-testid="ics-row"
                    onClick={() => s.openCandidate(c)}
                    title="Open in Calculator"
                    className="cursor-pointer border-t border-dark-700 hover:bg-dark-800/50">
                    <td className="px-3 py-2 text-content-3">{i + 1}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{c.symbol}</td>
                    <td className="px-3 py-2 text-right font-mono text-content-3">{pct(c.holding.weight, 1)}</td>
                    <td className="px-3 py-2 text-content-2">{c.holding.sector ?? "—"}</td>
                    <td className="px-3 py-2 capitalize text-content-2">{strategyLabel(c.strategyType)}</td>
                    <td className="px-3 py-2 text-right font-mono text-content-3">{c.daysToExpiry}</td>
                    <td className="px-3 py-2 text-right font-mono">{pct(c.probability.pop)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className="text-accent-green">{c.payoff.maxProfit == null ? "∞" : money(c.payoff.maxProfit)}</span>
                      <span className="text-content-3"> / </span>
                      <span className="text-accent-red">{c.payoff.maxLoss == null ? "∞" : money(c.payoff.maxLoss)}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-content-3">{money(c.sizing.capitalRequired)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-accent-blue">{c.compositeScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-6 text-center text-content-3">
                No candidates match these filters — loosen the sector/subset/strategy filters.
              </div>
            )}
          </div>

          {filtered.length > shown && (
            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)} data-testid="ics-more">
                Show {Math.min(PAGE, filtered.length - shown)} more ({filtered.length - shown} left)
              </Button>
            </div>
          )}

          {result.skipped.length > 0 && (
            <details className="text-xs text-content-3" data-testid="ics-skipped">
              <summary className="cursor-pointer">
                {result.skipped.length} holding{result.skipped.length === 1 ? "" : "s"} skipped (no usable options data)
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4">
                {result.skipped.map((sk) => (
                  <li key={sk.symbol}><span className="font-mono">{sk.symbol}</span> — {sk.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
