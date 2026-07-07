import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

// Button system per ux-design-polish-brief §2.1, theme-aware since Phase 4:
// colors ride the accent CSS variables, hover/active shades come from
// brightness so every theme keeps correct feedback. 150ms ease-out.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: cx(
    "bg-accent-blue text-white shadow-md",
    "hover:brightness-110 hover:scale-[1.02] hover:shadow-lg",
    "active:brightness-90 active:scale-[0.98]",
    "disabled:bg-gray-600",
  ),
  secondary: cx(
    "border-2 border-accent-blue bg-transparent text-accent-blue",
    "hover:bg-accent-blue/10 hover:brightness-110",
    "active:brightness-90",
  ),
  ghost: cx(
    "bg-transparent text-content-2",
    "hover:bg-dark-700 hover:text-content-1",
    "active:text-accent-blue",
  ),
  destructive: cx(
    "bg-accent-red text-white shadow-md",
    "hover:brightness-110 hover:shadow-lg",
    "active:brightness-90 active:scale-[0.98]",
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

// §5.1 ripple: spawn an expanding circle at the click point. Plain DOM on
// purpose — the ripple is fire-and-forget and outside React's interest.
function spawnRipple(e: React.PointerEvent<HTMLButtonElement>) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const button = e.currentTarget;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement("span");
  ripple.className = "animate-ripple pointer-events-none absolute rounded-full bg-white/40";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  button.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
  setTimeout(() => ripple.remove(), 500); // backstop
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", onPointerDown, ...rest },
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
        "relative overflow-hidden",
        "inline-flex items-center justify-center gap-2 rounded-sm font-medium",
        "transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "disabled:hover:scale-100 disabled:hover:shadow-md disabled:hover:brightness-100",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});

export default Button;
