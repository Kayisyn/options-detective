import { useStore } from "../store";
import { money } from "./format";

// v1.9.0 CAD support. All market data and stored trade values remain USD —
// CAD is a DISPLAY conversion. Realized (closed) values convert at the rate
// stamped on the trade (historical accuracy per spec); live/unrealized
// values convert at the current rate. When a historical rate is missing
// (legacy trades) the current rate applies and the value is marked ≈.

export function moneyCad(x: number | null | undefined, digits = 0): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `C${money(x, digits)}`;
}

export interface FxDisplay {
  mode: "usd" | "cad" | "dual";
  rate: number | null;
}

export function useFxDisplay(): FxDisplay {
  const mode = useStore((s) => s.currencyMode);
  const rate = useStore((s) => s.fxRate);
  return { mode, rate };
}

/** Format a USD amount according to the currency preference.
 *  histRate: the trade's stamped rate for realized values (null = use
 *  current and mark approximate). */
export function formatFx(
  usd: number | null | undefined,
  { mode, rate }: FxDisplay,
  { digits = 0, histRate = undefined, signed = false }: {
    digits?: number; histRate?: number | null; signed?: boolean;
  } = {},
): string {
  if (usd == null || Number.isNaN(usd)) return "—";
  const sign = signed && usd >= 0 ? "+" : "";
  const usdStr = `${sign}${money(usd, digits)}`;
  if (mode === "usd" || rate == null) return usdStr;
  const effRate = histRate ?? rate;
  const approx = histRate == null && histRate !== undefined ? "≈" : "";
  const cadStr = `${sign}${approx}${moneyCad(usd * effRate, digits)}`;
  if (mode === "cad") return cadStr;
  return `${usdStr} | ${cadStr}`;
}

/** Inline dual-currency value. Colors/weights come from the wrapper. */
export function DualValue({ usd, digits = 0, histRate, signed = false, title }: {
  usd: number | null | undefined;
  digits?: number;
  /** stamped historical rate for realized values; null = legacy trade
      (falls back to the current rate, marked ≈); omit for live values */
  histRate?: number | null;
  signed?: boolean;
  title?: string;
}) {
  const fx = useFxDisplay();
  return (
    <span title={title} data-testid="dual-value">
      {formatFx(usd, fx, { digits, histRate, signed })}
    </span>
  );
}
