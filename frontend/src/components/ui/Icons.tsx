import type { SVGProps } from "react";

// v1.5.1 outline icon set. Stroke-only, currentColor, 24x24 viewBox so they
// scale to any size and inherit theme color (violet on Obsidian, white on
// B&W). Used on the home feature cards (large, low-opacity behind text) and
// on the Asset Screener "Screen Holdings" CTA.

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

// Real-time screening → radar / scanning waves (concentric rings + sweep)
export function RadarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 12 L20.5 6.5" />
    </svg>
  );
}

// Trade analysis → calculator / matrix grid (precision, computation)
export function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17" />
    </svg>
  );
}

// Optimal strategies → trophy (excellence, best selection)
export function TrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.75a1.75 1.75 0 0 0 0 3.5H7.5" />
      <path d="M17 5.5h2.25a1.75 1.75 0 0 1 0 3.5H16.5" />
      <path d="M12 13.5v3" />
      <path d="M9 20h6l-.6-3.5H9.6z" />
    </svg>
  );
}
