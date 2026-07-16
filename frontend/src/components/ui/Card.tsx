import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import Hint from "./Hint";

// Card family, v1.4.0 obsidian overhaul: every card is a glassmorphic
// surface (glass fill, 30px backdrop blur, 1px glass edge, soft shadow —
// .card-glass in index.css). Interactive cards get the violet hover glow +
// scale 1.01; rank-#1 cards get the violet glow border.

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** hover scale/glow feedback + press-in (clickable cards) */
  interactive?: boolean;
  /** rank-#1 treatment: violet glow border */
  glow?: boolean;
  /** v1.5.0 liquid-glass shimmer (opt-in: hero/stat/panel surfaces, not
      100-row result lists — keeps the compositor layer count sane) */
  liquid?: boolean;
  /** staggered entrance: animation-delay in ms */
  enterDelayMs?: number;
}

export function Card({
  interactive = false, glow = false, liquid = false, enterDelayMs, className,
  style, ...rest
}: CardProps) {
  return (
    <div
      className={cx(
        "card-glass p-4",
        liquid && "liquid-glass",
        glow && "border-accent-primary/60 shadow-glow",
        interactive && cx(
          "card-glass-hover cursor-pointer active:scale-[0.99]",
        ),
        enterDelayMs !== undefined && "animate-card-enter",
        className,
      )}
      style={enterDelayMs !== undefined
        ? { ...style, animationDelay: `${enterDelayMs}ms` }
        : style}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-3",
        className,
      )}
      {...rest}
    />
  );
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("mb-4", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("flex items-center gap-2", className)} {...rest} />;
}

// ---- MetricBox -------------------------------------------------------------

type Highlight = "green" | "red" | "orange" | "none";

const HIGHLIGHTS: Record<Highlight, string> = {
  green: "text-accent-green",
  red: "text-accent-red",
  orange: "text-accent-orange",
  // brand emphasis: neutral metrics read in the AA-safe violet tint
  none: "text-accent-primary-text",
};

export function MetricBox({ label, value, highlight = "none", hint }: {
  label: string;
  value: ReactNode;
  highlight?: Highlight;
  hint?: string;
}) {
  const box = (
    <div className={cx("rounded-md bg-dark-700/50 p-2.5", hint && "cursor-help")}>
      <div className="text-xs uppercase tracking-wide text-heading">{label}</div>
      <div className={cx("mt-0.5 font-mono font-bold tabular-nums", HIGHLIGHTS[highlight])}>
        {value}
      </div>
    </div>
  );
  // long-hover explainer instead of the native title tooltip
  return hint ? <Hint text={hint} className="block">{box}</Hint> : box;
}

// ---- PctBadge (v1.5.0 journal % metrics) ------------------------------------

// Small glassmorphic percentage chip: mono digits, green/red by sign,
// neutral for muted context values (account impact).
export function PctBadge({ value, suffix, title, muted = false }: {
  value: number;
  suffix?: string;
  title?: string;
  muted?: boolean;
}) {
  const tone = muted
    ? "border-dark-600 text-content-2"
    : value > 0
      ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
      : value < 0
        ? "border-accent-red/30 bg-accent-red/10 text-accent-red"
        : "border-dark-600 text-content-2";
  return (
    <span
      title={title}
      data-testid="pct-badge"
      className={cx(
        "inline-flex items-baseline gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
        tone,
      )}
    >
      {!muted && value > 0 ? "+" : ""}{value.toFixed(1)}%
      {suffix && <span className="font-normal text-content-3"> {suffix}</span>}
    </span>
  );
}

// ---- Badge -----------------------------------------------------------------

type BadgeVariant = "violet" | "blue" | "green" | "red" | "orange" | "neutral";

const BADGES: Record<BadgeVariant, string> = {
  violet: "bg-accent-primary text-on-accent border-accent-primary",
  blue: "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
  green: "bg-accent-green/15 text-accent-green border-accent-green/30",
  red: "bg-accent-red/15 text-accent-red border-accent-red/30",
  orange: "bg-accent-orange/15 text-accent-orange border-accent-orange/30",
  neutral: "bg-dark-700 text-content-2 border-dark-600",
};

export function Badge({ variant = "neutral", className, ...rest }: {
  variant?: BadgeVariant;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        // one gentle pulse when the badge appears
        "animate-badge-pulse inline-flex items-center rounded border px-2 py-1 text-xs font-medium",
        BADGES[variant],
        className,
      )}
      {...rest}
    />
  );
}
