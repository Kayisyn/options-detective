import type { CalculatorState } from "../types";

// Drives View 2: POST /calculate for the selected candidate, re-runs on
// strike/expiry adjustments. Real implementation lands in Phase 6 against
// Phase 4.
export function useCalculator(_candidateId: string | null) {
  return {
    state: null as CalculatorState | null,
    isCalculating: false,
    error: null as string | null,
    adjust: (_changes: Partial<Pick<CalculatorState, "adjustedStrikes" | "currentUnderlying">>) => {},
  };
}
