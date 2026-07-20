// v1.9.1 feedback & bug reports. No token ships with the app: submissions
// open a PRE-FILLED GitHub issue in the user's browser (they author it under
// their own account), and every submission also lands in a local queue
// (od.feedback.v1) so nothing is lost offline — queued entries can be
// re-opened or copied later. The roadmap's direct-API option would embed a
// GitHub token in a distributed binary, which is unsafe by construction.
import type { JournalTrade } from "../types";

export const FEEDBACK_REPO = "kmptrades/options-detective";

export type FeedbackType = "bug" | "feature" | "feedback";

export const FEEDBACK_TYPES: Array<{ id: FeedbackType; label: string; titleTag: string; label2: string }> = [
  { id: "bug", label: "Report a bug", titleTag: "[Bug]", label2: "bug" },
  { id: "feature", label: "Feature request", titleTag: "[Feature]", label2: "enhancement" },
  { id: "feedback", label: "General feedback", titleTag: "[Feedback]", label2: "feedback" },
];

export interface FeedbackMeta {
  version: string;
  theme: string;
  platform: string;
  view: string;
  username: string;
  at: string;
}

export interface FeedbackEntry {
  id: string;
  type: FeedbackType;
  text: string;
  meta: FeedbackMeta | null;       // null when diagnostics were declined
  positionSummary: string | null;  // counts only, when opted in
  status: "opened" | "queued";
  at: string;
}

const QUEUE_KEY = "od.feedback.v1";
const QUEUE_LIMIT = 20;

export function buildMeta(input: {
  version: string; theme: string; view: string; username: string;
}): FeedbackMeta {
  return {
    version: input.version,
    theme: input.theme,
    platform: navigator.platform || "unknown",
    view: input.view,
    // usernames are 3-20 alnum by validation; trim defensively anyway
    username: input.username.replace(/[^A-Za-z0-9]/g, "").slice(0, 20),
    at: new Date().toISOString(),
  };
}

// counts only — no prices, no P&L, nothing sensitive leaves the machine
export function buildPositionSummary(trades: JournalTrade[]): string {
  const open = trades.filter((t) => t.status === "open").length;
  const closed = trades.length - open;
  const strategies = new Map<string, number>();
  for (const t of trades) strategies.set(t.strategy, (strategies.get(t.strategy) ?? 0) + 1);
  const byStrategy = [...strategies.entries()]
    .map(([k, n]) => `${k} ×${n}`)
    .join(", ");
  return `${trades.length} positions (${open} open, ${closed} settled)${byStrategy ? ` — ${byStrategy}` : ""}`;
}

export function issueTitle(entry: Pick<FeedbackEntry, "type" | "text">): string {
  const tag = FEEDBACK_TYPES.find((t) => t.id === entry.type)?.titleTag ?? "[Feedback]";
  const firstLine = entry.text.trim().split(/\r?\n/)[0] ?? "";
  const summary = firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
  return `${tag} ${summary || "User feedback"}`;
}

export function issueBody(entry: FeedbackEntry): string {
  const lines = ["**User feedback:**", "", entry.text.trim(), ""];
  if (entry.meta) {
    lines.push(
      "---",
      `App version: v${entry.meta.version}`,
      `Theme: ${entry.meta.theme}`,
      `Platform: ${entry.meta.platform}`,
      `View: ${entry.meta.view}`,
      `User: ${entry.meta.username}`,
      `Submitted: ${entry.meta.at}`,
    );
  }
  if (entry.positionSummary) {
    lines.push("", `Position log: ${entry.positionSummary}`);
  }
  lines.push("", "_Screenshots: paste directly into this issue if helpful._");
  return lines.join("\n");
}

export function issueUrl(entry: FeedbackEntry): string {
  const labels = FEEDBACK_TYPES.find((t) => t.id === entry.type)?.label2 ?? "feedback";
  const params = new URLSearchParams({
    title: issueTitle(entry),
    body: issueBody(entry),
    labels: `${labels},user-reported`,
  });
  return `https://github.com/${FEEDBACK_REPO}/issues/new?${params.toString()}`;
}

// ---- local queue -----------------------------------------------------------

export function loadFeedbackQueue(): FeedbackEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "null");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQueue(entries: FeedbackEntry[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(0, QUEUE_LIMIT)));
  } catch {
    /* private mode */
  }
}

export function enqueueFeedback(entry: FeedbackEntry) {
  persistQueue([entry, ...loadFeedbackQueue()]);
}

export function markFeedbackOpened(id: string) {
  persistQueue(loadFeedbackQueue().map((e) => (e.id === id ? { ...e, status: "opened" as const } : e)));
}

export function deleteFeedback(id: string) {
  persistQueue(loadFeedbackQueue().filter((e) => e.id !== id));
}
