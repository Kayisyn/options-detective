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
import { applyMotionPref, type MotionPref } from "./lib/motionPref";
import { applyFxClasses } from "./lib/fxClasses";
import type {
  Account, CalcResult, Candidate, CloseTradeInput, DirectionalView, EquityPoint,
  EtfFilters, EtfReference, EtfScreenResult, EtfStrategy, IcsResult,
  IcsViewState, JournalSaveOptions,
  JournalTrade, Leg, MarketPulse, NewTradeInput, PaperSettings, PaperState,
  Recommendation, ScreenParams, ScreenResult,
} from "./types";

export type View = "home" | "detector" | "calculator" | "recommender" | "journal" | "paper" | "etf" | "ics";

const LAST_SCREEN_KEY = "od.lastScreen";
const WEIGHTS_KEY = "od.weights.v1";
const PROFILES_KEY = "od.weightProfiles.v1";
const FX_KEY = "od.fx.v1"; // v1.5.0 visual-effects prefs
const SIDEBAR_ORDER_KEY = "od.sidebarOrder.v1"; // v1.5.1
const CURRENCY_KEY = "od.currency.v1"; // v1.7.0

// v1.7.0 currency display preference (per machine, like themes)
interface CurrencyPrefs {
  mode: "usd" | "cad" | "dual";
  autoUpdate: boolean;
}

const DEFAULT_CURRENCY: CurrencyPrefs = { mode: "usd", autoUpdate: true };

function readCurrencyPrefs(): CurrencyPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(CURRENCY_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CURRENCY };
    const mode = (parsed as CurrencyPrefs).mode;
    return {
      mode: mode === "cad" || mode === "dual" ? mode : "usd",
      autoUpdate: typeof (parsed as CurrencyPrefs).autoUpdate === "boolean"
        ? (parsed as CurrencyPrefs).autoUpdate : true,
    };
  } catch {
    return { ...DEFAULT_CURRENCY };
  }
}

function writeCurrencyPrefs(prefs: CurrencyPrefs) {
  try {
    localStorage.setItem(CURRENCY_KEY, JSON.stringify(prefs));
  } catch { /* private mode */ }
}

// v1.5.1: the right sidebar holds all five sections; the user reorders them
// in Settings and the order persists.
export type SidebarSection = "watchlist" | "recentTrades" | "breadth" | "trending" | "news";
export const DEFAULT_SIDEBAR_ORDER: SidebarSection[] =
  ["watchlist", "recentTrades", "breadth", "trending", "news"];

function readSidebarOrder(): SidebarSection[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SIDEBAR_ORDER_KEY) ?? "null");
    const known = new Set<string>(DEFAULT_SIDEBAR_ORDER);
    const order: SidebarSection[] = [];
    if (Array.isArray(parsed)) {
      for (const s of parsed) {
        if (known.has(s) && !order.includes(s as SidebarSection)) order.push(s as SidebarSection);
      }
    }
    // append any section missing from storage (forward-compat with new sections)
    for (const s of DEFAULT_SIDEBAR_ORDER) if (!order.includes(s)) order.push(s);
    return order;
  } catch {
    return [...DEFAULT_SIDEBAR_ORDER];
  }
}

function writeSidebarOrder(order: SidebarSection[]) {
  try {
    localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(order));
  } catch {
    // private mode: order lives for the session only
  }
}

interface FxPrefs {
  particles: boolean;
  particleCount: number; // 50-300
  motion: MotionPref;    // system | on | off
  // v1.5.1 performance debug toggles — all default ON (preserve visuals)
  parallax: boolean;     // cursor depth shift on the particle layer
  liquidGlass: boolean;  // flowing shimmer on cards/buttons/inputs
  glow: boolean;         // neon halo + P&L + focus box-shadow glows
}

const DEFAULT_FX: FxPrefs = {
  particles: true, particleCount: 200, motion: "system",
  parallax: true, liquidGlass: true, glow: true,
};

