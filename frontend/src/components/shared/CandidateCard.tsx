import { money, pct, shortDate, signed, strategyLabel } from "../../lib/format";
import type { RankedCandidate } from "../../types";

interface CandidateCardProps {
  candidate: RankedCandidate;
  exported: boolean;
  saved: boolean;
  onOpen: () => void;
  onExport: () => void;
  onSave: () => void;
}

export default function CandidateCard({
  candidate: c, exported, saved, onOpen, onExport, onSave,
}: CandidateCardProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-sky-400">
          #{c.rank}
        </span>
        <span className="font-medium capitalize">{strategyLabel(c.strategyType)}</span>
        <span className="text-sm text-slate-500">{shortDate(c.expiration)} · {c.daysToExpiry}d</span>
        <span className="ml-auto font-semibold tabular-nums text-sky-300">
          {c.compositeScore.toFixed(1)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-sm tabular-nums">
        <div title="Probability of any profit at expiry">
          <div className="text-xs text-slate-500">POP</div>
          {pct(c.probability.pop)}
        </div>
        <div title="Best case at expiry">
          <div className="text-xs text-slate-500">Max profit</div>
          <span className="text-emerald-400">{money(c.payoff.maxProfit)}</span>
        </div>
        {/* max loss always shown with equal weight to max profit */}
        <div title="Worst case at expiry — the number that sizes your position">
          <div className="text-xs text-slate-500">Max loss</div>
          <span className="text-rose-400">{money(c.payoff.maxLoss)}</span>
        </div>
        <div title="Cash / buying power for one unit">
          <div className="text-xs text-slate-500">Capital</div>
          {money(c.sizing.capitalRequired)}{c.sizing.capitalApproximate ? " ≈" : ""}
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        {c.rationale} · θ {signed(c.metrics.thetaPerDay)}/day
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onOpen}
          className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          Open in Calculator
        </button>
        <button
          onClick={onExport}
          className={`rounded px-3 py-1.5 text-xs font-medium ${
            exported ? "bg-emerald-800 text-emerald-200" : "bg-sky-600 text-white hover:bg-sky-500"
          }`}
          title={c.exportText}
        >
          {exported ? "Copied ✓" : "Export order"}
        </button>
        <button
          onClick={onSave}
          disabled={saved}
          className={`rounded px-3 py-1.5 text-xs ${
            saved
              ? "cursor-default bg-slate-800 text-slate-500"
              : "border border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
          title="Snapshot this trade into your journal"
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
