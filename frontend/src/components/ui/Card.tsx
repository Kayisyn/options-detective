import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import Hint from "./Hint";

// Card family per ux-design-polish-brief §2.2 / §2.5. Surfaces ride the
// dark-* CSS variables so the Phase 4 light theme adapts them for free.

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** hover scale/shadow/border feedback + press-in (clickable cards) */
  interactive?: boolean;
  /** rank-#1 treatment: accent-blue glow border (§4.1) */
  glow?: boolean;
  /** staggered entrance: animation-delay in ms (§3.2) */
  enterDelayMs?: number;
}

export function Card({
  interactive = false, glow = false, enterDelayMs, className, style, ...rest
}: CardProps) {
  return (
    <div
      className={cx(
        "rounded-lg border bg-dark-800 p-4 shadow-md",
        glow ? "border-accent-blue/60 shadow-glow" : "border-dark-700",
        interactive && cx(
          "cursor-pointer transition-all duration-200 ease-out",
          "hover:scale-[1.01] hover:shadow-lg active:scale-[0.98]",
          !glow && "hover:border-dark-600",
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
        "mb-3 flex items-center justify-between gap-3 border-b border-dark-700 pb-3",
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
  none: "text-content-1",
};

export function MetricBox({ label, value, highlight = "none", hint }: {
  label: string;
  value: ReactNode;
  highlight?: Highlight;
  hint?: string;
}) {
  const box = (
    <div className={cx("rounded bg-dark-700/50 p-2.5", hint && "cursor-help")}>
      <div className="text-xs uppercase tracking-wide text-content-3">{label}</div>
      <div className={cx("mt-0.5 font-mono font-bold tabular-nums", HIGHLIGHTS[highlight])}>
        {value}
      </div>
    </div>
  );
  // long-hover explainer (§5.2) instead of the native title tooltip
  return hint ? <Hint text={hint} className="block">{box}</Hint> : box;
}

// ---- Badge -----------------------------------------------------------------

type BadgeVariant = "blue" | "green" | "red" | "orange" | "neutral";

const BADGES: Record<BadgeVariant, string> = {
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
        // badge-pulse (§5.1): one gentle pulse when the badge appears
        "animate-badge-pulse inline-flex items-center rounded border px-2 py-1 text-xs font-medium",
        BADGES[variant],
        className,
      )}
      {...rest}
    />
  );
}
