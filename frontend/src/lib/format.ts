// Display formatting only — never derives new numbers, only renders
// backend-provided ones.

export function money(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "∞";
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(x).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

export function signed(x: number, digits = 2): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(digits)}`;
}

export function strategyLabel(strategyType: string): string {
  return strategyType.replace(/_/g, " ");
}

// "2026-08-21" -> "Aug 21"
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
