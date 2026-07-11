import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";
import { motionDisabled } from "../../lib/motionPref";

// Button system, v1.4.0 obsidian overhaul: violet primary CTAs with hover
// glow, press scale 0.95 + ripple. Radius scale rule: interactive controls
// are 8px (rounded-md), containers are 12px (rounded-lg).

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: cx(
    // v1.5.0: od-halo = breathing neon halo + inner shimmer (index.css)
    "od-btn-primary od-halo bg-accent-primary text-on-accent shadow-glass",
    "hover:bg-accent-primary-hover hover:scale-[1.02]",
    "active:scale-[0.95]",
    "disabled:bg-dark-600 disabled:text-content-2",
  ),
  secondary: cx(
    "border border-accent-primary/60 bg-accent-primary/10 text-accent-primary-text",
    "hover:border-accent-primary hover:bg-accent-primary/20 hover:text-content-1",
    "active:scale-[0.97]",
  ),
  ghost: cx(
    "bg-transparent text-content-2",
    "hover:bg-dark-700 hover:text-content-1",
    "active:text-accent-primary-text",
  ),
  destructive: cx(
    "od-btn-destructive bg-accent-red text-white shadow-glass",
    "hover:brightness-110 hover:shadow-lg",
    "active:brightness-90 active:scale-[0.95]",
  ),
};

const SIZES: Record<ButtonSize, string> = {
  xs: "px-2.5 py-1.5 text-xs",
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-base",
  lg: "px-6 py-3.5 text-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Ripple: spawn an expanding circle at the click point, inside a clipped
// overlay layer (the button root can't be overflow-hidden anymore — the
// v1.5.0 halo glow has to escape the box). Plain DOM on purpose — the
// ripple is fire-and-forget and outside React's interest.
function spawnRipple(e: React.PointerEvent<HTMLButtonElement>) {
  if (motionDisabled()) return;
  const button = e.currentTarget;
  const layer = button.querySelector("[data-ripple-layer]");
  if (!layer) return;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement("span");
  // the ripple takes the button's text color at 40%, so it stays visible
  // on every variant in both themes (white on violet, black on the B&W
  // theme's white primary fill)
  ripple.className = "animate-ripple pointer-events-none absolute rounded-full";
  ripple.style.backgroundColor = "color-mix(in srgb, currentcolor 40%, transparent)";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  layer.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
  setTimeout(() => ripple.remove(), 500); // backstop
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", onPointerDown,
    children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      onPointerDown={(e) => {
        spawnRipple(e);
        onPointerDown?.(e);
      }}
      className={cx(
        "relative",
        "inline-flex items-center justify-center gap-2 rounded-md font-medium",
        "transition-all duration-150 ease-out-quad",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "disabled:hover:scale-100 disabled:hover:shadow-none disabled:hover:brightness-100",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
      <span
        aria-hidden
        data-ripple-layer
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      />
    </button>
  );
});

export default Button;
