import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";

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
        glow ? "border-blue-500/60 shadow-glow" : "border-dark-700",
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
  return (
    <div className={cx("rounded bg-dark-700/50 p-2.5", hint && "cursor-help")} title={hint}>
      <div className="text-xs uppercase tracking-wide text-content-3">{label}</div>
      <div className={cx("mt-0.5 font-bold tabular-nums", HIGHLIGHTS[highlight])}>
        {value}
      </div>
    </div>
  );
}

// ---- Badge -----------------------------------------------------------------

type BadgeVariant = "blue" | "green" | "red" | "orange" | "neutral";

const BADGES: Record<BadgeVariant, string> = {
  blue: "bg-blue-600/20 text-blue-300 border-blue-500/30",
  green: "bg-emerald-600/20 text-emerald-300 border-emerald-500/30",
  red: "bg-red-600/20 text-red-300 border-red-500/30",
  orange: "bg-amber-600/20 text-amber-300 border-amber-500/30",
  neutral: "bg-dark-700 text-content-2 border-dark-600",
};

export function Badge({ variant = "neutral", className, ...rest }: {
  variant?: BadgeVariant;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded border px-2 py-1 text-xs font-medium",
        BADGES[variant],
        className,
      )}
      {...rest}
    />
  );
}
