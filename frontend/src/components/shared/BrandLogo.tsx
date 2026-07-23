import { cx } from "../../lib/cx";

// v1.10.4 branding: the Obelisk logo (a fixed-color raster with its own dark
// backdrop) presented as a rounded app-icon tile. Self-contained, so it reads
// as branding on every theme background — subtle on the dark themes (a hairline
// ring separates it), distinct on light Opal. Served from /logo.png (public/).
export default function BrandLogo({
  size = 40, className, glow = false,
}: {
  size?: number;
  className?: string;
  /** soft accent halo + gentle breathe, used on the launch splash */
  glow?: boolean;
}) {
  return (
    <img
      src="/logo.png"
      alt="Option Obelisk"
      width={size}
      height={size}
      draggable={false}
      className={cx(
        "shrink-0 select-none rounded-[22%] ring-1 ring-white/10",
        glow && "brand-splash brand-pulse",
        className,
      )}
    />
  );
}
