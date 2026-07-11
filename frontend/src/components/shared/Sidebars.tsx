import { useState, type ReactNode } from "react";
import { useStore } from "../../store";
import { money, strategyLabel } from "../../lib/format";
import { pctReturn } from "../../lib/journalStats";
import { cx } from "../../lib/cx";
import type { PulseQuote } from "../../types";

// v1.5.0 sidebars. Left: watchlist + recent closed trades. Right: market
// breadth, trending symbols, headlines. Data comes from the store's pulse
// (one backend fetch per minute) — the panels only render it. Desktop only
// (hidden below xl); each panel folds, and the whole rail collapses.

const PANEL = "card-glass liquid-glass p-3";
const HEADING = "flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-content-3 hover:text-content-1 transition-colors duration-150";

function Panel({ title, children, defaultOpen = true, testid }: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  testid?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={PANEL} data-testid={testid}>
      <button className={HEADING} onClick={() => setOpen(!open)}
        aria-expanded={open}>
        {title}
        <span aria-hidden className={cx(
          "transition-transform duration-200 ease-out-quad",
          open ? "rotate-0" : "-rotate-90",
        )}>▾</span>
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </section>
  );
}

function changeClass(pct: number): string {
  return pct > 0 ? "text-accent-green" : pct < 0 ? "text-accent-red" : "text-content-2";
}

function SymbolRow({ symbol, quote, onClick }: {
  symbol: string;
  quote: PulseQuote;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`Screen ${symbol}`}
      className="flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-dark-700"
    >
      <span className="font-mono text-xs font-semibold text-content-1">{symbol}</span>
      <span className="flex items-baseline gap-2 font-mono text-xs tabular-nums">
        <span className="text-content-2">{money(quote.price, 2)}</span>
        <span className={cx("w-14 text-right", changeClass(quote.changePct))}>
          {quote.changePct > 0 ? "+" : ""}{quote.changePct.toFixed(2)}%
        </span>
      </span>
    </button>
  );
}

