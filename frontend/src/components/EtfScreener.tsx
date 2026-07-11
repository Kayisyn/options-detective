import { Fragment, useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { money, num, pct } from "../lib/format";
import { cx } from "../lib/cx";
import Button from "./ui/Button";
import { Badge, Card, MetricBox } from "./ui/Card";
import { FormInput, FormSelect } from "./ui/Input";
import type { EtfFilters, EtfRecord, EtfStrategy } from "../types";

// Asset Screener (renamed from ETF Screener, v1.4.0): preset buttons,
// filter panel, ranked results with score breakdowns, watchlist, and
// "Analyze in Screener". All metrics are backend-fetched; this view
// filters/ranks presentation only.

const STRATEGY_LABEL: Record<EtfStrategy, string> = {
  covered_call: "Covered call",
  csp: "Cash-secured put",
  spread: "Spread",
};

type SortKey = "score" | "premium" | "ivRank" | "price" | "volume" | "ytd";

function metricValue(e: EtfRecord, key: SortKey): number {
  switch (key) {
    case "premium": return e.annualizedCallPremiumPct ?? -Infinity;
    case "ivRank": return e.ivRank ?? -Infinity;
    case "price": return e.price ?? -Infinity;
    case "volume": return e.callVolume ?? -Infinity;
    case "ytd": return e.ytdReturn ?? -Infinity;
    default: return e.score ?? 0;
  }
}

function ChipRow<T extends string>({ options, selected, onToggle }: {
  options: T[]; selected: T[]; onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button key={opt} onClick={() => onToggle(opt)}
          className={cx(
            "rounded border px-2 py-1 text-xs transition-all duration-150 ease-out-quad",
            selected.includes(opt)
              ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
              : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
          )}>
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function EtfScreener() {
  const s = useStore();
  const [strategy, setStrategy] = useState<EtfStrategy>("covered_call");
  const [filters, setFilters] = useState<EtfFilters>({ sectors: [], assetClasses: [] });
  const [sort, setSort] = useState<SortKey>("score");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    s.loadEtfReference().then(() => s.screenEtf(filters, strategy));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load
  }, []);

  const ref = s.etfReference;
  const result = s.etfResult;
  const patch = (p: Partial<EtfFilters>) => setFilters((f) => ({ ...f, ...p }));

  function runScreen(nextFilters = filters, nextStrategy = strategy) {
    setFilters(nextFilters);
    setStrategy(nextStrategy);
    s.screenEtf(nextFilters, nextStrategy);
  }

  function applyPreset(id: string) {
    const preset = ref?.presets.find((p) => p.id === id);
    if (preset) runScreen({ sectors: [], assetClasses: [], ...preset.filters }, preset.strategy);
  }

  function toggleIn<T extends string>(key: "sectors" | "assetClasses", value: T) {
    const cur = (filters[key] as T[] | undefined) ?? [];
    patch({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] } as Partial<EtfFilters>);
  }

  const sorted = useMemo(() => {
    if (!result) return [];
    return [...result.candidates].sort((a, b) => metricValue(b, sort) - metricValue(a, sort));
  }, [result, sort]);

  const num2 = (v: number | null, suffix = "") => (v == null ? "—" : `${num(v, 2)}${suffix}`);

  return (
    <section className="space-y-4" data-testid="etf-screener">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Asset Screener</h2>
          <p className="text-sm text-content-3">
            Discover {ref?.count ?? "50+"} Vanguard &amp; iShares ETFs ripe for
            option selling. Reference data is static; prices, IV and premiums
            are fetched live.
          </p>
        </div>
        <Button variant="secondary" size="sm" data-testid="etf-refresh"
          disabled={s.etfBusy}
          title="Fetch live price, IV rank and premium for the whole universe (~1 min)"
          onClick={async () => { await s.refreshEtfMetrics([]); runScreen(); }}>
          {s.etfBusy ? "Working…" : "Refresh data"}
        </Button>
      </div>

      {/* preset buttons */}
      <div className="flex flex-wrap gap-2" data-testid="etf-presets">
        {ref?.presets.map((p) => (
          <button key={p.id} onClick={() => applyPreset(p.id)} title={p.hint}
            data-preset={p.id}
            className="rounded-md border border-white/15 bg-glass-light px-3 py-2 text-sm text-content-2 transition-all duration-150 ease-out-quad hover:border-accent-primary/60 hover:text-content-1">
            {p.name}
          </button>
        ))}
        <button onClick={() => setShowFilters((v) => !v)}
          className="rounded-md border border-dark-600 px-3 py-2 text-sm text-content-3 hover:text-content-2">
          {showFilters ? "Hide filters" : "Custom filters"}
        </button>
      </div>

      {showFilters && ref && (
        <Card className="space-y-3" data-testid="etf-filters">
          <div className="flex flex-wrap items-end gap-3">
            <FormSelect label="Strategy (scoring)" value={strategy}
              onChange={(e) => setStrategy(e.target.value as EtfStrategy)}>
              {(Object.keys(STRATEGY_LABEL) as EtfStrategy[]).map((k) => (
                <option key={k} value={k}>{STRATEGY_LABEL[k]}</option>
              ))}
            </FormSelect>
            <FormInput label="Price min" type="number" className="w-24"
              value={filters.priceMin ?? ""} onChange={(e) => patch({ priceMin: e.target.value === "" ? null : Number(e.target.value) })} />
            <FormInput label="Price max" type="number" className="w-24"
              value={filters.priceMax ?? ""} onChange={(e) => patch({ priceMax: e.target.value === "" ? null : Number(e.target.value) })} />
            <FormInput label="IV rank min" type="number" className="w-24"
              value={filters.ivRankMin ?? ""} onChange={(e) => patch({ ivRankMin: e.target.value === "" ? null : Number(e.target.value) })} />
            <FormInput label="Premium min %" type="number" className="w-28"
              value={filters.premiumMin ?? ""} onChange={(e) => patch({ premiumMin: e.target.value === "" ? null : Number(e.target.value) })} />
            <FormInput label="Min AUM ($B)" type="number" className="w-28"
              value={filters.minAum ?? ""} onChange={(e) => patch({ minAum: e.target.value === "" ? null : Number(e.target.value) })} />
            <FormInput label="Max expense %" type="number" step="0.01" className="w-28"
              value={filters.maxExpenseRatioPct ?? ""} onChange={(e) => patch({ maxExpenseRatioPct: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-content-3">Sector</div>
            <ChipRow options={ref.sectors} selected={filters.sectors ?? []}
              onToggle={(v) => toggleIn("sectors", v)} />
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-content-3">Asset class</div>
            <ChipRow options={ref.assetClasses} selected={filters.assetClasses ?? []}
              onToggle={(v) => toggleIn("assetClasses", v)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => runScreen()} data-testid="etf-apply">Apply filters</Button>
            <Button variant="ghost" size="sm"
              onClick={() => runScreen({ sectors: [], assetClasses: [] }, strategy)}>Clear</Button>
          </div>
        </Card>
      )}

      {/* results */}
      {result && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-content-3">
              {result.total} match — scored for <b className="text-content-1">{STRATEGY_LABEL[result.strategy]}</b>
            </span>
            <FormSelect label="" value={sort} className="py-1"
              onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="score">Sort: Score</option>
              <option value="premium">Sort: Premium %</option>
              <option value="ivRank">Sort: IV rank</option>
              <option value="ytd">Sort: YTD %</option>
              <option value="volume">Sort: Liquidity</option>
              <option value="price">Sort: Price</option>
            </FormSelect>
          </div>

          <div className="card-glass overflow-hidden p-0" data-testid="etf-results">
            <table className="w-full text-sm">
              <thead className="bg-dark-800 text-xs uppercase tracking-wide text-content-3">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Ticker</th>
                  <th className="px-3 py-2 text-left">Sector</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Premium</th>
                  <th className="px-3 py-2 text-right">IV rank</th>
                  <th className="px-3 py-2 text-right">Liquidity</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, i) => (
                  <Fragment key={e.ticker}>
                    <tr data-testid="etf-row"
                      onClick={() => setExpanded(expanded === e.ticker ? null : e.ticker)}
                      className="cursor-pointer border-t border-dark-700 hover:bg-dark-800/50">
                      <td className="px-3 py-2 text-content-3">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono font-semibold">{e.ticker}</span>
                        <span className="ml-2 text-xs text-content-3">{e.issuer}</span>
                        {e.stale && e.hasMetrics && (
                          <span className="ml-1 text-[10px] text-accent-orange" title="Metrics older than a day">stale</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-content-2">{e.sector}</td>
                      <td className="px-3 py-2 text-right font-mono">{e.price == null ? "—" : money(e.price, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-accent-green">{num2(e.annualizedCallPremiumPct, "%")}</td>
                      <td className="px-3 py-2 text-right font-mono">{e.ivRank == null ? "—" : e.ivRank}</td>
                      <td className="px-3 py-2 text-right font-mono text-content-3">{e.callVolume == null ? "—" : e.callVolume.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-accent-primary-text">{(e.score ?? 0).toFixed(1)}</td>
                      <td className="px-3 py-2 text-content-3">{expanded === e.ticker ? "▲" : "▾"}</td>
                    </tr>
                    {expanded === e.ticker && (
                      <tr className="border-t border-dark-700 bg-dark-800/30">
                        <td colSpan={9} className="px-3 py-3">
                          <div className="mb-2 font-medium">{e.name}</div>
                          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                            <MetricBox label="Expense" value={`${e.expenseRatioPct}%`} />
                            <MetricBox label="AUM" value={`$${e.aumBillions}B`} />
                            <MetricBox label="YTD" value={num2(e.ytdReturn, "%")}
                              highlight={(e.ytdReturn ?? 0) >= 0 ? "green" : "red"} />
                            <MetricBox label="ATM IV" value={e.atmIv == null ? "—" : pct(e.atmIv)} />
                            <MetricBox label="~5% call" value={e.otmCallStrike == null ? "—" : money(e.otmCallStrike, 0)} />
                            <MetricBox label="DTE" value={e.dte == null ? "—" : String(e.dte)} />
                          </div>
                          {e.scoreBreakdown && (
                            <div className="mb-3 space-y-1" data-testid="etf-breakdown">
                              {e.scoreBreakdown.map((b) => (
                                <div key={b.key} className="flex items-center gap-2 text-xs">
                                  <span className="w-40 text-content-3">{b.label}</span>
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-dark-700">
                                    <div className="h-full bg-accent-primary" style={{ width: `${b.component * 100}%` }} />
                                  </div>
                                  <span className="w-10 text-right font-mono text-content-2">{b.points.toFixed(1)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <Button size="xs" data-testid="etf-analyze"
                              onClick={(ev) => { ev.stopPropagation(); s.analyzeEtfInDetector(e.ticker); }}>
                              Analyze in Screener →
                            </Button>
                            <Button variant="secondary" size="xs" data-testid="etf-expand-holdings"
                              title="Screen option strategies across every holding of this ETF"
                              onClick={(ev) => { ev.stopPropagation(); s.openIcs(e.ticker); }}>
                              Expand holdings ⌄
                            </Button>
                            <Button variant="ghost" size="xs"
                              onClick={(ev) => { ev.stopPropagation(); s.toggleEtfWatch(e.ticker, !s.etfWatchlist.includes(e.ticker)); }}>
                              {s.etfWatchlist.includes(e.ticker) ? "★ In watchlist" : "☆ Watch"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {result.candidates.length === 0 && (
            <div className="rounded-lg border border-dashed border-dark-600 p-6 text-center text-content-3">
              No ETFs match. Loosen the filters, or refresh data if metric filters are active.
            </div>
          )}
        </>
      )}

      {s.etfWatchlist.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium uppercase tracking-wide text-content-3">Watchlist</h3>
          <div className="flex flex-wrap gap-2" data-testid="etf-watchlist">
            {s.etfWatchlist.map((t) => (
              <Badge key={t} variant="neutral"
                className="card-glass cursor-pointer p-2 font-mono text-accent-primary-text transition-all duration-150 ease-out-quad hover:border-accent-primary/50"
                onClick={() => s.analyzeEtfInDetector(t)} title="Analyze in Screener">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