// older payloads predate the debug toggles; a missing flag defaults ON
function readBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function readStoredFx(): FxPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(FX_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_FX };
    const p = parsed as Partial<FxPrefs>;
    const count = Number(p.particleCount);
    return {
      particles: readBool(p.particles, DEFAULT_FX.particles),
      particleCount: Number.isFinite(count)
        ? Math.min(300, Math.max(50, Math.round(count))) : DEFAULT_FX.particleCount,
      motion: p.motion === "on" || p.motion === "off" ? p.motion : "system",
      parallax: readBool(p.parallax, DEFAULT_FX.parallax),
      liquidGlass: readBool(p.liquidGlass, DEFAULT_FX.liquidGlass),
      glow: readBool(p.glow, DEFAULT_FX.glow),
    };
  } catch {
    return { ...DEFAULT_FX };
  }
}

// stamp <html> classes (motion-off, fx-no-*) before the first render so
// entrance animations and effect gating resolve correctly from frame one
applyMotionPref(readStoredFx().motion);
applyFxClasses(readStoredFx());

function writeStoredFx(fx: FxPrefs) {
  try {
    localStorage.setItem(FX_KEY, JSON.stringify(fx));
  } catch {
    // private mode: prefs live for the session only
  }
}

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
  // v1.6.0 local accounts
  account: Account | null;
  accounts: Account[];
  authReady: boolean;  // boot check finished (splash → gate/app)
  authBusy: boolean;

  savedTrades: JournalTrade[];
  trashedTrades: JournalTrade[]; // v1.5.1 soft-deleted positions
  paper: PaperState | null;      // null until first load
  paperCurve: EquityPoint[];
  paperCurveDays: number;        // sticky range so background refreshes keep it
  paperMarking: boolean;         // a mark pass is in flight (prevents overlap)

  // v2.0 ETF screener
  etfReference: EtfReference | null;
  etfResult: EtfScreenResult | null;
  etfWatchlist: string[];
  etfBusy: boolean;

  // v1.3.0 Index Component Screener
  icsEtf: string | null;
  icsResult: IcsResult | null;
  icsBusy: boolean;
  icsError: string | null; // in-view (e.g. "holdings not available"), not the global banner
  icsView: IcsViewState;   // v1.3.1: filters/sort/paging survive Calculator round-trips
  icsScrollY: number;      // v1.3.1: restore list position on return

  // v1.3.1: which list view "Compare candidates" returns to
  calcSource: "recommender" | "ics";

  // v1.5.0 sidebars: shared market pulse + open/collapsed state (session
  // only, deliberately not persisted yet per the brief)
  pulse: MarketPulse | null;
  pulseBusy: boolean;
  rightSidebarOpen: boolean;
  sidebarOrder: SidebarSection[]; // v1.5.1 (persisted)

  // v1.5.0 visual effects (persisted)
  fxParticles: boolean;
  fxParticleCount: number;
  fxMotion: MotionPref;
  // v1.5.1 performance debug toggles (persisted)
  fxParallax: boolean;
  fxLiquidGlass: boolean;
  fxGlow: boolean;

  // v1.7.0 currency (prefs persisted; rate fetched)
  currencyMode: "usd" | "cad" | "dual";
  fxAutoUpdate: boolean;
  fxRate: number | null;   // 1 USD = fxRate CAD
  fxAsOf: string | null;
  fxStale: boolean;
  fxBusy: boolean;

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
  openCandidate: (candidate: Candidate, source?: "recommender" | "ics") => Promise<void>;
  compareCandidates: () => void;
  recalculate: (legs: Leg[], repriceTheoretical: boolean) => Promise<void>;
  recommend: () => Promise<void>;
  exportTrade: (id: string, text: string) => Promise<void>;
  bootAuth: () => Promise<void>;
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  register: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;

  loadJournal: () => Promise<void>;
  loadTrash: () => Promise<void>;
  clearAllPositions: () => Promise<number>;
  trashPosition: (id: string) => Promise<void>;
  restorePosition: (id: string) => Promise<void>;
  deletePositionForever: (id: string) => Promise<void>;
  restoreAllTrash: () => Promise<void>;
  purgeTrash: () => Promise<void>;
  saveToJournal: (candidate: Candidate, opts?: JournalSaveOptions) => Promise<boolean>;
  removeFromJournal: (id: string) => Promise<void>;
  logTrade: (input: NewTradeInput) => Promise<boolean>;
  closeTrade: (id: string, input: CloseTradeInput) => Promise<boolean>;
  updateTrade: (id: string, patch: Partial<JournalTrade>) => Promise<void>;
  refreshMarks: () => Promise<void>;

  loadPaper: (days?: number) => Promise<void>;
  createPaperAccount: (initialBalance: number) => Promise<void>;
  openPaperTrade: (
    body: NewTradeInput
      | ({ candidate: Candidate; entryQty?: number } & JournalSaveOptions),
  ) => Promise<boolean>;
  closePaperTrade: (id: string, input: CloseTradeInput) => Promise<boolean>;
  processPaper: (opts?: { quiet?: boolean }) => Promise<void>;
  resetPaper: (initialBalance?: number) => Promise<void>;
  updatePaperSettings: (patch: Partial<PaperSettings>) => Promise<void>;
  sellHolding: (symbol: string, shares?: number) => Promise<void>;

  loadEtfReference: () => Promise<void>;
  screenEtf: (filters: EtfFilters, strategy: EtfStrategy) => Promise<void>;
  refreshEtfMetrics: (tickers: string[]) => Promise<void>;
  loadEtfWatchlist: () => Promise<void>;
  toggleEtfWatch: (ticker: string, watched: boolean) => Promise<void>;
  analyzeEtfInDetector: (ticker: string) => Promise<void>;

  openIcs: (ticker: string) => Promise<void>;
  runIcs: (refresh?: boolean) => Promise<void>;
  patchIcsView: (patch: Partial<IcsViewState>) => void;

  loadPulse: () => Promise<void>;
  toggleRightSidebar: () => void;
  setSidebarOrder: (order: SidebarSection[]) => void;
  resetSidebarOrder: () => void;
  prefillScreener: (symbol: string) => void;
  setFx: (patch: Partial<{
    particles: boolean; particleCount: number; motion: MotionPref;
    parallax: boolean; liquidGlass: boolean; glow: boolean;
  }>) => void;
  loadFx: (refresh?: boolean) => Promise<void>;
  setCurrency: (patch: Partial<{ mode: "usd" | "cad" | "dual"; autoUpdate: boolean }>) => void;
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
  account: null,
  accounts: [],
  authReady: false,
  authBusy: false,

  savedTrades: [],
  trashedTrades: [],
  paper: null,
  paperCurve: [],
  paperCurveDays: 90,
  paperMarking: false,
  etfReference: null,
  etfResult: null,
  etfWatchlist: [],
  etfBusy: false,
  icsEtf: null,
  icsResult: null,
  icsBusy: false,
  icsError: null,
  icsView: { sectors: [], subset: 0, strategy: "", sort: "score", shown: 50 },
  icsScrollY: 0,
  calcSource: "recommender",
  pulse: null,
  pulseBusy: false,
  rightSidebarOpen: true,
  sidebarOrder: readSidebarOrder(),
  fxParticles: readStoredFx().particles,
  fxParticleCount: readStoredFx().particleCount,
  fxMotion: readStoredFx().motion,
  fxParallax: readStoredFx().parallax,
  fxLiquidGlass: readStoredFx().liquidGlass,
  fxGlow: readStoredFx().glow,

  currencyMode: readCurrencyPrefs().mode,
  fxAutoUpdate: readCurrencyPrefs().autoUpdate,
  fxRate: null,
  fxAsOf: null,
  fxStale: false,
  fxBusy: false,
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

  async openCandidate(candidate, source = "recommender") {
    const { capital, riskTolerancePct } = get();
    set({
      selected: candidate, view: "calculator", status: "calculating",
      error: null, calcResult: null, calcSource: source,
      // remember where the ICS list was scrolled to for the return trip
      ...(source === "ics" ? { icsScrollY: window.scrollY } : {}),
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

  // v1.3.1 Bug 2: "Compare candidates" returns to the list the candidate
  // came FROM. From the ICS the result set is already in the store — just
  // navigate back; the old behavior ran the Recommender against whatever
  // the Detector last screened (wrong list, or a silent no-op).
  compareCandidates() {
    if (get().calcSource === "ics") set({ view: "ics" });
    else void get().recommend();
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

  // v1.7.0 currency --------------------------------------------------------

  // Load the USD→CAD rate. refresh=true forces a refetch (Settings button);
  // otherwise the backend serves its daily cache. autoUpdate=false still
  // loads whatever the backend has cached — it just never forces.
  async loadFx(refresh = false) {
    set({ fxBusy: true });
    try {
      const info = await api.marketFx(refresh);
      set({ fxRate: info.rate, fxAsOf: info.asOf, fxStale: info.stale, fxBusy: false });
    } catch {
      set({ fxBusy: false }); // keep whatever we had; CAD display waits
    }
  },

  setCurrency(patch) {
    const next = {
      mode: patch.mode ?? get().currencyMode,
      autoUpdate: patch.autoUpdate ?? get().fxAutoUpdate,
    };
    writeCurrencyPrefs(next);
    set({ currencyMode: next.mode, fxAutoUpdate: next.autoUpdate });
    // first switch into a CAD mode with no rate yet: fetch one
    if (next.mode !== "usd" && get().fxRate == null) get().loadFx();
  },

  // v1.6.0 local accounts ------------------------------------------------

  async bootAuth() {
    try {
      const { account, accounts } = await api.authState();
      set({ account, accounts, authReady: true });
    } catch {
      // backend not up yet: still show the gate; the user's login will retry
      set({ authReady: true });
    }
  },

  // login/register throw on failure so the gate can show the message inline
  // (they deliberately do NOT set the global error banner).
  async login(username, password, rememberMe) {
    set({ authBusy: true });
    try {
      const { account } = await api.authLogin({ username, password, rememberMe });
      set({ account, authBusy: false, error: null });
    } catch (err) {
      set({ authBusy: false });
      throw err;
    }
  },

  async register(username, password, rememberMe) {
    set({ authBusy: true });
    try {
      await api.authRegister({ username, password });
      // no email verification in the local model — sign straight in
      const { account } = await api.authLogin({ username, password, rememberMe });
      const { accounts } = await api.authState();
      set({ account, accounts, authBusy: false, error: null });
    } catch (err) {
      set({ authBusy: false });
      throw err;
    }
  },

  async logout() {
    try {
      await api.authLogout();
    } catch {
      // even if the call fails, drop the local session
    }
    // clear every per-account slice so nothing leaks to the login screen or
    // the next account that signs in
    set({
      account: null,
      view: "home",
      savedTrades: [], trashedTrades: [],
      paper: null, paperCurve: [],
      etfWatchlist: [], etfResult: null,
      screenResult: null, selected: null, calcResult: null,
      recommendation: null, pulse: null, icsResult: null,
      error: null,
    });
  },

  async loadJournal() {
    try {
      const { trades } = await api.listTrades();
      set({ savedTrades: trades });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  // v1.3.1: optional edits (entry price, targets, note) ride along with the
  // candidate snapshot; undefined fields keep the candidate-derived values.
  async saveToJournal(candidate, opts = {}) {
    try {
      await api.saveTrade({ candidate, exportText: opts.exportText ?? null, ...opts });
      await get().loadJournal();
      get().showToast("✓ Saved to Position Log");
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
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

  // v1.5.1 trash. Soft-deletes drop out of the active journal and (being
  // excluded from tradeStore.list) out of Sandbox derivations too, so we
  // refresh both after every trash/restore.
  async loadTrash() {
    try {
      const { trades } = await api.listTrash();
      set({ trashedTrades: trades });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async clearAllPositions() {
    try {
      const { trashed } = await api.trashAll();
      await Promise.all([get().loadJournal(), get().loadTrash(), get().loadPaper()]);
      get().showToast(`${trashed} position${trashed === 1 ? "" : "s"} moved to Trash`);
      return trashed;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return 0;
    }
  },

  async trashPosition(id) {
    try {
      await api.trashTrade(id);
      await Promise.all([get().loadJournal(), get().loadTrash(), get().loadPaper()]);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async restorePosition(id) {
    try {
      await api.restoreTrade(id);
      await Promise.all([get().loadJournal(), get().loadTrash(), get().loadPaper()]);
      get().showToast("✓ Position restored");
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async deletePositionForever(id) {
    try {
      await api.deleteTrade(id);
      await get().loadTrash();
      get().showToast("Position deleted permanently");
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async restoreAllTrash() {
    try {
      const { restored } = await api.restoreAllTrash();
      await Promise.all([get().loadJournal(), get().loadTrash(), get().loadPaper()]);
      get().showToast(`✓ ${restored} position${restored === 1 ? "" : "s"} restored`);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async purgeTrash() {
    try {
      const { purged } = await api.purgeTrash();
      await get().loadTrash();
      get().showToast(`Trash emptied — ${purged} deleted permanently`);
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

  async loadPaper(days) {
    const resolved = days ?? get().paperCurveDays;
    try {
      const [state, curve] = await Promise.all([api.paperGet(), api.paperCurve(resolved)]);
      set({ paper: state, paperCurve: curve.points, paperCurveDays: resolved });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async createPaperAccount(initialBalance) {
    try {
      await api.paperBudget(initialBalance);
      await get().loadPaper();
      get().showToast("✓ Sandbox account ready");
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async openPaperTrade(body) {
    try {
      const { balance } = await api.paperOpen(body);
      await Promise.all([get().loadPaper(), get().loadJournal()]);
      get().showToast(`✓ Sandbox trade opened — $${balance.available.toFixed(0)} available`);
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async closePaperTrade(id, input) {
    try {
      const { trade } = await api.paperClose(id, input);
      await Promise.all([get().loadPaper(), get().loadJournal()]);
      get().showToast(`✓ Sandbox close — P&L $${(trade.actualPnl ?? 0).toFixed(2)}`);
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  // v1.3.2: also runs quietly in the background (on Paper-tab load and every
  // 60s) so unrealized P&L and the equity curve track the market without a
  // button press. Quiet runs never toast and never raise the error banner —
  // a transient quote failure just retries on the next tick.
  async processPaper(opts = {}) {
    const { quiet = false } = opts;
    if (get().paperMarking) return; // a pass is already in flight
    const openCount = get().paper?.trades.filter(
      (t) => t.status === "open").length ?? 0;
    if (quiet && openCount === 0) return; // nothing to mark or settle
    set({ paperMarking: true });
    try {
      const { warnings, events } = await api.paperProcess();
      await Promise.all([get().loadPaper(), get().loadJournal()]);
      // assignment notifications matter even on a quiet background pass —
      // the user needs to know shares appeared/left (v1.5.0 §8)
      if (events && events.length > 0) {
        get().showToast(`⚑ ${events[0]}${events.length > 1 ? ` (+${events.length - 1} more)` : ""}`);
      }
      if (!quiet) {
        if (!events || events.length === 0) {
          get().showToast(warnings.length > 0
            ? `Processed — ${warnings.length} warning${warnings.length > 1 ? "s" : ""}`
            : "✓ Marks & expirations processed");
        }
        if (warnings.length > 0) set({ error: warnings.join(" · ") });
      }
    } catch (err) {
      if (!quiet) set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ paperMarking: false });
    }
  },

  async resetPaper(initialBalance) {
    try {
      const { archived } = await api.paperReset(initialBalance);
      await Promise.all([get().loadPaper(), get().loadJournal()]);
      get().showToast(`✓ Sandbox reset — ${archived} position${archived === 1 ? "" : "s"} archived`);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  // v1.5.0 sandbox customization: settings apply on the next process pass
  // (fees on the next order, theta to the next mark, auto-assign at expiry).
  async updatePaperSettings(patch) {
    try {
      const { settings } = await api.paperSettings(patch);
      set((s) => ({ paper: s.paper ? { ...s.paper, settings } : s.paper }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async sellHolding(symbol, shares) {
    try {
      const { sold } = await api.paperSellHolding(symbol, shares ? { shares } : {});
      await get().loadPaper();
      get().showToast(`✓ Sold ${sold.shares} ${sold.symbol} @ $${sold.price.toFixed(2)} — P&L $${sold.realized.toFixed(2)}`);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async loadEtfReference() {
    try {
      if (!get().etfReference) set({ etfReference: await api.etfReference() });
      await get().loadEtfWatchlist();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async screenEtf(filters, strategy) {
    set({ etfBusy: true, error: null });
    try {
      // v1.7.0: show the whole curated universe (~49 ETFs) — no pagination
      const etfResult = await api.etfScreen({ filters, strategy, limit: 0 });
      set({ etfResult, etfBusy: false });
      if (!etfResult.anyMetrics) {
        set({ error: "No live metrics yet — hit “Refresh data” to fetch prices, IV and premiums." });
      }
    } catch (err) {
      set({ etfBusy: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async refreshEtfMetrics(tickers) {
    set({ etfBusy: true, error: null });
    try {
      const { refreshed, errors } = await api.etfRefresh(tickers);
      set({ etfBusy: false });
      get().showToast(`✓ Refreshed ${refreshed} ETF${refreshed === 1 ? "" : "s"}`);
      if (errors && errors.length > 0) {
        set({ error: `${errors.length} could not be fetched: ${errors.slice(0, 3).join(" · ")}` });
      }
    } catch (err) {
      set({ etfBusy: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async loadEtfWatchlist() {
    try {
      const { etfs } = await api.etfWatchlist();
      set({ etfWatchlist: etfs.map((e) => e.ticker) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async toggleEtfWatch(ticker, watched) {
    try {
      const { watchlist } = await api.etfWatchToggle(ticker, watched ? "add" : "remove");
      set({ etfWatchlist: watchlist });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  // §2.9: hand a discovered ETF to the Detector and screen it immediately.
  async analyzeEtfInDetector(ticker) {
    set({ symbol: ticker.toUpperCase(), view: "detector" });
    await get().screen();
  },

  // v1.5.0 sidebars ---------------------------------------------------------

  // One cached backend fetch per minute feeds breadth, trending, watchlist
  // quotes and headlines. Failures stay silent — the sidebar shows its
  // last data (or placeholders), never the global error banner.
  async loadPulse() {
    if (get().pulseBusy) return;
    set({ pulseBusy: true });
    try {
      const pulse = await api.marketPulse(get().etfWatchlist);
      set({ pulse });
    } catch {
      // sidebar data is ambient; a failed poll is not an app error
    } finally {
      set({ pulseBusy: false });
    }
  },

  toggleRightSidebar: () => set({ rightSidebarOpen: !get().rightSidebarOpen }),

  setSidebarOrder: (order) => {
    writeSidebarOrder(order);
    set({ sidebarOrder: order });
  },
  resetSidebarOrder: () => {
    writeSidebarOrder(DEFAULT_SIDEBAR_ORDER);
    set({ sidebarOrder: [...DEFAULT_SIDEBAR_ORDER] });
  },

  // sidebar click-through: put the symbol in the Screener without firing
  // a screen yet — the user confirms parameters first
  prefillScreener: (symbol) => set({ symbol: symbol.toUpperCase(), view: "detector" }),

  setFx: (patch) => {
    const next: FxPrefs = {
      particles: patch.particles ?? get().fxParticles,
      particleCount: Math.min(300, Math.max(50,
        Math.round(patch.particleCount ?? get().fxParticleCount))),
      motion: patch.motion ?? get().fxMotion,
      parallax: patch.parallax ?? get().fxParallax,
      liquidGlass: patch.liquidGlass ?? get().fxLiquidGlass,
      glow: patch.glow ?? get().fxGlow,
    };
    writeStoredFx(next);
    applyMotionPref(next.motion);
    applyFxClasses(next);
    set({
      fxParticles: next.particles,
      fxParticleCount: next.particleCount,
      fxMotion: next.motion,
      fxParallax: next.parallax,
      fxLiquidGlass: next.liquidGlass,
      fxGlow: next.glow,
    });
  },

  // v1.3.0 ICS: expand an ETF's holdings and batch-screen all of them.
  // Keep stale results visible only when re-opening the same ETF.
  async openIcs(ticker) {
    const etf = ticker.toUpperCase();
    const sameEtf = get().icsResult?.etf === etf;
    set({
      view: "ics", icsEtf: etf, icsError: null,
      // a different ETF starts with a clean list; same ETF keeps
      // results + filters + scroll (v1.3.1)
      ...(sameEtf ? {} : {
        icsResult: null,
        icsView: { sectors: [], subset: 0, strategy: "", sort: "score", shown: 50 },
        icsScrollY: 0,
      }),
    });
    if (!sameEtf) await get().runIcs();
  },

  async runIcs(refresh = false) {
    const etf = get().icsEtf;
    if (!etf) return;
    set({ icsBusy: true, icsError: null });
    try {
      const { capital, riskTolerancePct, definedRiskOnly } = get();
      const icsResult = await api.icsBatch({
        etf,
        refresh,
        constraints: { capital, riskTolerancePct, definedRiskOnly },
      });
      set({ icsResult, icsBusy: false });
    } catch (err) {
      set({
        icsBusy: false,
        icsError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  patchIcsView(patch) {
    set((state) => ({ icsView: { ...state.icsView, ...patch } }));
  },
}));
