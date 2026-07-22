// v1.9.0 notifications/alerts. Pure evaluation over store data — the
// intervals live in useAlerts (App). Alerts fire as OS notifications via the
// Web Notification API when permitted, falling back to the in-app toast;
// every fired alert lands in a 50-entry history. A fired-keys ledger stops
// the same condition re-firing every sweep (one alert per condition per day
// or per position).
import type { EtfRecord, JournalTrade } from "../types";

export interface AlertPrefs {
  pnlEnabled: boolean;
  pnlUp: number;        // alert when today's realized P&L >= this (dollars)
  pnlDown: number;      // alert when today's realized P&L <= -this (dollars)
  expiryEnabled: boolean;
  expiry7d: boolean;    // 7 days before expiration
  expiryDay: boolean;   // on expiration day
  scoreEnabled: boolean;
  scoreIvRank: number;  // alert when the screener holds IV rank >= this
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  pnlEnabled: false,
  pnlUp: 500,
  pnlDown: 200,
  expiryEnabled: true,
  expiry7d: true,
  expiryDay: true,
  scoreEnabled: false,
  scoreIvRank: 80,
};

export interface AlertEvent {
  key: string;    // dedup key, one fire per key
  type: "pnl" | "expiry" | "score";
  title: string;
  body: string;
}

export interface AlertHistoryEntry extends AlertEvent {
  at: string; // ISO
}

const PREFS_KEY = "od.alerts.v1";
const HISTORY_KEY = "od.alertHistory.v1";
const FIRED_KEY = "od.alertFired.v1";
const HISTORY_LIMIT = 50;

export function loadAlertPrefs(): AlertPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    return { ...DEFAULT_ALERT_PREFS, ...(stored && typeof stored === "object" ? stored : {}) };
  } catch {
    return { ...DEFAULT_ALERT_PREFS };
  }
}

export function saveAlertPrefs(prefs: AlertPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode: prefs live for the session
  }
}

export function loadAlertHistory(): AlertHistoryEntry[] {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "null");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function clearAlertHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

function pushHistory(entries: AlertHistoryEntry[]) {
  try {
    const next = [...entries, ...loadAlertHistory()].slice(0, HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

// fired-keys ledger: { key: firedAtIso }, pruned after 7 days
function loadFired(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(FIRED_KEY) ?? "null");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function saveFired(fired: Record<string, string>) {
  try {
    const cutoff = Date.now() - 7 * 86_400_000;
    const pruned = Object.fromEntries(
      Object.entries(fired).filter(([, at]) => Date.parse(at) >= cutoff),
    );
    localStorage.setItem(FIRED_KEY, JSON.stringify(pruned));
  } catch {
    /* ignore */
  }
}

// ---- evaluators (pure) -----------------------------------------------------

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// daily P&L = realized P&L of positions settled today
export function evaluatePnl(trades: JournalTrade[], prefs: AlertPrefs, now: Date): AlertEvent[] {
  if (!prefs.pnlEnabled) return [];
  const day = today(now);
  const daily = trades
    .filter((t) => t.status !== "open" && t.actualPnl !== null
      && (t.closedAt ?? t.exitDate ?? "").slice(0, 10) === day)
    .reduce((s, t) => s + (t.actualPnl ?? 0), 0);
  const events: AlertEvent[] = [];
  if (prefs.pnlUp > 0 && daily >= prefs.pnlUp) {
    events.push({
      key: `pnl-up:${day}`,
      type: "pnl",
      title: "Daily P&L goal hit 🎉",
      body: `Realized ${daily >= 0 ? "+" : ""}$${daily.toFixed(0)} today, your goal was +$${prefs.pnlUp.toFixed(0)}.`,
    });
  }
  if (prefs.pnlDown > 0 && daily <= -prefs.pnlDown) {
    events.push({
      key: `pnl-down:${day}`,
      type: "pnl",
      title: "Daily loss threshold reached",
      body: `Realized -$${Math.abs(daily).toFixed(0)} today, your limit was -$${prefs.pnlDown.toFixed(0)}.`,
    });
  }
  return events;
}

export function evaluateExpiry(trades: JournalTrade[], prefs: AlertPrefs, now: Date): AlertEvent[] {
  if (!prefs.expiryEnabled) return [];
  const events: AlertEvent[] = [];
  for (const t of trades) {
    if (t.status !== "open" || !t.expiration || t.deletedAt) continue;
    const days = Math.round((Date.parse(`${t.expiration}T21:00:00Z`) - now.getTime()) / 86_400_000);
    if (prefs.expiryDay && days === 0) {
      events.push({
        key: `expiry-day:${t.id}`,
        type: "expiry",
        title: "Position expires today",
        body: `${t.symbol} ${t.strategy.replace(/_/g, " ")} expires today, close, roll or let it settle.`,
      });
    } else if (prefs.expiry7d && days > 0 && days <= 7) {
      events.push({
        key: `expiry-7d:${t.id}`,
        type: "expiry",
        title: "Position expiring soon",
        body: `${t.symbol} ${t.strategy.replace(/_/g, " ")} expires in ${days} ${days === 1 ? "day" : "days"} (${t.expiration}).`,
      });
    }
  }
  return events;
}

export function evaluateScore(etfs: EtfRecord[], prefs: AlertPrefs, now: Date): AlertEvent[] {
  if (!prefs.scoreEnabled) return [];
  const day = today(now);
  return etfs
    .filter((e) => e.ivRank !== null && e.ivRank >= prefs.scoreIvRank)
    .map((e) => ({
      key: `iv:${e.ticker}:${day}`,
      type: "score" as const,
      title: "High IV rank found",
      body: `${e.ticker} IV rank ${Math.round(e.ivRank ?? 0)} ≥ ${prefs.scoreIvRank}, premium selling setup.`,
    }));
}

// ---- delivery --------------------------------------------------------------

export type NotifyFallback = (message: string) => void;

function deliverOs(event: AlertEvent): boolean {
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission !== "granted") return false;
    // eslint-disable-next-line no-new -- fire-and-forget OS toast
    new Notification(`Option Obelisk, ${event.title}`, { body: event.body, tag: event.key });
    return true;
  } catch {
    return false;
  }
}

export function requestNotifyPermission(): Promise<NotificationPermission> {
  try {
    if (typeof Notification === "undefined") return Promise.resolve("denied");
    if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
    return Notification.requestPermission();
  } catch {
    return Promise.resolve("denied");
  }
}

export function notifyPermission(): NotificationPermission | "unsupported" {
  try {
    return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  } catch {
    return "unsupported";
  }
}

// Fire any not-yet-fired events: OS notification when permitted, otherwise
// the in-app fallback. Appends to history. Returns what actually fired.
export function fireAlerts(events: AlertEvent[], fallback: NotifyFallback, now: Date): AlertHistoryEntry[] {
  if (events.length === 0) return [];
  const fired = loadFired();
  const fresh = events.filter((e) => !fired[e.key]);
  if (fresh.length === 0) return [];
  const entries: AlertHistoryEntry[] = fresh.map((e) => ({ ...e, at: now.toISOString() }));
  for (const event of fresh) {
    fired[event.key] = now.toISOString();
    if (!deliverOs(event)) fallback(`📢 ${event.title}, ${event.body}`);
  }
  saveFired(fired);
  pushHistory(entries);
  return entries;
}
