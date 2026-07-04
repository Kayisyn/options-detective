import { create } from "zustand";
import { api } from "./lib/api";
import type {
  CalcResult, Candidate, DirectionalView, Leg, Recommendation, ScreenParams,
  ScreenResult,
} from "./types";

export type View = "detector" | "calculator" | "recommender";

type Status = "idle" | "screening" | "calculating" | "recommending";

interface AppState {
  view: View;
  status: Status;
  error: string | null;

  // Detector inputs (a lightweight UserIntent)
  symbol: string;
  directionalView: DirectionalView;
  capital: number;
  riskTolerancePct: number;
  definedRiskOnly: boolean;

  screenResult: ScreenResult | null;
  selected: Candidate | null;
  calcResult: CalcResult | null;
  recommendation: Recommendation | null;
  exportedId: string | null; // last candidate copied to clipboard

  setView: (view: View) => void;
  setIntent: (patch: Partial<Pick<AppState,
    "symbol" | "directionalView" | "capital" | "riskTolerancePct" | "definedRiskOnly">>) => void;
  screen: (refresh?: boolean) => Promise<void>;
  openCandidate: (candidate: Candidate) => Promise<void>;
  recalculate: (legs: Leg[], repriceTheoretical: boolean) => Promise<void>;
  recommend: () => Promise<void>;
  exportTrade: (id: string, text: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  view: "detector",
  status: "idle",
  error: null,

  symbol: "AAPL",
  directionalView: "neutral",
  capital: 25_000,
  riskTolerancePct: 2,
  definedRiskOnly: false,

  screenResult: null,
  selected: null,
  calcResult: null,
  recommendation: null,
  exportedId: null,

  setView: (view) => set({ view }),
  setIntent: (patch) => set(patch),

  async screen(refresh = false) {
    const { symbol, directionalView, capital, riskTolerancePct, definedRiskOnly } = get();
    const params: ScreenParams = {
      symbol: symbol.trim().toUpperCase(),
      directionalView,
      capital,
      riskTolerancePct,
      definedRiskOnly,
      refresh,
    };
    set({ status: "screening", error: null, recommendation: null });
    try {
      const screenResult = await api.detect(params);
      set({ screenResult, status: "idle" });
    } catch (err) {
      set({ status: "idle", error: err instanceof Error ? err.message : String(err) });
    }
  },

  async openCandidate(candidate) {
    const { capital, riskTolerancePct } = get();
    set({
      selected: candidate, view: "calculator", status: "calculating",
      error: null, calcResult: null,
    });
    try {
      const calcResult = await api.calculate({
        legs: candidate.legs,
        spot: candidate.meta.spot,
        dte: candidate.daysToExpiry,
        sigma: candidate.meta.sigma,
        riskFreeRate: candidate.meta.riskFreeRate,
        strategyType: candidate.strategyType,
        capital,
        riskTolerancePct,
      });
      set({ calcResult, status: "idle" });
    } catch (err) {
      set({ status: "idle", error: err instanceof Error ? err.message : String(err) });
    }
  },

  async recalculate(legs, repriceTheoretical) {
    const { selected, capital, riskTolerancePct } = get();
    if (!selected) return;
    set({ status: "calculating", error: null });
    try {
      const calcResult = await api.calculate({
        legs,
        spot: selected.meta.spot,
        dte: selected.daysToExpiry,
        sigma: selected.meta.sigma,
        riskFreeRate: selected.meta.riskFreeRate,
        strategyType: selected.strategyType,
        capital,
        riskTolerancePct,
        repriceTheoretical,
      });
      set({ calcResult, status: "idle" });
    } catch (err) {
      set({ status: "idle", error: err instanceof Error ? err.message : String(err) });
    }
  },

  async recommend() {
    const { screenResult } = get();
    if (!screenResult || screenResult.candidates.length === 0) return;
    set({ view: "recommender", status: "recommending", error: null });
    try {
      const recommendation = await api.recommend({ candidates: screenResult.candidates });
      set({ recommendation, status: "idle" });
    } catch (err) {
      set({ status: "idle", error: err instanceof Error ? err.message : String(err) });
    }
  },

  async exportTrade(id, text) {
    try {
      await api.exportTrade(text);
      set({ exportedId: id });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
