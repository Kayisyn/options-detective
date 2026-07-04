import type { PayoffPoint } from "../../types";

interface PayoffChartProps {
  points: PayoffPoint[];
  breakevens: number[];
}

// Recharts area chart with breakeven reference lines lands in Phase 6.
// The data contract is already final: points from the engine's payoff_curve,
// breakevens from payoff_summary.
export default function PayoffChart({ points, breakevens }: PayoffChartProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
      Payoff diagram — {points.length} points, breakevens at{" "}
      {breakevens.length > 0 ? breakevens.join(", ") : "n/a"}
    </div>
  );
}
