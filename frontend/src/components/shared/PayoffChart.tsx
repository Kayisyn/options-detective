import {
  Area, CartesianGrid, ComposedChart, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money } from "../../lib/format";
import { useTheme } from "../../contexts/ThemeContext";
import type { PayoffPoint } from "../../types";

interface PayoffChartProps {
  points: PayoffPoint[];
  breakevens: number[];
  spot?: number;
  /** null = unbounded — suppresses the corresponding annotation badge */
  maxProfit?: number | null;
  maxLoss?: number | null;
}

// Color coding per ux-design-polish-brief §2.4, resolved from the active
// theme's CSS variables (recharts needs concrete strings, so we read them
// per render; useTheme() makes the chart re-render on theme switches).
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}

function themeColors() {
  return {
    line: cssVar("--od-accent-primary", "#9733FF"),
    profit: cssVar("--od-accent-green", "#10b981"),
    loss: cssVar("--od-accent-red", "#ef4444"),
    breakeven: cssVar("--od-accent-orange", "#f59e0b"),
    spot: cssVar("--od-chart-spot", "#06b6d4"),
    grid: cssVar("--od-dark-700", "#2a3050"),
    panel: cssVar("--od-dark-800", "#1a1f3a"),
    axis: cssVar("--od-text-3", "#9ca3af"),
    zero: cssVar("--od-dark-500", "#64748b"),
  };
}

// Flat payoff segments share the extreme value; annotate the middle of the
// plateau instead of its left edge.
function plateauMidpoint(points: PayoffPoint[], target: number): PayoffPoint {
  const tolerance = Math.max(1e-6, Math.abs(target) * 1e-9);
  const flat = points.filter((p) => Math.abs(p.profit - target) <= tolerance);
  if (flat.length === 0) return points[0];
  return flat[Math.floor(flat.length / 2)];
}

function LegendSwatch({ color, dashed, label }: {
  color: string; dashed?: boolean; label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-4"
        style={dashed
          ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` }
          : { backgroundColor: color }}
      />
      {label}
    </span>
  );
}

// P&L at expiry across underlying prices. Draws left-to-right over 800ms on
// mount and on every recalculation.
export default function PayoffChart({
  points, breakevens, spot, maxProfit, maxLoss,
}: PayoffChartProps) {
  useTheme(); // re-resolve colors when the theme changes
  const COLORS = themeColors();
  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-dark-600 text-sm text-content-3">
        No payoff data
      </div>
    );
  }
  const values = points.map((p) => p.profit);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // gradient split point at P&L = 0 (recharts wants a 0..1 offset from top)
  const zeroOffset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);

  const maxProfitPoint = typeof maxProfit === "number"
    ? plateauMidpoint(points, max) : null;
  const maxLossPoint = typeof maxLoss === "number"
    ? plateauMidpoint(points, min) : null;

  return (
    <div data-testid="payoff-chart">
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <ComposedChart data={points} margin={{ top: 20, right: 16, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={COLORS.profit} stopOpacity={0.35} />
                <stop offset={zeroOffset} stopColor={COLORS.profit} stopOpacity={0.04} />
                <stop offset={zeroOffset} stopColor={COLORS.loss} stopOpacity={0.04} />
                <stop offset={1} stopColor={COLORS.loss} stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} opacity={0.2} />
            <XAxis
              dataKey="underlyingPrice"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => `$${Math.round(v)}`}
              stroke={COLORS.axis}
              fontSize={12}
            />
            <YAxis
              tickFormatter={(v: number) => money(v)}
              stroke={COLORS.axis}
              fontSize={12}
              width={72}
            />
            <Tooltip
              formatter={(value: number) => [money(value, 0), "P&L at expiry"]}
              labelFormatter={(label: number) => `Underlying ${money(label, 2)}`}
              contentStyle={{
                backgroundColor: COLORS.panel,
                border: `1px solid ${COLORS.grid}`,
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <ReferenceLine y={0} stroke={COLORS.zero} strokeWidth={1} />
            {breakevens.map((be) => (
              <ReferenceLine
                key={be}
                x={be}
                stroke={COLORS.breakeven}
                strokeDasharray="4 3"
                label={{ value: `BE ${be.toFixed(2)}`, fill: COLORS.breakeven, fontSize: 10, position: "top" }}
              />
            ))}
            {spot !== undefined && (
              <ReferenceLine
                x={spot}
                stroke={COLORS.spot}
                strokeDasharray="2 2"
                label={{ value: "now", fill: COLORS.spot, fontSize: 10, position: "insideTopLeft" }}
              />
            )}
            {maxProfitPoint && (
              <ReferenceDot
                x={maxProfitPoint.underlyingPrice}
                y={maxProfitPoint.profit}
                r={4}
                fill={COLORS.profit}
                stroke={COLORS.panel}
                strokeWidth={2}
                label={{
                  value: `max +${money(maxProfit as number)}`,
                  fill: COLORS.profit, fontSize: 10, position: "top",
                }}
              />
            )}
            {maxLossPoint && (
              <ReferenceDot
                x={maxLossPoint.underlyingPrice}
                y={maxLossPoint.profit}
                r={4}
                fill={COLORS.loss}
                stroke={COLORS.panel}
                strokeWidth={2}
                label={{
                  value: `max −${money(maxLoss as number)}`,
                  fill: COLORS.loss, fontSize: 10, position: "right",
                }}
              />
            )}
            <Area
              type="linear"
              dataKey="profit"
              stroke={COLORS.line}
              strokeWidth={2}
              fill="url(#pnlFill)"
              isAnimationActive
              animationDuration={800}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* single series, so the legend explains markers rather than toggling */}
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-content-3" data-testid="chart-legend">
        <LegendSwatch color={COLORS.line} label="P&L at expiry" />
        <LegendSwatch color={COLORS.breakeven} dashed label="breakeven" />
        <LegendSwatch color={COLORS.spot} dashed label="spot (now)" />
        {maxProfitPoint && <LegendSwatch color={COLORS.profit} label="max profit" />}
        {maxLossPoint && <LegendSwatch color={COLORS.loss} label="max loss" />}
      </div>
    </div>
  );
}
