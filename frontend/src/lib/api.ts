// Single API seam: inside Electron the preload bridge handles transport
// (Phase 7); in the browser we go through Vite's /api proxy to Express.
import type {
  Account, CalcResult, EquityPoint, EtfDetail, EtfFilters, EtfRecord, EtfReference,
  EtfScreenResult, EtfStrategy, FxInfo, HoldingsInfo, IcsConstraints, IcsResult,
  JournalTrade, MarketPulse, PaperBalance, PaperHolding, PaperSettings,
  PaperState, Recommendation, ScreenResult,
} from "../types";

type Bridge = {
  marketFx?: (refresh: boolean) => Promise<FxInfo>;
  authState?: () => Promise<AuthState>;
  authRegister?: (body: unknown) => Promise<{ account: Account }>;
  authLogin?: (body: unknown) => Promise<{ account: Account }>;
  authLogout?: () => Promise<{ ok: boolean }>;
  authChangePassword?: (body: unknown) => Promise<{ ok: boolean }>;
  authDeleteAccount?: (body: unknown) => Promise<{ ok: boolean; accounts: Account[] }>;
  accountExport?: () => Promise<AccountBackup>;
  accountImport?: (body: unknown) => Promise<{ ok: boolean; restored: string[]; trades: number }>;
  accountClear?: () => Promise<{ ok: boolean }>;
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
  listTrash?: () => Promise<{ trades: JournalTrade[] }>;
  trashTrade?: (id: string) => Promise<JournalTrade>;
  restoreTrade?: (id: string) => Promise<JournalTrade>;
  trashAll?: () => Promise<{ trashed: number }>;
  restoreAllTrash?: () => Promise<{ restored: number }>;
  purgeTrash?: () => Promise<{ purged: number }>;
  paperGet?: () => Promise<PaperState>;
  paperBudget?: (body: unknown) => Promise<{ budget: unknown; balance: PaperBalance }>;
  paperOpen?: (body: unknown) => Promise<{ trade: JournalTrade; balance: PaperBalance }>;
  paperClose?: (id: string, body: unknown) => Promise<{ trade: JournalTrade; balance: PaperBalance }>;
  paperProcess?: () => Promise<PaperProcessResult>;
  paperCurve?: (days: number) => Promise<{ points: EquityPoint[] }>;
  paperReset?: (body: unknown) => Promise<{ archived: number; balance: PaperBalance }>;
  paperSettings?: (body: unknown) => Promise<{ settings: PaperSettings }>;
  paperSellHolding?: (symbol: string, body: unknown) => Promise<PaperSellResult>;
  etfReference?: () => Promise<EtfReference>;
  etfUniverse?: () => Promise<{ etfs: EtfRecord[] }>;
  etfScreen?: (body: unknown) => Promise<EtfScreenResult>;
  etfRefresh?: (body: unknown) => Promise<{ refreshed: number; errors?: string[]; universe: EtfRecord[] }>;
  etfDetail?: (ticker: string) => Promise<{ etf: EtfDetail }>;
  etfWatchlist?: () => Promise<{ etfs: EtfRecord[] }>;
  etfWatchToggle?: (body: unknown) => Promise<{ watchlist: string[] }>;
  icsHoldings?: (ticker: string) => Promise<HoldingsInfo>;
  icsBatch?: (body: unknown) => Promise<IcsResult>;
  marketPulse?: (watch: string) => Promise<MarketPulse>;
};

// v1.5.0: process() now also returns assignment events + holdings snapshot
export interface PaperProcessResult {
  trades: JournalTrade[];
  balance: PaperBalance;
  warnings: string[];
  events?: string[];
  holdings?: PaperHolding[];
}

export interface PaperSellResult {
  sold: { symbol: string; shares: number; price: number; realized: number };
  holdings: PaperHolding[];
  balance: PaperBalance;
}

export interface AuthState {
  account: Account | null;
  accounts: Account[];
}

