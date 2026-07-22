// Scoring transparency + user-weighted re-ranking (v1.1 roadmap §2).
//
// The backend computes each candidate's normalized components (0-1) and the
// composite = 10 × Σ weight_k × component_k. The roadmap explicitly assigns
// re-weighting to the frontend: the SAME formula over BACKEND-computed
// components, with the user's weights — re-ranking never invents numbers,
// it only re-mixes the engine's.
import type { Candidate, ScoreComponentKey } from "../types";

export type ScoreWeights = Record<ScoreComponentKey, number>;

export const COMPONENT_KEYS: ScoreComponentKey[] = [
  "pop", "ror", "theta", "capEff", "liquidity",
];

export const DEFAULT_WEIGHTS: ScoreWeights = {
  pop: 0.30, ror: 0.20, theta: 0.20, capEff: 0.15, liquidity: 0.15,
};

export const COMPONENT_META: Record<ScoreComponentKey, {
  label: string;
  explain: string;
  color: string; // breakdown bar segment (theme accent classes)
}> = {
  pop: {
    label: "POP",
    explain: "Probability of any profit at expiry, straight from the lognormal model. 62% POP contributes 0.62 to this slot.",
    color: "bg-accent-primary",
  },
  ror: {
    label: "Risk/reward",
    explain: "Max profit divided by max loss, capped at 3:1. Unlimited-upside positions get full marks; unlimited-risk positions score near zero.",
    color: "bg-accent-orange",
  },
  theta: {
    label: "Theta",
    explain: "Daily time decay relative to the other candidates in this screen, the best collector scores 1, the worst bleeder 0.",
    color: "bg-accent-green",
  },
  capEff: {
    label: "Capital efficiency",
    explain: "Max profit per dollar of capital tied up, capped at 1. Cheap defined-risk spreads score high; buy-writes score low.",
    color: "bg-accent-blue",
  },
  liquidity: {
    label: "Liquidity",
    explain: "Bid-ask tightness (70%) plus traded volume (30%). Wide or unverifiable books score low.",
    color: "bg-accent-cyan",
  },
};

export interface WeightPreset {
  id: string;
  name: string;
  hint: string;
  weights: ScoreWeights;
}

// Roadmap presets. All sum to exactly 1.0.
export const WEIGHT_PRESETS: WeightPreset[] = [
  { id: "balanced", name: "Balanced", hint: "The default blend", weights: DEFAULT_WEIGHTS },
  {
    id: "income", name: "Income-focused", hint: "Prioritizes daily theta collection",
    weights: { pop: 0.20, ror: 0.15, theta: 0.35, capEff: 0.15, liquidity: 0.15 },
  },
  {
    id: "risk-averse", name: "Risk-averse", hint: "Win probability above all",
    weights: { pop: 0.50, ror: 0.10, theta: 0.15, capEff: 0.10, liquidity: 0.15 },
  },
  {
    id: "aggressive", name: "Aggressive", hint: "Chases payoff asymmetry",
    weights: { pop: 0.15, ror: 0.40, theta: 0.15, capEff: 0.20, liquidity: 0.10 },
  },
];

export function weightsSum(w: ScoreWeights): number {
  return COMPONENT_KEYS.reduce((s, k) => s + w[k], 0);
}

export function weightsEqual(a: ScoreWeights, b: ScoreWeights): boolean {
  return COMPONENT_KEYS.every((k) => Math.abs(a[k] - b[k]) < 1e-9);
}

export function normalizeWeights(w: ScoreWeights): ScoreWeights {
  const sum = weightsSum(w);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  const out = {} as ScoreWeights;
  for (const k of COMPONENT_KEYS) out[k] = Math.round((w[k] / sum) * 100) / 100;
  // rounding can leave the sum a cent or two off 1.00 — absorb into the largest
  const drift = Math.round((1 - weightsSum(out)) * 100) / 100;
  if (drift !== 0) {
    const largest = COMPONENT_KEYS.reduce((a, b) => (out[a] >= out[b] ? a : b));
    out[largest] = Math.round((out[largest] + drift) * 100) / 100;
  }
  return out;
}

// Weights are normalized by their sum here so the 0-10 scale stays
// meaningful mid-edit; ordering is unaffected by that scaling.
export function effectiveScore(c: Candidate, weights: ScoreWeights): number {
  const b = c.scoreBreakdown;
  if (!b) return c.compositeScore; // pre-v1.1 snapshots
  const sum = weightsSum(weights) || 1;
  const raw = COMPONENT_KEYS.reduce(
    (s, k) => s + (weights[k] / sum) * (b.components[k] ?? 0), 0);
  return Math.round(raw * 1000) / 100;
}

export interface Contribution {
  key: ScoreComponentKey;
  label: string;
  component: number; // 0-1
  points: number;    // of the 0-10 score
}

export function contributions(c: Candidate, weights: ScoreWeights): Contribution[] {
  const b = c.scoreBreakdown;
  if (!b) return [];
  const sum = weightsSum(weights) || 1;
  return COMPONENT_KEYS.map((k) => ({
    key: k,
    label: COMPONENT_META[k].label,
    component: b.components[k] ?? 0,
    points: Math.round((weights[k] / sum) * (b.components[k] ?? 0) * 1000) / 100,
  }));
}

// Presentation wording for the hover explanations.
export function classify(component: number): string {
  if (component >= 0.66) return "strong";
  if (component >= 0.33) return "middling";
  return "weak";
}
