import { create } from "zustand";
import { api } from "./lib/api";
import {
  DEFAULT_SORT, EMPTY_FILTERS,
  type CandidateFilters, type SortSpec,
} from "./lib/candidateQuery";
import {
  COMPONENT_KEYS, DEFAULT_WEIGHTS, effectiveScore, weightsEqual,
  type ScoreWeights,
} from "./lib/scoring";
import type {
  CalcResult, Candidate, CloseTradeInput, DirectionalView, JournalTrade, Leg,
  NewTradeInput, Recommendation, ScreenParams, ScreenResult,
} from "./types";

export type View = "home" | "detector" | "calculator" | "recommender" | "journal";

const LAST_SCREEN_KEY = "od.lastScreen";
const WEIGHTS_KEY = "od.weights.v1";
const PROFILES_KEY = "od.weightProfiles.v1";

export interface WeightProfile {
  name: string;
  weights: ScoreWeights;
}

function isWeights(x: unknown): x is ScoreWeights {
  return !!x && typeof x === "object"
    && COMPONENT_KEYS.every((k) => typeof (x as Record<string, unknown>)[k] === "number");
}

function readStoredWeights(): ScoreWeights {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEIGHTS_KEY) ?? "null");
    return isWeights(parsed) ? parsed : { ...DEFAULT_WEIGHTS };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

function readStoredProfiles(): WeightProfile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => typeof p?.name === "string" && isWeights(p?.weights));
  } catch {
    return [];
  }
}

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
  helpOpen: boolean;
  helpTopic: string | null; // glossary entry id to scroll to

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
  savedTrades: JournalTrade[];

  // v1.1 §1: client-side filtering/sorting of screened candidates
  filters: CandidateFilters;
  sort: SortSpec;

  // v1.1 §2: user-adjustable scoring weights (persisted)
  weights: ScoreWeights;
  weightProfiles: WeightProfile[];

  setView: (view: View) => void;
  setSettingsOpen: (open: boolean) => void;
  openHelp: (topic?: string) => void;
  closeHelp: () => void;
  showToast: (message: string) => void;
  setIntent: (patch: Partial<Pick<AppState,
    "symbol" | "directionalView" | "capital" | "riskTolerancePct" | "definedRiskOnly">>) => void;
  patchFilters: (patch: Partial<CandidateFilters>) => void;
  clearFilters: () => void;
  setSort: (sort: SortSpec) => void;
  setWeights: (weights: ScoreWeights) => void;
  saveWeightProfile: (name: string) => void;
  deleteWeightProfile: (name: string) => void;
  screen: (refresh?: boolean) => Promise<void>;
  openCandidate: (candidate: Candidate) => Promise<void>;
  recalculate: (legs: Leg[], repriceTheoretical: boolean) => Promise<void>;
  recommend: () => Promise<void>;
  exportTrade: (id: string, text: string) => Promise<void>;
  loadJournal: () => Promise<void>;
  saveToJournal: (candidate: Candidate, exportText?: string) => Promise<void>;
  removeFromJournal: (id: string) => Promise<void>;
  logTrade: (input: NewTradeInput) => Promise<boolean>;
  closeTrade: (id: string, input: CloseTradeInput) => Promise<boolean>;
  updateTrade: (id: string, patch: Partial<JournalTrade>) => Promise<void>;
  refreshMarks: () => Promise<void>;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let exportTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<AppState>((set, get) => ({
  view: "home",
  status: "idle",
  error: null,
  toast: null,
  settingsOpen: false,
  helpOpen: false,
  helpTopic: null,

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
  filters: EMPTY_FILTERS,
  sort: DEFAULT_SORT,
  weights: readStoredWeights(),
  weightProfiles: readStoredProfiles(),

  setView: (view) => set({ view }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  openHelp: (topic) => set({ helpOpen: true, helpTopic: topic ?? null }),
  closeHelp: () => set({ helpOpen: false, helpTopic: null }),

  // §5.4 confirmations: slide-in toast, auto-dismissed after 3s
  showToast: (message) => {
    clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: null }), 3000);
  },

  setIntent: (patch) => set(patch),
  patchFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  clearFilters: () => set({ filters: EMPTY_FILTERS }),
  setSort: (sort) => set({ sort }),

  setWeights: (weights) => {
    set({ weights });
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
    } catch {
      // private mode: weights live for the session
    }
  },

  saveWeightProfile: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const profiles = [
      ...get().weightProfiles.filter((p) => p.name !== trimmed),
      { name: trimmed, weights: { ...get().weights } },
    ];
    set({ weightProfiles: profiles });
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    } catch { /* session-only */ }
  },

  deleteWeightProfile: (name) => {
    const profiles = get().weightProfiles.filter((p) => p.name !== name);
    set({ weightProfiles: profiles });
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    } catch { /* session-only */ }
  },

  async screen(refresh = false) {
    const { symbol, directionalView, capital, riskTolerancePct, definedRiskOnly } = get();
    const params: ScreenParams = {
      symbol: symbol.trim().toUpperCase(),
      directionalView,
      capital,
      riskTolerancePct,
      definedRiskOnly,
      refresh,
      // request the full generated set; filtering/sorting happens client-side
      topN: 100,
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
    const { screenResult, weights } = get();
    if (!screenResult || screenResult.candidates.length === 0) return;
    set({ view: "recommender", status: "recommending", error: null });
    try {
      // custom weights re-mix the backend's component scores; the ranker
      // then orders by that composite (same formula, user's priorities)
      const custom = !weightsEqual(weights, DEFAULT_WEIGHTS);
      const candidates = custom
        ? screenResult.candidates.map((c) => ({
          ...c,
          compositeScore: effectiveScore(c, weights),
        }))
        : screenResult.candidates;
      const recommendation = await api.recommend({ candidates });
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

  async logTrade(input) {
    try {
      await api.saveTrade(input);
      await get().loadJournal();
      get().showToast("✓ Trade logged");
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async closeTrade(id, input) {
    try {
      const closed = await api.closeTrade(id, input);
      await get().loadJournal();
      get().showToast(`✓ Closed — P&L $${(closed.actualPnl ?? 0).toFixed(2)}`);
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async updateTrade(id, patch) {
    try {
      await api.patchTrade(id, patch);
      await get().loadJournal();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async refreshMarks() {
    try {
      const { trades, warnings } = await api.refreshMarks();
      set({ savedTrades: trades });
      get().showToast(warnings.length > 0
        ? `Marks refreshed — ${warnings.length} warning${warnings.length > 1 ? "s" : ""}`
        : "✓ Marks refreshed");
      if (warnings.length > 0) {
        set({ error: warnings.join(" · ") });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
