import type { Candidate } from "../../types";

interface CandidateCardProps {
  candidate: Candidate;
  onSelect: (candidateId: string) => void;
}

export default function CandidateCard({ candidate, onSelect }: CandidateCardProps) {
  const { payoff, probability } = candidate;
  return (
    <button
      onClick={() => onSelect(candidate.id)}
      className="w-full rounded-lg border border-slate-800 bg-slate-900 p-4 text-left transition-colors hover:border-sky-600"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium capitalize">
          {candidate.strategyType.replaceAll("_", " ")}
        </span>
        <span className="text-sm text-slate-400">{candidate.expiration}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-sm tabular-nums">
        <span>POP {(probability.pop * 100).toFixed(0)}%</span>
        <span className="text-emerald-400">
          Max +{payoff.maxProfit === null ? "∞" : payoff.maxProfit.toFixed(0)}
        </span>
        {/* max loss gets equal visual weight to max profit — always */}
        <span className="text-rose-400">
          Max −{payoff.maxLoss === null ? "∞" : payoff.maxLoss.toFixed(0)}
        </span>
        <span>Score {candidate.compositeScore.toFixed(1)}</span>
      </div>
    </button>
  );
}
