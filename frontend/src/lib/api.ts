// Single API seam: inside Electron the preload bridge handles transport
// (Phase 7); in the browser we go through Vite's /api proxy to Express.
import type { CalcResult, Recommendation, SavedTrade, ScreenResult } from "../types";

type Bridge = {
  detect?: (body: unknown) => Promise<ScreenResult>;
  calculate?: (body: unknown) => Promise<CalcResult>;
  recommend?: (body: unknown) => Promise<Recommendation>;
  exportTrade?: (text: string) => Promise<void>;
  listTrades?: () => Promise<{ trades: SavedTrade[] }>;
  saveTrade?: (body: unknown) => Promise<SavedTrade>;
  deleteTrade?: (id: string) => Promise<{ removed: boolean }>;
};

function bridge(): Bridge | null {
  return (window as { optionsDetective?: Bridge }).optionsDetective ?? null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      (payload as { error?: string }).error ?? `${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const post = <T,>(path: string, body: unknown) => request<T>("POST", path, body);

export const api = {
  detect(body: unknown): Promise<ScreenResult> {
    return bridge()?.detect?.(body) ?? post<ScreenResult>("/detect", body);
  },
  calculate(body: unknown): Promise<CalcResult> {
    return bridge()?.calculate?.(body) ?? post<CalcResult>("/calculate", body);
  },
  recommend(body: unknown): Promise<Recommendation> {
    return bridge()?.recommend?.(body) ?? post<Recommendation>("/recommend", body);
  },
  listTrades(): Promise<{ trades: SavedTrade[] }> {
    return bridge()?.listTrades?.() ?? request("GET", "/trades");
  },
  saveTrade(body: unknown): Promise<SavedTrade> {
    return bridge()?.saveTrade?.(body) ?? post("/trades", body);
  },
  deleteTrade(id: string): Promise<{ removed: boolean }> {
    return bridge()?.deleteTrade?.(id)
      ?? request("DELETE", `/trades/${encodeURIComponent(id)}`);
  },
  async exportTrade(text: string): Promise<void> {
    const b = bridge();
    if (b?.exportTrade) {
      await b.exportTrade(text);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard can be permission-gated in plain browsers; surface the
      // order so the user can copy it by hand rather than losing it
      throw new Error(`Clipboard unavailable — copy manually: ${text}`);
    }
  },
};
