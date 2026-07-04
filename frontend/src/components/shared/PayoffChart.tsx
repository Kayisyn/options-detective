import {
  Area, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money } from "../../lib/format";
import type { PayoffPoint } from "../../types";

interface PayoffChartProps {
  points: PayoffPoint[];
  breakevens: number[];
  spot?: number;
}

// P&L at expiry across underlying prices. Green above zero, red below,
// reference lines at each breakeven and the current price.
export default function PayoffChart({ points, breakevens, spot }: PayoffChartProps) {
  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
        No payoff data
      </div>
    );
  }
  const values = points.map((p) => p.profit);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // gradient split point at P&L = 0 (recharts wants a 0..1 offset from top)
  const zeroOffset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);

  return (
    <div className="h-72 w-full" data-testid="payoff-chart">
      <ResponsiveContainer>
        <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#34d399" stopOpacity={0.35} />
              <stop offset={zeroOffset} stopColor="#34d399" stopOpacity={0.04} />
              <stop offset={zeroOffset} stopColor="#f87171" stopOpacity={0.04} />
              <stop offset={1} stopColor="#f87171" stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="underlyingPrice"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => `$${Math.round(v)}`}
            stroke="#475569"
            fontSize={11}
          />
          <YAxis
            tickFormatter={(v: number) => money(v)}
            stroke="#475569"
            fontSize={11}
            width={72}
          />
          <Tooltip
            formatter={(value: number) => [money(value, 0), "P&L at expiry"]}
            labelFormatter={(label: number) => `Underlying ${money(label, 2)}`}
            contentStyle={{
              background: "#0f172a", border: "1px solid #334155",
              borderRadius: 6, fontSize: 12,
            }}
          />
          <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} />
          {breakevens.map((be) => (
            <ReferenceLine
              key={be}
              x={be}
              stroke="#facc15"
              strokeDasharray="4 3"
              label={{ value: `BE ${be.toFixed(2)}`, fill: "#facc15", fontSize: 10, position: "top" }}
            />
          ))}
          {spot !== undefined && (
            <ReferenceLine
              x={spot}
              stroke="#38bdf8"
              strokeDasharray="2 2"
              label={{ value: "now", fill: "#38bdf8", fontSize: 10, position: "insideTopLeft" }}
            />
          )}
          <Area
            type="linear"
            dataKey="profit"
            stroke="#38bdf8"
            strokeWidth={2}
            fill="url(#pnlFill)"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