function relativeAge(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Collapse rail shared by both sides: a slim strip with an expand chevron.
function Rail({ side, onExpand }: { side: "left" | "right"; onExpand: () => void }) {
  return (
    <button
      onClick={onExpand}
      title={`Expand ${side} sidebar`}
      aria-label={`Expand ${side} sidebar`}
      data-testid={`sidebar-rail-${side}`}
      className="sticky top-20 hidden h-24 w-6 shrink-0 items-center justify-center rounded-md text-content-3 transition-colors duration-150 hover:bg-dark-700 hover:text-content-1 xl:flex"
    >
      <span aria-hidden>{side === "left" ? "»" : "«"}</span>
    </button>
  );
}

function SidebarShell({ side, open, children }: {
  side: "left" | "right";
  open: boolean;
  children: ReactNode;
}) {
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  if (!open) return <Rail side={side} onExpand={() => toggleSidebar(side)} />;
  return (
    <aside
      data-testid={`sidebar-${side}`}
      className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-[300px] shrink-0 flex-col gap-3 overflow-y-auto xl:flex"
    >
      <div className="flex justify-end">
        <button
          onClick={() => toggleSidebar(side)}
          title={`Collapse ${side} sidebar`}
          aria-label={`Collapse ${side} sidebar`}
          className="rounded px-1.5 text-xs text-content-3 transition-colors duration-150 hover:bg-dark-700 hover:text-content-1"
        >
          {side === "left" ? "«" : "»"}
        </button>
      </div>
      {children}
    </aside>
  );
}

export function LeftSidebar() {
  const open = useStore((s) => s.leftSidebarOpen);
  const pulse = useStore((s) => s.pulse);
  const watchlist = useStore((s) => s.etfWatchlist);
  const trades = useStore((s) => s.savedTrades);
  const prefillScreener = useStore((s) => s.prefillScreener);
  const setView = useStore((s) => s.setView);

  const recentClosed = trades
    .filter((t) => t.status === "closed" && !t.archived)
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))
    .slice(0, 5);

  return (
    <SidebarShell side="left" open={open}>
      <Panel title="Watchlist" testid="sidebar-watchlist">
        {watchlist.length === 0 ? (
          <p className="px-1.5 text-xs text-content-3">
            Star ETFs in the Asset Screener to track them here.
          </p>
        ) : (
          <div className="space-y-0.5">
            {watchlist.map((sym) => {
              const quote = pulse?.watch[sym];
              return quote ? (
                <SymbolRow key={sym} symbol={sym} quote={quote}
                  onClick={() => prefillScreener(sym)} />
              ) : (
                <button key={sym} onClick={() => prefillScreener(sym)}
                  title={`Screen ${sym}`}
                  className="flex w-full items-baseline justify-between rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-dark-700">
                  <span className="font-mono text-xs font-semibold text-content-1">{sym}</span>
                  <span className="font-mono text-xs text-content-3">—</span>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Recent trades" testid="sidebar-recent-trades">
        {recentClosed.length === 0 ? (
          <p className="px-1.5 text-xs text-content-3">
            Closed positions land here.
          </p>
        ) : (
          <div className="space-y-0.5">
            {recentClosed.map((t) => (
              <button key={t.id} onClick={() => setView("journal")}
                title="Open in Position Log"
                className="w-full rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-dark-700">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-content-1">{t.symbol}</span>
                  <span className={cx("font-mono text-xs tabular-nums",
                    (t.actualPnl ?? 0) >= 0 ? "text-accent-green" : "text-accent-red")}>
                    {(t.actualPnl ?? 0) >= 0 ? "+" : ""}{money(t.actualPnl ?? 0)}
                    {pctReturn(t) !== null && (
                      <span className="ml-1 text-[10px] opacity-80">
                        ({pctReturn(t)! > 0 ? "+" : ""}{pctReturn(t)!.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-2 text-[11px] text-content-3">
                  <span className="truncate capitalize">{strategyLabel(t.strategy)}</span>
                  <span>{t.closedAt?.slice(0, 10) ?? ""}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </SidebarShell>
  );
}

export function RightSidebar() {
  const open = useStore((s) => s.rightSidebarOpen);
  const pulse = useStore((s) => s.pulse);
  const prefillScreener = useStore((s) => s.prefillScreener);

  const breadth = pulse?.breadth ?? null;

  return (
    <SidebarShell side="right" open={open}>
      <Panel title="Market breadth" testid="sidebar-breadth">
        {breadth ? (
          <div className="px-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tabular-nums text-accent-primary-text">
                {breadth.score}
              </span>
              <span className="text-xs text-content-3">/ 100</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-dark-700">
              <div
                className="h-full rounded-full bg-accent-primary transition-transform duration-500 ease-out-quad"
                style={{ transform: `scaleX(${breadth.score / 100})`, transformOrigin: "left" }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-content-3">
              {breadth.advancers} up · {breadth.decliners} down of {breadth.counted}{" "}
              large caps (S&amp;P top-holdings proxy)
            </p>
          </div>
        ) : (
          <p className="px-1.5 text-xs text-content-3">Waiting for market data…</p>
        )}
      </Panel>

      <Panel title="Trending" testid="sidebar-trending">
        {pulse ? (
          <div className="space-y-0.5">
            {pulse.trending.gainers.slice(0, 5).map((row) => (
              <SymbolRow key={row.symbol} symbol={row.symbol} quote={row}
                onClick={() => prefillScreener(row.symbol)} />
            ))}
            <div className="my-1.5 border-t border-white/10" />
            {pulse.trending.losers.slice(0, 5).map((row) => (
              <SymbolRow key={row.symbol} symbol={row.symbol} quote={row}
                onClick={() => prefillScreener(row.symbol)} />
            ))}
          </div>
        ) : (
          <p className="px-1.5 text-xs text-content-3">Waiting for market data…</p>
        )}
      </Panel>

      <Panel title="News" testid="sidebar-news">
        {pulse && pulse.news.length > 0 ? (
          <div className="space-y-1.5">
            {pulse.news.slice(0, 5).map((item, i) => (
              <a
                key={`${item.url ?? item.title}-${i}`}
                href={item.url ?? undefined}
                target="_blank"
                rel="noreferrer noopener"
                className={cx(
                  "block rounded px-1.5 py-1 transition-colors duration-150",
                  item.url ? "hover:bg-dark-700" : "cursor-default",
                )}
              >
                <span className="line-clamp-2 text-xs leading-snug text-content-2">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-content-3">
                  {item.publisher ?? "News"} · {relativeAge(item.publishedAt)}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="px-1.5 text-xs text-content-3">No headlines yet.</p>
        )}
      </Panel>
    </SidebarShell>
  );
}
