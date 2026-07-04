import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

// Button system per ux-design-polish-brief §2.1. All state changes 150ms
// ease-out; scale feedback only on variants the brief calls for.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: cx(
    "bg-blue-600 text-white shadow-md",
    "hover:bg-blue-700 hover:scale-[1.02] hover:shadow-lg",
    "active:bg-blue-800 active:scale-[0.98]",
    "disabled:bg-gray-600",
  ),
  secondary: cx(
    "border-2 border-blue-600 bg-transparent text-blue-400",
    "hover:bg-blue-600/10 hover:border-blue-500",
    "active:border-blue-700 active:text-blue-300",
  ),
  ghost: cx(
    "bg-transparent text-content-2",
    "hover:bg-dark-700 hover:text-content-1",
    "active:text-accent-blue",
  ),
  destructive: cx(
    "bg-red-600 text-white shadow-md",
    "hover:bg-red-700 hover:shadow-lg",
    "active:bg-red-800 active:scale-[0.98]",
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

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-sm font-medium",
        "transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "disabled:hover:scale-100 disabled:hover:shadow-md",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});

export default Button;
