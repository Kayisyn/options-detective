import { useEffect } from "react";
import { readLastScreen, useStore } from "../store";
import { money, pct, strategyLabel } from "../lib/format";
import Button from "./ui/Button";
import { Card } from "./ui/Card";

// Home screen, v1.4.0: obsidian hero with quick-start CTAs, a live stats
// row (sandbox balance, realized P&L, win rate) and feature highlights.

const FEATURES = [
  { icon: "⚡", title: "Real-time screening", desc: "Every expiration × every eligible strategy, priced and ranked in one pass" },
  { icon: "📊", title: "Trade analysis", desc: "Exact greeks, breakevens and probabilities from a deterministic Black-Scholes engine" },
  { icon: "🎯", title: "Optimal strategies", desc: "Top candidates compared with plain trade-off facts and broker-ready tickets" },
];

const SHORTCUTS = [
  { keys: "Ctrl+K", action: "Jump to the Screener" },
  { keys: "Ctrl+Shift+?", action: "Help & glossary" },
];

function relativeTime(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function mostUsedStrategy(trades: { strategy: string }[]): string | null {
  if (trades.length === 0) return null;
  const counts = new Map<string, number>();
  for (const t of trades) {
    counts.set(t.strategy, (counts.get(t.strategy) ?? 0) + 1);
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return strategyLabel(top[0]);
}

export default function Home() {
  const s = useStore();
  const lastScreen = readLastScreen();

  useEffect(() => {
    s.loadJournal(); // for the quick stats
    if (!s.paper) s.loadPaper(); // sandbox balance for the stats row
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const mostUsed = mostUsedStrategy(s.savedTrades);
  const balance = s.paper?.balance ?? null;
  const winRate = s.paper?.stats.winRate ?? null;

  return (
    <section className="mx-auto max-w-4xl space-y-8 py-8" data-testid="home">
      <Card className="p-8 text-center" enterDelayMs={0}>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Option Obelisk
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-content-2">
          Screen, analyze, decide. Professional options analysis where every
          number comes from a deterministic engine.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => s.setView("detector")} data-testid="home-screen-cta">
            Start screening
          </Button>
          <Button variant="secondary" size="lg" onClick={() => s.setView("paper")}>
            Open Sandbox
          </Button>
          <Button variant="secondary" size="lg" onClick={() => s.setView("journal")}>
            View Position Log
          </Button>
        </div>
      </Card>

      {balance && (
        <div className="grid grid-cols-3 gap-3" data-testid="home-stats">
          <Card enterDelayMs={50} className="text-center">
            <div className="font-mono text-2xl font-bold text-accent-primary-text">
              {money(balance.accountValue, 2)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-content-3">Sandbox balance</div>
          </Card>
          <Card enterDelayMs={100} className="text-center">
            <div className={`font-mono text-2xl font-bold ${
              balance.realizedPnl > 0 ? "text-accent-green"
                : balance.realizedPnl < 0 ? "text-accent-red" : "text-accent-primary-text"
            }`}>
              {money(balance.realizedPnl, 2)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-content-3">Realized P&L</div>
          </Card>
          <Card enterDelayMs={150} className="text-center">
            <div className="font-mono text-2xl font-bold text-accent-primary-text">
              {winRate === null ? "—" : pct(winRate)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-content-3">Win rate</div>
          </Card>
        </div>
      )}

      {!balance && s.savedTrades.length > 0 && (
        <div className="grid grid-cols-3 gap-3" data-testid="home-stats">
          <Card enterDelayMs={50} className="text-center">
            <div className="font-mono text-2xl font-bold text-accent-primary-text">{s.savedTrades.length}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-content-3">Positions logged</div>
          </Card>
          <Card enterDelayMs={100} className="text-center">
            <div className="text-2xl font-semibold capitalize">{mostUsed}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-content-3">Most used</div>
          </Card>
          <Card enterDelayMs={150} className="text-center">
            <div className="font-mono text-2xl font-semibold">
              {lastScreen ? lastScreen.symbol : "—"}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-content-3">
              {lastScreen ? `Last screened ${relativeTime(lastScreen.at)}` : "Nothing screened yet"}
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Card key={f.title} enterDelayMs={200 + i * 50}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">{f.icon}</span>
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-0.5 text-sm text-content-3">{f.desc}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="ghost" onClick={() => s.setView("etf")} data-testid="home-etf">
          Asset Screener
        </Button>
        <Button variant="ghost" onClick={() => s.setSettingsOpen(true)}>
          Settings
        </Button>
        <Button variant="ghost" onClick={() => s.openHelp()} data-testid="home-learn">
          Learn the concepts
        </Button>
      </div>

      <div className="text-center text-sm text-content-3">
        {SHORTCUTS.map((sc, i) => (
          <span key={sc.keys}>
            {i > 0 && <span className="mx-2 text-content-3/50">·</span>}
            <code className="rounded bg-dark-800 px-1.5 py-0.5 font-mono text-content-2">
              {sc.keys}
            </code>{" "}
            {sc.action}
          </span>
        ))}
      </div>
    </section>
  );
}
