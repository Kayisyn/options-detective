import { Fragment, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { money, num, pct } from "../lib/format";
import { api } from "../lib/api";
import { downloadWatchlistCsv } from "../lib/journalCsv";
import {
  bumpUsage, createTemplate, listTemplates, type StrategyTemplate,
} from "../lib/templates";
import { cx } from "../lib/cx";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { RadarIcon } from "./ui/Icons";
import { Badge, Card, MetricBox } from "./ui/Card";
import { FormInput, FormSelect } from "./ui/Input";
import type { EtfFilters, EtfRecord, EtfStrategy } from "../types";

// Asset Screener. v1.7.0: full filter set (yield / 52w performance / ATR
// volatility / theta rank / options volume + quick band presets), primary +
// secondary sorting, configurable + reorderable columns (persisted), and
// rule-based strategy recommendations per ETF. All metrics backend-fetched;
// this view filters/ranks presentation only.

const STRATEGY_LABEL: Record<EtfStrategy, string> = {
  covered_call: "Covered call",
  csp: "Cash-secured put",
  spread: "Spread",
};

// ---- sorting ---------------------------------------------------------------
// Each key carries its natural direction (spec §sorting): metrics missing on
// a row always sort last regardless of direction.
type SortKey =
  | "score" | "premium" | "ivRank" | "price" | "volume" | "ytd"
  | "expense" | "aum" | "yield" | "perf52w" | "volatility" | "thetaRank";

const SORT_OPTIONS: Array<{ id: SortKey; label: string; dir: 1 | -1 }> = [
  { id: "score", label: "Score", dir: -1 },
  { id: "ivRank", label: "IV rank (high → low)", dir: -1 },
  { id: "premium", label: "Premium % (high → low)", dir: -1 },
  { id: "expense", label: "Expense ratio (low → high)", dir: 1 },
  { id: "aum", label: "AUM (largest → smallest)", dir: -1 },
  { id: "yield", label: "Dividend yield (high → low)", dir: -1 },
  { id: "perf52w", label: "52w performance (best → worst)", dir: -1 },
  { id: "volatility", label: "Volatility (high → low)", dir: -1 },
  { id: "volume", label: "Options volume (most liquid)", dir: -1 },
  { id: "thetaRank", label: "Theta rank (best → worst)", dir: -1 },
  { id: "price", label: "Price (low → high)", dir: 1 },
  { id: "ytd", label: "YTD % (best → worst)", dir: -1 },
];

function metricValue(e: EtfRecord, key: SortKey): number | null {
  switch (key) {
    case "premium": return e.annualizedCallPremiumPct;
    case "ivRank": return e.ivRank;
    case "price": return e.price;
    case "volume": return e.callVolume;
    case "ytd": return e.ytdReturn;
    case "expense": return e.expenseRatioPct;
    case "aum": return e.aumBillions;
    case "yield": return e.dividendYieldPct;
    case "perf52w": return e.perf52wPct;
    case "volatility": return e.atrPct20;
    case "thetaRank": return e.thetaRank;
    default: return e.score ?? 0;
  }
}

function compareBy(key: SortKey) {
  const dir = SORT_OPTIONS.find((o) => o.id === key)?.dir ?? -1;
  return (a: EtfRecord, b: EtfRecord) => {
    const va = metricValue(a, key);
    const vb = metricValue(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;  // missing metrics sink to the bottom
    if (vb == null) return -1;
    return (va - vb) * dir;
  };
}

// ---- configurable columns (v1.7.0) ----------------------------------------
// Ticker leads and Score trails always; everything between is toggleable and
// reorderable, persisted per machine.
interface ColumnDef {
  id: string;
  label: string;
  defaultOn: boolean;
  render: (e: EtfRecord) => React.ReactNode;
}

const num2 = (v: number | null, suffix = "") => (v == null ? "—" : `${num(v, 2)}${suffix}`);
const signedPct = (v: number | null) =>
  v == null ? <span>—</span> : (
    <span className={v >= 0 ? "text-accent-green" : "text-accent-red"}>
      {v >= 0 ? "+" : ""}{num(v, 1)}%
    </span>
  );

const ALL_COLUMNS: ColumnDef[] = [
  { id: "sector", label: "Sector", defaultOn: true, render: (e) => <span className="text-content-2">{e.sector}</span> },
  { id: "price", label: "Price", defaultOn: true, render: (e) => (e.price == null ? "—" : money(e.price, 2)) },
  { id: "premium", label: "Premium", defaultOn: true, render: (e) => <span className="text-accent-green">{num2(e.annualizedCallPremiumPct, "%")}</span> },
  { id: "ivRank", label: "IV rank", defaultOn: true, render: (e) => (e.ivRank == null ? "—" : e.ivRank) },
  { id: "expense", label: "Exp ratio", defaultOn: true, render: (e) => `${e.expenseRatioPct}%` },
  { id: "yield", label: "Dividend", defaultOn: true, render: (e) => num2(e.dividendYieldPct, "%") },
  { id: "aum", label: "AUM", defaultOn: true, render: (e) => `$${e.aumBillions}B` },
  { id: "volume", label: "Opt volume", defaultOn: false, render: (e) => (e.callVolume == null ? "—" : e.callVolume.toLocaleString()) },
  { id: "perf52w", label: "52w perf", defaultOn: false, render: (e) => signedPct(e.perf52wPct) },
  { id: "volatility", label: "20d ATR", defaultOn: false, render: (e) => num2(e.atrPct20, "%") },
  { id: "thetaRank", label: "Theta rank", defaultOn: false, render: (e) => (e.thetaRank == null ? "—" : e.thetaRank) },
  { id: "ytd", label: "YTD", defaultOn: false, render: (e) => signedPct(e.ytdReturn) },
];

const COLUMNS_KEY = "od.etfColumns.v1";

interface ColumnConfig { order: string[]; visible: string[] }

const DEFAULT_COLUMNS: ColumnConfig = {
  order: ALL_COLUMNS.map((c) => c.id),
  visible: ALL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.id),
};

function readColumns(): ColumnConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "null") as ColumnConfig | null;
    if (!parsed || !Array.isArray(parsed.order) || !Array.isArray(parsed.visible)) {
      return { ...DEFAULT_COLUMNS };
    }
    const known = new Set(ALL_COLUMNS.map((c) => c.id));
    const order = parsed.order.filter((id) => known.has(id));
    for (const c of ALL_COLUMNS) if (!order.includes(c.id)) order.push(c.id);
    return { order, visible: parsed.visible.filter((id) => known.has(id)) };
  } catch {
    return { ...DEFAULT_COLUMNS };
  }
}

