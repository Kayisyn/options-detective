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

// Settings → gear (notched cog + hub). v1.10.6: the old circle+spokes read as
// a sun/sparkle; this is an unmistakable toothed gear.
export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
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
