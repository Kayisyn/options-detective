import { useEffect, useState } from "react";
import Calculator from "./components/Calculator";
import Detector from "./components/Detector";
import EtfScreener from "./components/EtfScreener";
import Home from "./components/Home";
import IndexComponentScreener from "./components/IndexComponentScreener";
import Journal from "./components/Journal";
import PaperTrading from "./components/PaperTrading";
import Recommender from "./components/Recommender";
import HelpDrawer from "./components/shared/HelpDrawer";
import Onboarding, { ONBOARDED_KEY } from "./components/shared/Onboarding";
import ParticleField from "./components/shared/ParticleField";
import SettingsPanel from "./components/shared/SettingsPanel";
import { RightSidebar } from "./components/shared/Sidebars";
import ViewTransition from "./components/shared/ViewTransition";
import { useMode } from "./contexts/ModeContext";
import { useStore, type View } from "./store";

// v1.4.0 naming: view ids stay stable (routes, tests, stored state); only
// the labels change. Detector -> Screener, Calculator -> Trade Analyzer,
// Recommender -> Optimal Strategies, Journal -> Position Log,
// Paper -> Sandbox, ETFs -> Asset Screener.
const TABS: Array<{ id: View; label: string; hint: string }> = [
  { id: "home", label: "Home", hint: "Start page" },
  { id: "detector", label: "Screener", hint: "Screen option opportunities" },
  { id: "calculator", label: "Analyzer", hint: "Analyze the trade math" },
  { id: "recommender", label: "Recommendations", hint: "Optimal strategies, compared and exportable" },
  { id: "journal", label: "Position Log", hint: "Your saved positions" },
  { id: "paper", label: "Sandbox", hint: "Risk-free simulator with a practice budget" },
  { id: "etf", label: "Assets", hint: "Asset Screener — discover ETF option-selling candidates" },
];

// Minimal geometric obelisk mark. Gradient stops ride the accent tokens,
// so the mark is violet on obsidian and white on the B&W theme.
function ObeliskMark() {
  return (
    <svg width="18" height="24" viewBox="0 0 18 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="obelisk-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "rgb(var(--od-accent-primary-hover))" }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--od-accent-primary))" }} />
        </linearGradient>
      </defs>
      <path d="M6 24 L7 6 L9 0 L11 6 L12 24 Z" fill="url(#obelisk-grad)" />
    </svg>
  );
}

export default function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selected = useStore((s) => s.selected);
  const screenResult = useStore((s) => s.screenResult);
  const error = useStore((s) => s.error);
  const toast = useStore((s) => s.toast);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const openHelp = useStore((s) => s.openHelp);
  const loadPulse = useStore((s) => s.loadPulse);
  const loadJournal = useStore((s) => s.loadJournal);
  const loadEtfWatchlist = useStore((s) => s.loadEtfWatchlist);
  const { expertMode, toggleMode } = useMode();
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDED_KEY) === null;
    } catch {
      return false;
    }
  });

  // Keyboard shortcuts: Ctrl+K jumps to the Screener, Ctrl+Shift+?
  // reopens the walkthrough.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setView("detector");
        setTimeout(() => {
          document.querySelector<HTMLInputElement>('[data-testid="symbol-input"]')?.focus();
        }, 550); // after the view transition settles
      }
      if (e.ctrlKey && e.shiftKey && e.key === "?") {
        e.preventDefault();
        openHelp();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, openHelp]);

  // v1.5.0 sidebars: journal + watchlist give the left panels their rows,
  // then the market pulse polls every 60s (matching the backend cache TTL)
  // while the window is visible.
  useEffect(() => {
    loadJournal();
    loadEtfWatchlist().then(() => loadPulse());
    const interval = setInterval(() => {
      if (!document.hidden) loadPulse();
    }, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const enabled: Record<View, boolean> = {
    home: true,
    detector: true,
    calculator: selected !== null,
    recommender: (screenResult?.candidates.length ?? 0) > 0,
    journal: true,
    paper: true,
    etf: true,
    ics: true, // reached from the Asset Screener, not the nav
  };

  // ICS is a drill-down of the Asset Screener — keep its tab lit
  const activeTab = view === "ics" ? "etf" : view;

  return (
    <div className="min-h-screen">
      <ParticleField />
      <Onboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HelpDrawer onReplayWalkthrough={() => setOnboardingOpen(true)} />
      {toast && (
        <div
          className="card-glass fixed left-1/2 top-4 z-[60] -translate-x-1/2 animate-toast-in border-accent-green/40 px-4 py-2 text-sm text-accent-green"
          data-testid="toast"
        >
          {toast}
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-glass backdrop-blur-glass">
        <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-y-1 px-6 py-1.5">
          <button
            onClick={() => setView("home")}
            className="flex items-center gap-2 text-lg font-bold tracking-tight transition-colors duration-150 hover:text-accent-primary-text"
            title="Home"
            data-testid="logo"
          >
            <ObeliskMark />
            Option Obelisk
          </button>
          <nav className="flex flex-wrap items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => enabled[tab.id] && setView(tab.id)}
                title={tab.hint}
                disabled={!enabled[tab.id]}
                className={`rounded-md px-3 py-1.5 text-sm transition-all duration-150 ease-out-quad ${
                  activeTab === tab.id
                    ? "bg-accent-primary text-on-accent shadow-accent-glow"
                    : enabled[tab.id]
                      ? "text-content-3 hover:bg-dark-700 hover:text-content-1"
                      : "cursor-not-allowed text-content-3/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <span className="mx-2 h-6 w-px bg-white/10" />
            <button
              onClick={toggleMode}
              title="Switch complexity level — beginner hides greeks behind plain-language summaries"
              data-testid="mode-toggle"
              className="rounded-md px-3 py-1.5 text-sm text-content-3 transition-all duration-150 ease-out-quad hover:bg-dark-700 hover:text-content-1"
            >
              {expertMode ? "Expert" : "Beginner"}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              title="Settings — theme, scoring and complexity"
              data-testid="settings-button"
              aria-label="Settings"
              className="rounded-md px-3 py-1.5 text-sm text-content-3 transition-all duration-150 ease-out-quad hover:bg-dark-700 hover:text-content-1"
            >
              ⚙
            </button>
            <button
              onClick={() => openHelp()}
              title="Help & glossary (Ctrl+Shift+?)"
              data-testid="help-button"
              aria-label="Help"
              className="rounded-md px-3 py-1.5 text-sm text-content-3 transition-all duration-150 ease-out-quad hover:bg-dark-700 hover:text-content-1"
            >
              ?
            </button>
          </nav>
        </div>
      </header>
      {error && (
        <div className="card-glass mx-auto mt-4 max-w-7xl border-accent-red/40 px-4 py-2 text-sm text-accent-red">
          {error}
        </div>
      )}
      <div className="mx-auto flex max-w-[1880px] items-start gap-4 px-6">
        <main className="min-w-0 flex-1 overflow-x-hidden py-6">
          <div className="mx-auto max-w-7xl">
            <ViewTransition viewKey={view}>
              {view === "home" && <Home />}
              {view === "detector" && <Detector />}
              {view === "calculator" && <Calculator />}
              {view === "recommender" && <Recommender />}
              {view === "journal" && <Journal />}
              {view === "paper" && <PaperTrading />}
              {view === "etf" && <EtfScreener />}
              {view === "ics" && <IndexComponentScreener />}
            </ViewTransition>
          </div>
        </main>
        <RightSidebar />
      </div>
    </div>
  );
}
