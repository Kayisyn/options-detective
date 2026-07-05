import { create } from "zustand";
import { api } from "./lib/api";
import type {
  CalcResult, Candidate, DirectionalView, Leg, Recommendation, SavedTrade,
  ScreenParams, ScreenResult,
} from "./types";

export type View = "home" | "detector" | "calculator" | "recommender" | "journal";

const LAST_SCREEN_KEY = "od.lastScreen";

export function readLastScreen(): { symbol: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LAST_SCREEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.symbol === "string" && typeof parsed?.at === "number"
      ? parsed : null;
  } catch {
    return null;
  }
}

type Status = "idle" | "screening" | "calculating" | "recommending";

interface AppState {
  view: View;
  status: Status;
  error: string | null;
  toast: string | null;
  settingsOpen: boolean;

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
  savedTrades: SavedTrade[];

  setView: (view: View) => void;
  setSettingsOpen: (open: boolean) => void;
  showToast: (message: string) => void;
  setIntent: (patch: Partial<Pick<AppState,
    "symbol" | "directionalView" | "capital" | "riskTolerancePct" | "definedRiskOnly">>) => void;
  screen: (refresh?: boolean) => Promise<void>;
  openCandidate: (candidate: Candidate) => Promise<void>;
  recalculate: (legs: Leg[], repriceTheoretical: boolean) => Promise<void>;
  recommend: () => Promise<void>;
  exportTrade: (id: string, text: string) => Promise<void>;
  loadJournal: () => Promise<void>;
  saveToJournal: (candidate: Candidate, exportText?: string) => Promise<void>;
  removeFromJournal: (id: string) => Promise<void>;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let exportTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<AppState>((set, get) => ({
  view: "home",
  status: "idle",
  error: null,
  toast: null,
  settingsOpen: false,

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
  savedTrades: [],

  setView: (view) => set({ view }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  // §5.4 confirmations: slide-in toast, auto-dismissed after 3s
  showToast: (message) => {
    clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: null }), 3000);
  },

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
      try {
        localStorage.setItem(LAST_SCREEN_KEY,
          JSON.stringify({ symbol: params.symbol, at: Date.now() }));
      } catch {
        // private mode — the home screen just won't show "last screened"
      }
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
      // §5.4: "Copied" state reverts on its own after 2s
      clearTimeout(exportTimer);
      exportTimer = setTimeout(() => {
        if (get().exportedId === id) set({ exportedId: null });
      }, 2000);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async loadJournal() {
    try {
      const { trades } = await api.listTrades();
      set({ savedTrades: trades });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async saveToJournal(candidate, exportText) {
    try {
      await api.saveTrade({ candidate, exportText: exportText ?? null });
      await get().loadJournal();
      get().showToast("✓ Saved to journal");
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async removeFromJournal(id) {
    try {
      await api.deleteTrade(id);
      await get().loadJournal();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
