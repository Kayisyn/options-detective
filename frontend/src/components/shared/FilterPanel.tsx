import { ALL_STRATEGY_TYPES } from "../../lib/copy";
import { strategyLabel } from "../../lib/format";
import { compactFieldClasses } from "../ui/Input";
import Button from "../ui/Button";
import { cx } from "../../lib/cx";
import type { CandidateFilters } from "../../lib/candidateQuery";
import type { StrategyType } from "../../types";

// Filter panel for the Detector (v1.1 §1). Everything filters the
// already-screened result set client-side — no refetching.

function NumberField({ label, value, onChange, placeholder, step, hint }: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="block" title={hint}>
      <span className="text-[11px] uppercase tracking-wide text-content-3">{label}</span>
      <input
        type="number"
        step={step ?? "1"}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
        className={cx("mt-0.5 w-full", compactFieldClasses)}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-heading">
        {title}
      </h4>
      {children}
    </div>
  );
}

export default function FilterPanel({ filters, onPatch, onClear, expertMode, activeCount }: {
  filters: CandidateFilters;
  onPatch: (patch: Partial<CandidateFilters>) => void;
  onClear: () => void;
  expertMode: boolean;
  activeCount: number;
}) {
  function toggleStrategy(s: StrategyType) {
    const next = filters.strategies.includes(s)
      ? filters.strategies.filter((x) => x !== s)
      : [...filters.strategies, s];
    onPatch({ strategies: next });
  }

  return (
    <aside
      className="card-glass h-fit w-full shrink-0 space-y-4 p-4 lg:w-60"
      data-testid="filter-panel"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filters</h3>
        {activeCount > 0 && (
          <Button variant="ghost" size="xs" onClick={onClear} data-testid="clear-filters">
            Clear all
          </Button>
        )}
      </div>

      <Section title="Strategy">
        <div className="flex flex-wrap gap-1.5">
          {ALL_STRATEGY_TYPES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStrategy(s)}
              data-strategy-chip={s}
              className={cx(
                "rounded border px-2 py-1 text-xs capitalize transition-all duration-150 ease-out-quad",
                filters.strategies.includes(s)
                  ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                  : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
              )}
            >
              {strategyLabel(s)}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Days to expiry">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Min" value={filters.dteMin}
            onChange={(v) => onPatch({ dteMin: v })} placeholder="5" />
          <NumberField label="Max" value={filters.dteMax}
            onChange={(v) => onPatch({ dteMax: v })} placeholder="90" />
        </div>
      </Section>

      <Section title="POP %">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Min" value={filters.popMin}
            onChange={(v) => onPatch({ popMin: v })} placeholder="50" />
          <NumberField label="Max" value={filters.popMax}
            onChange={(v) => onPatch({ popMax: v })} placeholder="100" />
        </div>
      </Section>

      <Section title="Liquidity">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Min volume" value={filters.minVolume}
            onChange={(v) => onPatch({ minVolume: v })} placeholder="1000" />
          <NumberField label="Max spread %" value={filters.maxSpreadPct} step="0.5"
            onChange={(v) => onPatch({ maxSpreadPct: v })} placeholder="5"
            hint="Positions with unverifiable spreads (market closed) are excluded when this is set" />
        </div>
      </Section>

      <Section title="Capital">
        <NumberField label="Max required $" value={filters.maxCapital} step="100"
          onChange={(v) => onPatch({ maxCapital: v })} placeholder="5000" />
      </Section>

      {expertMode && (
        <Section title="Greeks (expert)">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Delta min" value={filters.deltaMin} step="1"
              onChange={(v) => onPatch({ deltaMin: v })} placeholder="-50"
              hint="Position delta in $ per $1 underlying move" />
            <NumberField label="Delta max" value={filters.deltaMax} step="1"
              onChange={(v) => onPatch({ deltaMax: v })} placeholder="50" />
          </div>
          <div className="mt-2">
            <NumberField label="Theta/day min $" value={filters.thetaMin} step="1"
              onChange={(v) => onPatch({ thetaMin: v })} placeholder="0"
              hint="Set 0 to keep only positions that collect time decay" />
          </div>
        </Section>
      )}
    </aside>
  );
}
