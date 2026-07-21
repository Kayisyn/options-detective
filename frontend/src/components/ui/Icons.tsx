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

// v1.10.2 ⋮ menu icons — replace the colored emoji. Same stroke-only style.

// Settings → gear (circle hub + eight spokes)
export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </svg>
  );
}

// Account → user (head + shoulders)
export function AccountIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20c.4-3.8 3.7-6 7.5-6s7.1 2.2 7.5 6" />
    </svg>
  );
}

// Help & Glossary → question mark in a circle
export function HelpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.3 2.1-2.3 3.6" />
      <path d="M12 17h.01" />
    </svg>
  );
}

// Feedback & Bugs → chat bubble
export function FeedbackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M20 4.5H4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 16.5h3v3.5l4.2-3.5H20a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 20 4.5Z" />
    </svg>
  );
}