function writeColumns(cfg: ColumnConfig) {
  try {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(cfg));
  } catch { /* private mode */ }
}

// ---- quick filter bands (spec presets) -------------------------------------
interface Band { label: string; patch: Partial<EtfFilters> }

const BANDS: Array<{ title: string; clear: Array<keyof EtfFilters>; bands: Band[] }> = [
  {
    title: "Expense ratio", clear: ["maxExpenseRatioPct"],
    bands: [
      { label: "Low cost (<0.1%)", patch: { maxExpenseRatioPct: 0.1 } },
      { label: "Standard (≤0.5%)", patch: { maxExpenseRatioPct: 0.5 } },
    ],
  },
  {
    title: "Dividend yield", clear: ["yieldMin", "yieldMax"],
    bands: [
      { label: "Growth (<0.5%)", patch: { yieldMax: 0.5 } },
      { label: "Income (0.5–3%)", patch: { yieldMin: 0.5, yieldMax: 3 } },
      { label: "High yield (>3%)", patch: { yieldMin: 3 } },
    ],
  },
  {
    title: "52-week performance", clear: ["perf52wMin", "perf52wMax"],
    bands: [
      { label: "Bullish (>+10%)", patch: { perf52wMin: 10 } },
      { label: "Neutral (±10%)", patch: { perf52wMin: -10, perf52wMax: 10 } },
      { label: "Bearish (<-10%)", patch: { perf52wMax: -10 } },
    ],
  },
  {
    title: "Volatility (20d ATR)", clear: ["atrMin", "atrMax"],
    bands: [
      { label: "Low (<5%)", patch: { atrMax: 5 } },
      { label: "Medium (5–15%)", patch: { atrMin: 5, atrMax: 15 } },
      { label: "High (>15%)", patch: { atrMin: 15 } },
    ],
  },
  {
    // spec thresholds (50k/500k) are single-name-scale; this curated ETF
    // universe trades ~10²-10⁴ contracts per expiration, so the bands are
    // scaled to it
    title: "Options volume", clear: ["minCallVolume"],
    bands: [
      { label: "Liquid (>1k)", patch: { minCallVolume: 1000 } },
      { label: "Highly liquid (>10k)", patch: { minCallVolume: 10_000 } },
    ],
  },
];

