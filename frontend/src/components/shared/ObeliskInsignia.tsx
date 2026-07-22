import { useId } from "react";
import { cx } from "../../lib/cx";

// The Obelisk insignia, shared across the nav mark, the launch splash and the
// sign-in gate. The gradient rides the theme accent tokens, so it is violet on
// Amethyst, emerald on Emerald and white on Obsidian, and recolors instantly on
// a theme switch. `glow` adds the pulsing halo used on the splash.
export default function ObeliskInsignia({
  size = 24, className, glow = false, title,
}: {
  /** rendered height in px; width follows the 3:4 aspect */
  size?: number;
  className?: string;
  glow?: boolean;
  title?: string;
}) {
  // unique gradient id per instance so multiple insignia on one page don't
  // collide on a shared `id`
  const gradId = useId();
  return (
    <svg
      viewBox="0 0 18 24"
      height={size}
      width={(size * 18) / 24}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cx("shrink-0", glow && "obelisk-glow", className)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "rgb(var(--od-accent-primary-hover))" }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--od-accent-primary))" }} />
        </linearGradient>
      </defs>
      <path d="M6 24 L7 6 L9 0 L11 6 L12 24 Z" fill={`url(#${gradId})`} />
    </svg>
  );
}