// v1.7.2 account backup: data files pass through verbatim; prefs (theme,
// currency, columns…) are added client-side from localStorage at export.
export interface AccountBackup {
  app: string;
  format: number;
  exportedAt: string;
  data: { trades: unknown; paper: unknown; etf: unknown };
  prefs?: Record<string, string>;
}

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
  // v1.7.0 currency
  marketFx(refresh = false): Promise<FxInfo> {
    return bridge()?.marketFx?.(refresh)
      ?? request("GET", `/market/fx${refresh ? "?refresh=1" : ""}`);
  },
  // v1.6.0 local accounts
  authState(): Promise<AuthState> {
    return bridge()?.authState?.() ?? request("GET", "/auth/state");
  },
  authRegister(body: { username: string; password: string }): Promise<{ account: Account }> {
    return bridge()?.authRegister?.(body) ?? post("/auth/register", body);
  },
  authLogin(body: { username: string; password: string; rememberMe: boolean }): Promise<{ account: Account }> {
    return bridge()?.authLogin?.(body) ?? post("/auth/login", body);
  },
  authLogout(): Promise<{ ok: boolean }> {
    return bridge()?.authLogout?.() ?? post("/auth/logout", {});
  },
  // v1.7.2 account settings
  authChangePassword(body: { currentPassword: string; newPassword: string }): Promise<{ ok: boolean }> {
    return bridge()?.authChangePassword?.(body) ?? post("/auth/change-password", body);
  },
  authDeleteAccount(body: { password: string }): Promise<{ ok: boolean; accounts: Account[] }> {
    return bridge()?.authDeleteAccount?.(body) ?? post("/auth/delete-account", body);
  },
  accountExport(): Promise<AccountBackup> {
    return bridge()?.accountExport?.() ?? request("GET", "/account/export");
  },
  accountImport(body: AccountBackup): Promise<{ ok: boolean; restored: string[]; trades: number }> {
    return bridge()?.accountImport?.(body) ?? post("/account/import", body);
  },
  accountClear(): Promise<{ ok: boolean }> {
    return bridge()?.accountClear?.() ?? post("/account/clear", {});
  },
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
  // v1.5.1 trash (soft delete)
  listTrash(): Promise<{ trades: JournalTrade[] }> {
    return bridge()?.listTrash?.() ?? request("GET", "/journal/trash");
  },
  trashTrade(id: string): Promise<JournalTrade> {
    return bridge()?.trashTrade?.(id) ?? post(`/journal/${encodeURIComponent(id)}/trash`, {});
  },
  restoreTrade(id: string): Promise<JournalTrade> {
    return bridge()?.restoreTrade?.(id) ?? post(`/journal/${encodeURIComponent(id)}/restore`, {});
  },
  trashAll(): Promise<{ trashed: number }> {
    return bridge()?.trashAll?.() ?? post("/journal/trash-all", {});
  },
  restoreAllTrash(): Promise<{ restored: number }> {
    return bridge()?.restoreAllTrash?.() ?? post("/journal/restore-all", {});
  },
  purgeTrash(): Promise<{ purged: number }> {
    return bridge()?.purgeTrash?.() ?? post("/journal/purge-trash", {});
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
      ?? post<PaperProcessResult>("/paper/process", {});
  },
  paperSettings(patch: Partial<PaperSettings>): Promise<{ settings: PaperSettings }> {
    return bridge()?.paperSettings?.(patch)
      ?? request("PUT", "/paper/settings", patch);
  },
  paperSellHolding(symbol: string, body: { shares?: number; price?: number }): Promise<PaperSellResult> {
    return bridge()?.paperSellHolding?.(symbol, body)
      ?? post<PaperSellResult>(`/paper/holdings/${encodeURIComponent(symbol)}/sell`, body);
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
  marketPulse(watch: string[]): Promise<MarketPulse> {
    const joined = watch.join(",");
    return bridge()?.marketPulse?.(joined)
      ?? request("GET", `/market/pulse${joined ? `?watch=${encodeURIComponent(joined)}` : ""}`);
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
      throw new Error(`Clipboard unavailable, copy manually: ${text}`);
    }
  },
};