function bandActive(filters: EtfFilters, group: (typeof BANDS)[number], band: Band): boolean {
  return group.clear.every((key) => {
    const want = (band.patch as Record<string, unknown>)[key] ?? null;
    return (filters[key] ?? null) === want;
  });
}

// ---- strategy recommendations (v1.7.0, spec logic on our metrics) ----------
interface Rec { name: string; reason: string; confidence: "high" | "medium" | "low" }

function recommendStrategies(e: EtfRecord): Rec[] {
  const recs: Rec[] = [];
  const iv = e.ivRank;
  const yld = e.dividendYieldPct;
  const vol = e.callVolume;
  if (iv == null) return recs; // no IV data -> no honest recommendation
  if (iv > 70 && (yld ?? 0) > 1) {
    recs.push({ name: "Covered Calls", reason: "High IV + dividend income", confidence: "high" });
  }
  if (iv > 65 && (yld ?? 0) > 0.5) {
    recs.push({ name: "Cash-Secured Puts", reason: "Rich premium on a yielding fund", confidence: "high" });
  }
  if (iv > 70 && (vol ?? 0) > 3000) {
    recs.push({ name: "Iron Condors", reason: "High IV + liquid chain", confidence: "medium" });
  }
  if (iv <= 70) {
    recs.push({ name: "Vertical Spreads", reason: "Defined risk, low cost to establish", confidence: "medium" });
  }
  if (iv < 50) {
    recs.push({ name: "Long Calls / Puts", reason: "Low IV — options are cheap for directional plays", confidence: "low" });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
}

const CONFIDENCE_BADGE: Record<Rec["confidence"], "green" | "orange" | "neutral"> = {
  high: "green", medium: "orange", low: "neutral",
};

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

// Column settings popover: checkboxes + reorder (drag or ▲▼) + reset.
function ColumnSettings({ config, onChange, onClose }: {
  config: ColumnConfig;
  onChange: (cfg: ColumnConfig) => void;
  onClose: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function toggle(id: string) {
    const visible = config.visible.includes(id)
      ? config.visible.filter((v) => v !== id)
      : [...config.visible, id];
    onChange({ ...config, visible });
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= config.order.length || from === to) return;
    const order = [...config.order];
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    onChange({ ...config, order });
  }

  return (
    <Card className="space-y-1.5" data-testid="etf-columns-panel">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-heading">Columns</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="xs" data-testid="etf-columns-reset"
            onClick={() => onChange({ ...DEFAULT_COLUMNS })}>
            Reset to default
          </Button>
          <Button variant="ghost" size="xs" onClick={onClose}>✕</Button>
        </div>
      </div>
      <ul className="space-y-1">
        {config.order.map((id, i) => {
          const col = ALL_COLUMNS.find((c) => c.id === id);
          if (!col) return null;
          return (
            <li key={id} draggable data-column-row={id}
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) { move(dragIndex, i); setDragIndex(i); }
              }}
              className={cx(
                "flex items-center gap-2 rounded border border-dark-600 bg-dark-700/50 px-2 py-1.5 text-sm",
                dragIndex === i && "border-accent-primary/60",
              )}>
              <span aria-hidden className="cursor-grab select-none text-content-3">⋮⋮</span>
              <label className="flex flex-1 items-center gap-2">
                <input type="checkbox" checked={config.visible.includes(id)}
                  onChange={() => toggle(id)} className="accent-accent-primary" />
                <span className="text-content-2">{col.label}</span>
              </label>
              <button onClick={() => move(i, i - 1)} disabled={i === 0}
                aria-label={`Move ${col.label} up`}
                className="px-1 text-xs text-content-3 hover:text-content-1 disabled:opacity-30">▲</button>
              <button onClick={() => move(i, i + 1)} disabled={i === config.order.length - 1}
                aria-label={`Move ${col.label} down`}
                className="px-1 text-xs text-content-3 hover:text-content-1 disabled:opacity-30">▼</button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function EtfScreener() {
  // v1.10.1: field selectors — see Recommender for the rationale
  const s = useStore(useShallow((st) => ({
    account: st.account, etfBusy: st.etfBusy, etfReference: st.etfReference,
    etfResult: st.etfResult, etfWatchlist: st.etfWatchlist,
    loadEtfReference: st.loadEtfReference, screenEtf: st.screenEtf,
    refreshEtfMetrics: st.refreshEtfMetrics, toggleEtfWatch: st.toggleEtfWatch,
    analyzeEtfInDetector: st.analyzeEtfInDetector, openIcs: st.openIcs,
    showToast: st.showToast,
  })));
  const [strategy, setStrategy] = useState<EtfStrategy>("covered_call");
  const [filters, setFilters] = useState<EtfFilters>({ sectors: [], assetClasses: [] });
  const [sort, setSort] = useState<SortKey>("score");
  const [sort2, setSort2] = useState<SortKey | "">("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState<ColumnConfig>(readColumns);
  // v1.8.1 strategy templates (per-account saves; presets stay read-only)
  const username = s.account?.username ?? "default";
  const [myTemplates, setMyTemplates] = useState<StrategyTemplate[]>(() => listTemplates(username));
  const [saveTplOpen, setSaveTplOpen] = useState(false);

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

  // load-template dropdown: "tpl:<id>" = user save, "preset:<id>" = built-in
  function applyTemplateChoice(choice: string) {
    if (choice.startsWith("preset:")) {
      applyPreset(choice.slice(7));
      return;
    }
    const t = myTemplates.find((x) => x.id === choice.slice(4));
    if (!t) return;
    runScreen({ sectors: [], assetClasses: [], ...t.filters }, t.strategy);
    bumpUsage(username, t.id);
    setMyTemplates(listTemplates(username));
    s.showToast(`✓ Loaded "${t.name}"`);
  }

  function toggleIn<T extends string>(key: "sectors" | "assetClasses", value: T) {
    const cur = (filters[key] as T[] | undefined) ?? [];
    patch({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] } as Partial<EtfFilters>);
  }

  function toggleBand(group: (typeof BANDS)[number], band: Band) {
    if (bandActive(filters, group, band)) {
      const cleared: Partial<EtfFilters> = {};
      for (const key of group.clear) (cleared as Record<string, unknown>)[key] = null;
      patch(cleared);
    } else {
      const cleared: Partial<EtfFilters> = {};
      for (const key of group.clear) (cleared as Record<string, unknown>)[key] = null;
      patch({ ...cleared, ...band.patch });
    }
  }

  function updateColumns(cfg: ColumnConfig) {
    setColumns(cfg);
    writeColumns(cfg);
  }

  const sorted = useMemo(() => {
    if (!result) return [];
    const primary = compareBy(sort);
    const secondary = sort2 ? compareBy(sort2) : null;
    return [...result.candidates].sort((a, b) => {
      const p = primary(a, b);
      if (p !== 0 || !secondary) return p;
      return secondary(a, b);
    });
  }, [result, sort, sort2]);

  const visibleColumns = columns.order
    .filter((id) => columns.visible.includes(id))
    .map((id) => ALL_COLUMNS.find((c) => c.id === id)!)
    .filter(Boolean);

  const numInput = (label: string, key: keyof EtfFilters, opts: { step?: string; width?: string } = {}) => (
    <FormInput label={label} type="number" step={opts.step} className={opts.width ?? "w-24"}
      value={(filters[key] as number | null | undefined) ?? ""}
      onChange={(e) => patch({ [key]: e.target.value === "" ? null : Number(e.target.value) } as Partial<EtfFilters>)} />
  );

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
          title="Fetch live price, IV rank, yield, volatility and premium for the whole universe (~1 min)"
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
          data-testid="etf-toggle-filters"
          className="rounded-md border border-dark-600 px-3 py-2 text-sm text-content-3 hover:text-content-2">
          {showFilters ? "Hide filters" : "Custom filters"}
        </button>
        {/* v1.8.1: load a saved template or a built-in preset */}
        <select value="" data-testid="etf-load-template" aria-label="Load template"
          onChange={(e) => { if (e.target.value) applyTemplateChoice(e.target.value); }}
          className="rounded-md border border-dark-600 bg-dark-800 px-2.5 py-2 text-sm text-content-3 focus:border-accent-primary focus:outline-none">
          <option value="">Load template…</option>
          {myTemplates.length > 0 && (
            <optgroup label="My templates">
              {myTemplates.map((t) => (
                <option key={t.id} value={`tpl:${t.id}`}>{t.name}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="Default templates">
            {ref?.presets.map((p) => (
              <option key={p.id} value={`preset:${p.id}`}>{p.name}</option>
            ))}
          </optgroup>
        </select>
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
            {numInput("Price min", "priceMin")}
            {numInput("Price max", "priceMax")}
            {numInput("IV rank min", "ivRankMin")}
            {numInput("IV rank max", "ivRankMax")}
            {numInput("Premium min %", "premiumMin", { width: "w-28" })}
            {numInput("Min AUM ($B)", "minAum", { width: "w-28" })}
            {numInput("Max expense %", "maxExpenseRatioPct", { step: "0.01", width: "w-28" })}
          </div>
          {/* v1.7.0 metric filters */}
          <div className="flex flex-wrap items-end gap-3">
            {numInput("Yield min %", "yieldMin", { step: "0.1" })}
            {numInput("Yield max %", "yieldMax", { step: "0.1" })}
            {numInput("52w perf min %", "perf52wMin", { width: "w-28" })}
            {numInput("52w perf max %", "perf52wMax", { width: "w-28" })}
            {numInput("ATR min %", "atrMin", { step: "0.5" })}
            {numInput("ATR max %", "atrMax", { step: "0.5" })}
            {numInput("Theta rank min", "thetaRankMin", { width: "w-28" })}
            {numInput("Min opt volume", "minCallVolume", { width: "w-28" })}
          </div>
          {/* quick bands (spec presets) */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="etf-bands">
            {BANDS.map((group) => (
              <div key={group.title}>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-content-3">{group.title}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.bands.map((band) => (
                    <button key={band.label} onClick={() => toggleBand(group, band)}
                      className={cx(
                        "rounded border px-2 py-1 text-xs transition-all duration-150 ease-out-quad",
                        bandActive(filters, group, band)
                          ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                          : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
                      )}>
                      {band.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
            <Button variant="secondary" size="sm" data-testid="etf-save-template"
              onClick={() => setSaveTplOpen(true)}>
              Save as Template
            </Button>
          </div>
        </Card>
      )}

      <SaveTemplateModal open={saveTplOpen} onClose={() => setSaveTplOpen(false)}
        onSave={(name, description) => {
          createTemplate(username, { name, description, strategy, filters });
          setMyTemplates(listTemplates(username));
          setSaveTplOpen(false);
          s.showToast(`✓ Template "${name}" saved`);
        }} />

      {/* results */}
      {result && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-content-3">
              {result.total} match — scored for <b className="text-content-1">{STRATEGY_LABEL[result.strategy]}</b>
            </span>
            <FormSelect label="" value={sort} className="py-1" data-testid="etf-sort"
              onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>Sort: {o.label}</option>)}
            </FormSelect>
            <FormSelect label="" value={sort2} className="py-1" data-testid="etf-sort2"
              onChange={(e) => setSort2(e.target.value as SortKey | "")}>
              <option value="">then: —</option>
              {SORT_OPTIONS.filter((o) => o.id !== sort).map((o) => (
                <option key={o.id} value={o.id}>then: {o.label}</option>
              ))}
            </FormSelect>
            <button onClick={() => setShowColumns((v) => !v)}
              data-testid="etf-columns-toggle"
              className="ml-auto rounded-md border border-dark-600 px-2.5 py-1 text-xs text-content-3 transition-colors hover:text-content-1">
              Columns ⚙
            </button>
          </div>

          {showColumns && (
            <ColumnSettings config={columns} onChange={updateColumns}
              onClose={() => setShowColumns(false)} />
          )}

          <div className="card-glass overflow-x-auto p-0" data-testid="etf-results">
            <table className="w-full text-sm">
              <thead className="bg-dark-800 text-xs uppercase tracking-wide text-content-3">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Ticker</th>
                  {visibleColumns.map((c) => (
                    <th key={c.id} className={cx("px-3 py-2", c.id === "sector" ? "text-left" : "text-right")}>
                      {c.label}
                    </th>
                  ))}
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
                      {visibleColumns.map((c) => (
                        <td key={c.id} className={cx(
                          "px-3 py-2 font-mono",
                          c.id === "sector" ? "text-left font-sans" : "text-right",
                        )}>
                          {c.render(e)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-mono font-bold text-accent-primary-text">{(e.score ?? 0).toFixed(1)}</td>
                      <td className="px-3 py-2 text-content-3">{expanded === e.ticker ? "▲" : "▾"}</td>
                    </tr>
                    {expanded === e.ticker && (
                      <tr className="border-t border-dark-700 bg-dark-800/30">
                        <td colSpan={visibleColumns.length + 4} className="px-3 py-3">
                          <div className="mb-2 font-medium">{e.name}</div>
                          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                            <MetricBox label="Expense" value={`${e.expenseRatioPct}%`} />
                            <MetricBox label="AUM" value={`$${e.aumBillions}B`} />
                            <MetricBox label="Yield" value={num2(e.dividendYieldPct, "%")} />
                            <MetricBox label="52w perf" value={e.perf52wPct == null ? "—" : `${e.perf52wPct >= 0 ? "+" : ""}${num(e.perf52wPct, 1)}%`}
                              highlight={(e.perf52wPct ?? 0) >= 0 ? "green" : "red"} />
                            <MetricBox label="20d ATR" value={num2(e.atrPct20, "%")} />
                            <MetricBox label="Theta rank" value={e.thetaRank == null ? "—" : String(e.thetaRank)}
                              hint="Percentile of annualized call premium across the universe — higher favors option sellers" />
                            <MetricBox label="ATM IV" value={e.atmIv == null ? "—" : pct(e.atmIv)} />
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

                          {/* v1.7.0 rule-based strategy recommendations */}
                          {(() => {
                            const recs = recommendStrategies(e);
                            if (recs.length === 0) return null;
                            return (
                              <div className="mb-3" data-testid="etf-recommendations">
                                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-heading">
                                  Recommended strategies
                                  <span className="ml-2 normal-case text-content-3">
                                    based on IV rank {e.ivRank}, yield {num2(e.dividendYieldPct, "%")}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {recs.map((r) => (
                                    <div key={r.name} className="flex flex-wrap items-center gap-2 text-sm">
                                      <Badge variant={CONFIDENCE_BADGE[r.confidence]}>{r.confidence}</Badge>
                                      <span className="font-medium text-content-1">{r.name}</span>
                                      <span className="text-xs text-content-3">{r.reason}</span>
                                      <Button variant="ghost" size="xs" className="ml-auto"
                                        data-testid="etf-view-chains"
                                        title={`Open ${e.ticker} in the Screener to build this strategy`}
                                        onClick={(ev) => { ev.stopPropagation(); s.analyzeEtfInDetector(e.ticker); }}>
                                        View Chains →
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <Button size="sm" data-testid="etf-expand-holdings"
                              className="od-halo basis-[45%] grow-0"
                              title="Screen option strategies across every holding of this ETF"
                              onClick={(ev) => { ev.stopPropagation(); s.openIcs(e.ticker); }}>
                              <RadarIcon className="h-4 w-4" />
                              Screen Holdings
                            </Button>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="secondary" size="sm" data-testid="etf-analyze"
                                title="Screen the whole fund in the main Screener"
                                onClick={(ev) => { ev.stopPropagation(); s.analyzeEtfInDetector(e.ticker); }}>
                                Analyze Fund
                              </Button>
                              <Button variant="secondary" size="sm"
                                onClick={(ev) => { ev.stopPropagation(); s.toggleEtfWatch(e.ticker, !s.etfWatchlist.includes(e.ticker)); }}>
                                {s.etfWatchlist.includes(e.ticker) ? "★ In Watchlist" : "Add to Watchlist"}
                              </Button>
                            </div>
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
          <div className="mb-1 flex items-center gap-3">
            <h3 className="text-sm font-medium uppercase tracking-wide text-heading">Watchlist</h3>
            {/* v1.8.0: watchlist rows as CSV (fresh records at click time) */}
            <button
              data-testid="watchlist-export-csv"
              className="text-xs text-content-3 underline underline-offset-2 transition-colors duration-150 hover:text-accent-primary-text"
              onClick={async () => {
                try {
                  const { etfs } = await api.etfWatchlist();
                  downloadWatchlistCsv(etfs);
                  s.showToast("✓ Watchlist CSV downloaded");
                } catch {
                  s.showToast("Watchlist export failed");
                }
              }}>
              Export CSV
            </button>
          </div>
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

// v1.8.1: name + optional description for the current filter set. Managing
// saves (rename, duplicate, delete, file export/import) lives in
// Settings → Templates.
function SaveTemplateModal({ open, onClose, onSave }: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function submit() {
    if (!name.trim()) return;
    onSave(name, description);
    setName("");
    setDescription("");
  }

  return (
    <Modal open={open} onClose={onClose} testid="save-template-modal" maxWidth="max-w-sm">
      <h2 className="text-lg font-semibold">Save as Template</h2>
      <p className="mt-1 text-sm text-content-3">
        Saves the current strategy and every filter, ready to reload from the
        “Load template…” menu.
      </p>
      <div className="mt-3 space-y-2">
        <FormInput label="Template name" value={name} autoFocus
          placeholder="Bullish spreads — IV rank > 70"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          data-testid="template-name" />
        <FormInput label="Description (optional)" value={description}
          placeholder="4-6 week calls, tight spreads"
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          data-testid="template-description" />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!name.trim()} onClick={submit} data-testid="template-save">
          Save Template
        </Button>
      </div>
    </Modal>
  );
}
