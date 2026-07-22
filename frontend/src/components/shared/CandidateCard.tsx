import { money, pct, shortDate, signed, strategyLabel } from "../../lib/format";
import Button from "../ui/Button";
import { Badge, Card, CardContent, CardFooter, CardHeader, MetricBox } from "../ui/Card";
import ScoreBreakdown from "./ScoreBreakdown";
import { useMode } from "../../contexts/ModeContext";
import { useStore } from "../../store";
import { BEST_FOR } from "../../lib/copy";
import type { RankedCandidate } from "../../types";

interface CandidateCardProps {
  candidate: RankedCandidate;
  exported: boolean;
  saved: boolean;
  /** hero treatment in Optimal Strategies: violet glow regardless of rank */
  featured?: boolean;
  onOpen: () => void;
  onExport: () => void;
  onSave: () => void;
}

export default function CandidateCard({
  candidate: c, exported, saved, featured = false, onOpen, onExport, onSave,
}: CandidateCardProps) {
  const { expertMode } = useMode();
  const weights = useStore((s) => s.weights);
  const openPaperTrade = useStore((s) => s.openPaperTrade);
  return (
    <Card glow={featured || c.rank === 1} liquid={featured || c.rank === 1}
      enterDelayMs={Math.min(c.rank - 1, 8) * 50}>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="rounded bg-accent-primary px-2 py-0.5 text-xs font-semibold text-on-accent">
            #{c.rank}
          </span>
          <div>
            <h3 className="text-lg font-semibold capitalize text-content-1">
              {strategyLabel(c.strategyType)}
            </h3>
            <p className="text-xs text-content-3">
              {shortDate(c.expiration)} · {c.daysToExpiry}d
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={c.probability.pop >= 0.6 ? "green" : "blue"}
            title="Probability of any profit at expiry (lognormal model)">
            {pct(c.probability.pop)} POP
          </Badge>
          {expertMode && (
            <span className="font-mono font-bold tabular-nums text-accent-primary-text"
              title="Composite score (0-10)">
              {c.compositeScore.toFixed(1)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className={expertMode ? "grid grid-cols-4 gap-3" : "grid grid-cols-2 gap-3"}>
        <MetricBox label="Max Profit" value={money(c.payoff.maxProfit)}
          highlight="green" hint="Best case at expiry" />
        {/* max loss always carries equal visual weight to max profit */}
        <MetricBox label="Max Loss" value={money(c.payoff.maxLoss)}
          highlight="red" hint="Worst case at expiry, the number that sizes your position" />
        {expertMode && (
          <>
            <MetricBox
              label="Capital"
              value={<>{money(c.sizing.capitalRequired)}{c.sizing.capitalApproximate ? " ≈" : ""}</>}
              hint="Cash / buying power for one unit"
            />
            <MetricBox label="θ / day" value={signed(c.metrics.thetaPerDay)}
              highlight={c.metrics.thetaPerDay >= 0 ? "green" : "red"}
              hint="Dollars gained (+) or lost (-) per calendar day of time decay" />
          </>
        )}
      </CardContent>

      {expertMode
        ? (
          <div className="mb-3 space-y-2">
            <ScoreBreakdown candidate={c} weights={weights} />
            <p className="text-xs text-content-3">{c.rationale}</p>
          </div>
        )
        : <p className="mb-3 text-xs text-accent-primary-text">Best for: {BEST_FOR[c.strategyType]}</p>}

      <CardFooter>
        <Button size="sm" onClick={onOpen} title="Open in the Trade Analyzer">
          Analyze
        </Button>
        <Button variant="secondary" size="sm" onClick={onExport} title={c.exportText}
          className={exported ? "border-accent-green/60 bg-accent-green/15 text-accent-green" : undefined}>
          {exported ? "Copied ✓" : "Export order"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onSave} disabled={saved}
          title="Snapshot this trade into your Position Log">
          {saved ? "Saved ✓" : "Save"}
        </Button>
        <Button variant="ghost" size="sm"
          onClick={() => openPaperTrade({ candidate: c })}
          title="Open this as a simulated position against your Sandbox budget"
          data-testid="paper-candidate">
          Sandbox
        </Button>
      </CardFooter>
    </Card>
  );
}
