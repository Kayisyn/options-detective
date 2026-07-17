import { useState, type ReactNode } from "react";
import { useStore } from "../../store";
import { money, strategyLabel } from "../../lib/format";
import { DualValue } from "../../lib/currency";
import { pctReturn } from "../../lib/journalStats";
import { cx } from "../../lib/cx";
import type { SidebarSection } from "../../store";
import type { PulseQuote } from "../../types";

// v1.5.1 single right sidebar. All five sections (watchlist, recent trades,
// market breadth, trending, news) live here; the user reorders them in
// Settings → Sidebar and the order persists. Data comes from the store's
// pulse (one backend fetch per minute) + watchlist/trades. Desktop only
// (hidden below xl); each panel folds, and the whole rail collapses.

const PANEL = "card-glass liquid-glass p-3";
const HEADING = "flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-heading hover:text-content-1 transition-colors duration-150";

export const SECTION_LABELS: Record<SidebarSection, string> = {
  watchlist: "Watchlist",
  recentTrades: "Recent trades",
  breadth: "Market breadth",
  trending: "Trending",
  news: "News",
};

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

// ---- individual section bodies ------------------------------------------

function WatchlistBody() {
  const pulse = useStore((s) => s.pulse);
  const watchlist = useStore((s) => s.etfWatchlist);
  const prefillScreener = useStore((s) => s.prefillScreener);
  if (watchlist.length === 0) {
    return <p className="px-1.5 text-xs text-content-3">Star ETFs in the Asset Screener to track them here.</p>;
  }
  return (
    <div className="space-y-0.5">
      {watchlist.map((sym) => {
        const quote = pulse?.watch[sym];
        return quote ? (
          <SymbolRow key={sym} symbol={sym} quote={quote} onClick={() => prefillScreener(sym)} />
        ) : (
          <button key={sym} onClick={() => prefillScreener(sym)} title={`Screen ${sym}`}
            className="flex w-full items-baseline justify-between rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-dark-700">
            <span className="font-mono text-xs font-semibold text-content-1">{sym}</span>
            <span className="font-mono text-xs text-content-3">—</span>
          </button>
        );
      })}
    </div>
  );
}

function RecentTradesBody() {
  const trades = useStore((s) => s.savedTrades);
  const setView = useStore((s) => s.setView);
  const recentClosed = trades
    .filter((t) => t.status === "closed" && !t.archived)
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))
    .slice(0, 5);
  if (recentClosed.length === 0) {
    return <p className="px-1.5 text-xs text-content-3">Closed positions land here.</p>;
  }
  return (
    <div className="space-y-0.5">
      {recentClosed.map((t) => (
        <button key={t.id} onClick={() => setView("journal")} title="Open in Position Log"
          className="w-full rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-dark-700">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-content-1">{t.symbol}</span>
            <span className={cx("font-mono text-xs tabular-nums",
              (t.actualPnl ?? 0) >= 0 ? "text-accent-green" : "text-accent-red")}>
              <DualValue usd={t.actualPnl ?? 0} signed
                histRate={t.exchangeRateAtClose ?? t.exchangeRateUsed ?? null} />
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
  );
}

function BreadthBody() {
  const breadth = useStore((s) => s.pulse?.breadth ?? null);
  if (!breadth) return <p className="px-1.5 text-xs text-content-3">Waiting for market data…</p>;
  return (
    <div className="px-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold tabular-nums text-accent-primary-text">
          {breadth.score}
        </span>
        <span className="text-xs text-content-3">/ 100</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-dark-700">
        <div className="h-full rounded-full bg-accent-primary transition-transform duration-500 ease-out-quad"
          style={{ transform: `scaleX(${breadth.score / 100})`, transformOrigin: "left" }} />
      </div>
      <p className="mt-1.5 text-[11px] text-content-3">
        {breadth.advancers} up · {breadth.decliners} down of {breadth.counted}{" "}
        large caps (S&amp;P top-holdings proxy)
      </p>
    </div>
  );
}

function TrendingBody() {
  const pulse = useStore((s) => s.pulse);
  const prefillScreener = useStore((s) => s.prefillScreener);
  if (!pulse) return <p className="px-1.5 text-xs text-content-3">Waiting for market data…</p>;
  return (
    <div className="space-y-0.5">
      {pulse.trending.gainers.slice(0, 5).map((row) => (
        <SymbolRow key={row.symbol} symbol={row.symbol} quote={row} onClick={() => prefillScreener(row.symbol)} />
      ))}
      <div className="my-1.5 border-t border-white/10" />
      {pulse.trending.losers.slice(0, 5).map((row) => (
        <SymbolRow key={row.symbol} symbol={row.symbol} quote={row} onClick={() => prefillScreener(row.symbol)} />
      ))}
    </div>
  );
}

function NewsBody() {
  const pulse = useStore((s) => s.pulse);
  if (!pulse || pulse.news.length === 0) {
    return <p className="px-1.5 text-xs text-content-3">No headlines yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {pulse.news.slice(0, 5).map((item, i) => (
        <a key={`${item.url ?? item.title}-${i}`} href={item.url ?? undefined}
          target="_blank" rel="noreferrer noopener"
          className={cx("block rounded px-1.5 py-1 transition-colors duration-150",
            item.url ? "hover:bg-dark-700" : "cursor-default")}>
          <span className="line-clamp-2 text-xs leading-snug text-content-2">{item.title}</span>
          <span className="mt-0.5 block text-[11px] text-content-3">
            {item.publisher ?? "News"} · {relativeAge(item.publishedAt)}
          </span>
        </a>
      ))}
    </div>
  );
}

const SECTION_BODIES: Record<SidebarSection, () => JSX.Element> = {
  watchlist: WatchlistBody,
  recentTrades: RecentTradesBody,
  breadth: BreadthBody,
  trending: TrendingBody,
  news: NewsBody,
};

const SECTION_TESTIDS: Record<SidebarSection, string> = {
  watchlist: "sidebar-watchlist",
  recentTrades: "sidebar-recent-trades",
  breadth: "sidebar-breadth",
  trending: "sidebar-trending",
  news: "sidebar-news",
};

export function RightSidebar() {
  const open = useStore((s) => s.rightSidebarOpen);
  const toggle = useStore((s) => s.toggleRightSidebar);
  const order = useStore((s) => s.sidebarOrder);

  if (!open) {
    return (
      <button
        onClick={toggle}
        title="Expand sidebar"
        aria-label="Expand sidebar"
        data-testid="sidebar-rail-right"
        className="sticky top-20 hidden h-24 w-6 shrink-0 items-center justify-center rounded-md text-content-3 transition-colors duration-150 hover:bg-dark-700 hover:text-content-1 xl:flex"
      >
        <span aria-hidden>«</span>
      </button>
    );
  }

  return (
    <aside
      data-testid="sidebar-right"
      className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-[300px] shrink-0 flex-col gap-3 overflow-y-auto xl:flex"
    >
      <div className="flex justify-end">
        <button
          onClick={toggle}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="rounded px-1.5 text-xs text-content-3 transition-colors duration-150 hover:bg-dark-700 hover:text-content-1"
        >
          »
        </button>
      </div>
      {order.map((section) => {
        const Body = SECTION_BODIES[section];
        return (
          <Panel key={section} title={SECTION_LABELS[section]} testid={SECTION_TESTIDS[section]}>
            <Body />
          </Panel>
        );
      })}
    </aside>
  );
}
