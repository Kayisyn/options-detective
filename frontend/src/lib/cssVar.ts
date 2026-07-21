// Read a theme CSS variable (an RGB triplet like "16 185 129") as an
// rgb() string, or a fallback if unset. Used by the recharts views to feed
// theme colors into chart props, which can't consume CSS variables directly.
export function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}
