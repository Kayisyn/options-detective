import { useEffect } from "react";
import { readLastScreen, useStore } from "../store";
import { strategyLabel } from "../lib/format";
import Button from "./ui/Button";
import { Card } from "./ui/Card";

// Home screen (updated brief §5.5): entry point, identity, escape hatch.
// Reached on launch, via the logo, or the Home tab.

const FEATURES = [
  { icon: "⚡", title: "Black-Scholes engine", desc: "Exact greeks, breakevens and probabilities — 1,300+ unit tests" },
  { icon: "📊", title: "Live screening", desc: "Every expiration × every eligible strategy, ranked in one pass" },
  { icon: "🎯", title: "Multi-strategy", desc: "Verticals, condors, straddles, strangles, covered calls, CSPs" },
  { icon: "📝", title: "Trade journal", desc: "Snapshot trades with broker-ready order tickets" },
];

const SHORTCUTS = [
  { keys: "Ctrl+K", action: "Jump to screening" },
  { keys: "Ctrl+Shift+D", action: "Toggle dark / light" },
  { keys: "Ctrl+Shift+?", action: "Reopen the walkthrough" },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const mostUsed = mostUsedStrategy(s.savedTrades);

  return (
    <section className="mx-auto max-w-3xl space-y-10 py-8" data-testid="home">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Options Detective
        </h1>
        <p className="mt-3 text-lg text-content-3">
          Screen, calculate, recommend. Professional options analysis for
          semi-technical traders — every number from a deterministic engine.
        </p>
      </div>

      {s.savedTrades.length > 0 && (
        <div className="grid grid-cols-3 gap-3" data-testid="home-stats">
          <Card enterDelayMs={0} className="text-center">
            <div className="font-mono text-2xl font-bold">{s.savedTrades.length}</div>
            <div className="text-xs uppercase tracking-wide text-content-3">Trades logged</div>
          </Card>
          <Card enterDelayMs={50} className="text-center">
            <div className="text-2xl font-semibold capitalize">{mostUsed}</div>
            <div className="text-xs uppercase tracking-wide text-content-3">Most used</div>
          </Card>
          <Card enterDelayMs={100} className="text-center">
            <div className="font-mono text-2xl font-semibold">
              {lastScreen ? lastScreen.symbol : "—"}
            </div>
            <div className="text-xs uppercase tracking-wide text-content-3">
              {lastScreen ? `Last screened ${relativeTime(lastScreen.at)}` : "Nothing screened yet"}
            </div>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={() => s.setView("detector")} data-testid="home-screen-cta">
          Screen a symbol
        </Button>
        <Button variant="secondary" size="lg" onClick={() => s.setView("journal")}>
          View journal
        </Button>
        <Button variant="ghost" size="lg" onClick={() => s.setSettingsOpen(true)}>
          Settings
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f, i) => (
          <Card key={f.title} enterDelayMs={150 + i * 50}>
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

      <div className="text-center text-sm text-content-3">
        {SHORTCUTS.map((sc, i) => (
          <span key={sc.keys}>
            {i > 0 && <span className="mx-2 text-content-3/50">•</span>}
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
