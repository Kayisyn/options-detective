// Single API seam: inside Electron the preload bridge handles transport
// (Phase 7); in the browser we go through Vite's /api proxy to Express.
import type {
  CalcResult, JournalTrade, Recommendation, ScreenResult,
} from "../types";

type Bridge = {
  detect?: (body: unknown) => Promise<ScreenResult>;
  calculate?: (body: unknown) => Promise<CalcResult>;
  recommend?: (body: unknown) => Promise<Recommendation>;
  exportTrade?: (text: string) => Promise<void>;
  listTrades?: () => Promise<{ trades: JournalTrade[] }>;
  saveTrade?: (body: unknown) => Promise<JournalTrade>;
  patchTrade?: (id: string, body: unknown) => Promise<JournalTrade>;
  closeTrade?: (id: string, body: unknown) => Promise<JournalTrade>;
  deleteTrade?: (id: string) => Promise<{ removed: boolean }>;
  refreshMarks?: () => Promise<{ trades: JournalTrade[]; warnings: string[] }>;
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
  listTrades(): Promise<{ trades: JournalTrade[] }> {
    return bridge()?.listTrades?.() ?? request("GET", "/journal");
  },
  saveTrade(body: unknown): Promise<JournalTrade> {
    return bridge()?.saveTrade?.(body) ?? post("/journal", body);
  },
  patchTrade(id: string, body: unknown): Promise<JournalTrade> {
    return bridge()?.patchTrade?.(id, body)
      ?? request("PATCH", `/journal/${encodeURIComponent(id)}`, body);
  },
  closeTrade(id: string, body: unknown): Promise<JournalTrade> {
    return bridge()?.closeTrade?.(id, body)
      ?? post(`/journal/${encodeURIComponent(id)}/close`, body);
  },
  deleteTrade(id: string): Promise<{ removed: boolean }> {
    return bridge()?.deleteTrade?.(id)
      ?? request("DELETE", `/journal/${encodeURIComponent(id)}`);
  },
  refreshMarks(): Promise<{ trades: JournalTrade[]; warnings: string[] }> {
    return bridge()?.refreshMarks?.() ?? post("/journal/marks", {});
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
