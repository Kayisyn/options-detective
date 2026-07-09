// Single API seam: inside Electron the preload bridge handles transport
// (Phase 7); in the browser we go through Vite's /api proxy to Express.
import type {
  CalcResult, EquityPoint, EtfDetail, EtfFilters, EtfRecord, EtfReference,
  EtfScreenResult, EtfStrategy, HoldingsInfo, IcsConstraints, IcsResult,
  JournalTrade, PaperBalance, PaperState, Recommendation, ScreenResult,
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
  paperGet?: () => Promise<PaperState>;
  paperBudget?: (body: unknown) => Promise<{ budget: unknown; balance: PaperBalance }>;
  paperOpen?: (body: unknown) => Promise<{ trade: JournalTrade; balance: PaperBalance }>;
  paperClose?: (id: string, body: unknown) => Promise<{ trade: JournalTrade; balance: PaperBalance }>;
  paperProcess?: () => Promise<{ trades: JournalTrade[]; balance: PaperBalance; warnings: string[] }>;
  paperCurve?: (days: number) => Promise<{ points: EquityPoint[] }>;
  paperReset?: (body: unknown) => Promise<{ archived: number; balance: PaperBalance }>;
  etfReference?: () => Promise<EtfReference>;
  etfUniverse?: () => Promise<{ etfs: EtfRecord[] }>;
  etfScreen?: (body: unknown) => Promise<EtfScreenResult>;
  etfRefresh?: (body: unknown) => Promise<{ refreshed: number; errors?: string[]; universe: EtfRecord[] }>;
  etfDetail?: (ticker: string) => Promise<{ etf: EtfDetail }>;
  etfWatchlist?: () => Promise<{ etfs: EtfRecord[] }>;
  etfWatchToggle?: (body: unknown) => Promise<{ watchlist: string[] }>;
  icsHoldings?: (ticker: string) => Promise<HoldingsInfo>;
  icsBatch?: (body: unknown) => Promise<IcsResult>;
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
  paperGet(): Promise<PaperState> {
    return bridge()?.paperGet?.() ?? request("GET", "/paper");
  },
  paperBudget(initialBalance: number) {
    return bridge()?.paperBudget?.({ initialBalance })
      ?? post<{ budget: unknown; balance: PaperBalance }>("/paper/budget", { initialBalance });
  },
  paperOpen(body: unknown) {
    return bridge()?.paperOpen?.(body)
      ?? post<{ trade: JournalTrade; balance: PaperBalance }>("/paper/trades", body);
  },
  paperClose(id: string, body: unknown) {
    return bridge()?.paperClose?.(id, body)
      ?? post<{ trade: JournalTrade; balance: PaperBalance }>(`/paper/trades/${encodeURIComponent(id)}/close`, body);
  },
  paperProcess() {
    return bridge()?.paperProcess?.()
      ?? post<{ trades: JournalTrade[]; balance: PaperBalance; warnings: string[] }>("/paper/process", {});
  },
  paperCurve(days: number): Promise<{ points: EquityPoint[] }> {
    return bridge()?.paperCurve?.(days) ?? request("GET", `/paper/equity-curve?days=${days}`);
  },
  paperReset(initialBalance?: number) {
    return bridge()?.paperReset?.({ initialBalance })
      ?? post<{ archived: number; balance: PaperBalance }>("/paper/reset", { initialBalance });
  },
  etfReference(): Promise<EtfReference> {
    return bridge()?.etfReference?.() ?? request("GET", "/etf-screener/reference");
  },
  etfUniverse(): Promise<{ etfs: EtfRecord[] }> {
    return bridge()?.etfUniverse?.() ?? request("GET", "/etf-screener/universe");
  },
  etfScreen(body: { filters: EtfFilters; strategy: EtfStrategy; limit?: number }): Promise<EtfScreenResult> {
    return bridge()?.etfScreen?.(body) ?? post<EtfScreenResult>("/etf-screener/screen", body);
  },
  etfRefresh(tickers?: string[]) {
    return bridge()?.etfRefresh?.({ tickers })
      ?? post<{ refreshed: number; errors?: string[]; universe: EtfRecord[] }>("/etf-screener/refresh", { tickers });
  },
  etfDetail(ticker: string): Promise<{ etf: EtfDetail }> {
    return bridge()?.etfDetail?.(ticker)
      ?? request("GET", `/etf-screener/etf/${encodeURIComponent(ticker)}`);
  },
  etfWatchlist(): Promise<{ etfs: EtfRecord[] }> {
    return bridge()?.etfWatchlist?.() ?? request("GET", "/etf-screener/watchlist");
  },
  etfWatchToggle(ticker: string, action: "add" | "remove") {
    return bridge()?.etfWatchToggle?.({ ticker, action })
      ?? post<{ watchlist: string[] }>("/etf-screener/watchlist", { ticker, action });
  },
  icsHoldings(ticker: string): Promise<HoldingsInfo> {
    return bridge()?.icsHoldings?.(ticker)
      ?? request("GET", `/screener/etf/${encodeURIComponent(ticker)}/holdings`);
  },
  icsBatch(body: { etf: string; constraints?: IcsConstraints; refresh?: boolean }): Promise<IcsResult> {
    return bridge()?.icsBatch?.(body) ?? post<IcsResult>("/screener/batch", body);
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
