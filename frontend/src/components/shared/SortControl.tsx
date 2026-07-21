import { SORT_OPTIONS, type SortKey, type SortSpec } from "../../lib/candidateQuery";
import { cx } from "../../lib/cx";

// Sort dropdown + direction toggle (v1.1 §1), shared by Detector and
// Recommender. Picking a key resets to that key's natural direction.
export default function SortControl({ sort, onChange, className }: {
  sort: SortSpec;
  onChange: (sort: SortSpec) => void;
  className?: string;
}) {
  const active = SORT_OPTIONS.find((o) => o.key === sort.key)!;
  return (
    <div className={cx("flex items-center gap-1.5", className)} data-testid="sort-control">
      <label className="text-xs uppercase tracking-wide text-content-3">Sort</label>
      <select
        value={sort.key}
        title={active.hint}
        onChange={(e) => {
          const key = e.target.value as SortKey;
          const option = SORT_OPTIONS.find((o) => o.key === key)!;
          onChange({ key, dir: option.defaultDir });
        }}
        className="rounded-sm border border-dark-600 bg-dark-700 px-2 py-1.5 text-sm text-content-1 transition-all duration-150 ease-out focus:border-accent-primary focus:outline-none"
        data-testid="sort-select"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      <button
        onClick={() => onChange({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
        title={sort.dir === "asc" ? "Ascending, click for descending" : "Descending, click for ascending"}
        data-testid="sort-dir"
        className="rounded-sm border border-dark-600 bg-dark-700 px-2 py-1.5 text-sm text-content-2 transition-all duration-150 ease-out hover:bg-dark-600"
      >
        {sort.dir === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}
