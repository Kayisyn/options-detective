// v1.9.3: the store's localStorage persistence layer, extracted from
// store.ts so the store file holds state + actions and this file owns the
// read/write/validate helpers. Pure functions — no store dependency — so
// moving them here cannot change runtime behavior. store.ts re-exports the
// public names (readLastScreen, SidebarSection) to keep its import surface
// unchanged.
import {
  COMPONENT_KEYS, DEFAULT_WEIGHTS, type ScoreWeights,
} from "./scoring";
import { type MotionPref } from "./motionPref";

export const LAST_SCREEN_KEY = "od.lastScreen";
export const WEIGHTS_KEY = "od.weights.v1";
export const PROFILES_KEY = "od.weightProfiles.v1";
export const FX_KEY = "od.fx.v1"; // v1.5.0 visual-effects prefs
export const SIDEBAR_ORDER_KEY = "od.sidebarOrder.v1"; // v1.5.1
export const CURRENCY_KEY = "od.currency.v1"; // v1.7.0

// v1.7.0 currency display preference (per machine, like themes)
export interface CurrencyPrefs {
  mode: "usd" | "cad" | "dual";
  autoUpdate: boolean;
}

export const DEFAULT_CURRENCY: CurrencyPrefs = { mode: "usd", autoUpdate: true };

export function readCurrencyPrefs(): CurrencyPrefs {
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

export function writeCurrencyPrefs(prefs: CurrencyPrefs) {
  try {
    localStorage.setItem(CURRENCY_KEY, JSON.stringify(prefs));
  } catch { /* private mode */ }
}

// v1.5.1: the right sidebar holds all five sections; the user reorders them
// in Settings and the order persists.
export type SidebarSection = "watchlist" | "recentTrades" | "breadth" | "trending" | "news";
export const DEFAULT_SIDEBAR_ORDER: SidebarSection[] =
  ["watchlist", "recentTrades", "breadth", "trending", "news"];

export function readSidebarOrder(): SidebarSection[] {
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

export function writeSidebarOrder(order: SidebarSection[]) {
  try {
    localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(order));
  } catch {
    // private mode: order lives for the session only
  }
}

export interface FxPrefs {
  particles: boolean;
  particleCount: number; // 50-300
  motion: MotionPref;    // system | on | off
  // v1.5.1 performance debug toggles — all default ON (preserve visuals)
  parallax: boolean;     // cursor depth shift on the particle layer
  liquidGlass: boolean;  // flowing shimmer on cards/buttons/inputs
  glow: boolean;         // neon halo + P&L + focus box-shadow glows
}

export const DEFAULT_FX: FxPrefs = {
  particles: true, particleCount: 200, motion: "system",
  parallax: true, liquidGlass: true, glow: true,
};

// older payloads predate the debug toggles; a missing flag defaults ON
function readBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function readStoredFx(): FxPrefs {
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

export function writeStoredFx(fx: FxPrefs) {
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

export function readStoredWeights(): ScoreWeights {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEIGHTS_KEY) ?? "null");
    return isWeights(parsed) ? parsed : { ...DEFAULT_WEIGHTS };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

export function readStoredProfiles(): WeightProfile[] {
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
