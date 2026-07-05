import { money, pct, shortDate, signed, strategyLabel } from "../../lib/format";
import Button from "../ui/Button";
import { Badge, Card, CardContent, CardFooter, CardHeader, MetricBox } from "../ui/Card";
import { useMode } from "../../contexts/ModeContext";
import { BEST_FOR } from "../../lib/copy";
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
  const { expertMode } = useMode();
  return (
    <Card glow={c.rank === 1} enterDelayMs={(c.rank - 1) * 50}>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="rounded bg-dark-700 px-2 py-0.5 text-xs font-semibold text-blue-400">
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
            <span className="font-mono font-bold tabular-nums text-accent-blue"
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
          highlight="red" hint="Worst case at expiry — the number that sizes your position" />
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
        ? <p className="mb-3 text-xs text-content-3">{c.rationale}</p>
        : <p className="mb-3 text-xs text-accent-blue">Best for: {BEST_FOR[c.strategyType]}</p>}

      <CardFooter>
        <Button variant="secondary" size="sm" onClick={onOpen}>
          Open in Calculator
        </Button>
        <Button size="sm" onClick={onExport} title={c.exportText}
          className={exported ? "bg-accent-green hover:bg-accent-green" : undefined}>
          {exported ? "Copied ✓" : "Export order"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onSave} disabled={saved}
          title="Snapshot this trade into your journal">
          {saved ? "Saved ✓" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}
