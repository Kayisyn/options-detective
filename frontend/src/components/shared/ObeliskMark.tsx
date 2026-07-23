import { cx } from "../../lib/cx";

// v1.10.5 nav mark: a monochrome obelisk that fills with `currentColor`, so it
// is theme-aware wherever it is placed (the nav colors it muted, brightening
// to the accent on hover). Unlike the gradient BrandLogo raster used on the
// sign-in and splash, this recolors with the theme. Same silhouette as the
// wordmark's original insignia.
export default function ObeliskMark({
  size = 28, className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 18 24"
      height={size}
      width={(size * 18) / 24}
      aria-hidden
      className={cx("shrink-0", className)}
    >
      <path d="M6 24 L7 6 L9 0 L11 6 L12 24 Z" fill="currentColor" />
    </svg>
  );
}
