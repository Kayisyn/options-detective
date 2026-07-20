// Plain-language copy for beginner mode (updated brief §4.3). Static
// presentation text keyed by strategy — no numbers are ever derived here.
import type { StrategyType } from "../types";

export const ALL_STRATEGY_TYPES: StrategyType[] = [
  "covered_call", "cash_secured_put", "call_vertical", "put_vertical",
  "iron_condor", "long_straddle", "short_strangle",
];

export const BEST_FOR: Record<StrategyType, string> = {
  covered_call: "Earning extra income on shares you already own.",
  cash_secured_put: "Getting paid to wait for a chance to buy the stock cheaper.",
  call_vertical: "A defined-risk bet that the stock goes up.",
  put_vertical: "A defined-risk bet that the stock goes down.",
  iron_condor: "Betting the stock stays inside a range while time passes.",
  long_straddle: "Betting on a big move in either direction.",
  short_strangle: "Collecting premium if the stock stays calm — risk is unlimited.",
};
