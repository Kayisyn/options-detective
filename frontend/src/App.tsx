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
import SettingsPanel from "./components/shared/SettingsPanel";
import ViewTransition from "./components/shared/ViewTransition";
import { useMode } from "./contexts/ModeContext";
import { useStore, type View } from "./store";

const TABS: Array<{ id: View; label: string; hint: string }> = [
  { id: "home", label: "Home", hint: "Start page" },
  { id: "detector", label: "1 · Detector", hint: "Screen opportunities" },
  { id: "calculator", label: "2 · Calculator", hint: "Analyze the math" },
  { id: "recommender", label: "3 · Recommender", hint: "Compare and export" },
  { id: "journal", label: "Journal", hint: "Your saved trades" },
  { id: "paper", label: "Paper", hint: "Risk-free simulator with a paper budget" },
  { id: "etf", label: "ETFs", hint: "Discover ETF option-selling candidates" },
];

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
  const { expertMode, toggleMode } = useMode();
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDED_KEY) === null;
    } catch {
      return false;
    }
  });

  // Keyboard shortcuts (§5.5): Ctrl+K jumps to screening, Ctrl+Shift+?
  // reopens the walkthrough. Ctrl+Shift+D lives in ThemeProvider.
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

  const enabled: Record<View, boolean> = {
    home: true,
    detector: true,
    calculator: selected !== null,
    recommender: (screenResult?.candidates.length ?? 0) > 0,
    journal: true,
    paper: true,
    etf: true,
    ics: true, // reached from the ETF screener, not the nav
  };

  // ICS is a drill-down of the ETF screener — keep its tab lit
  const activeTab = view === "ics" ? "etf" : view;

  return (
    <div className="min-h-screen">
      <Onboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HelpDrawer onReplayWalkthrough={() => setOnboardingOpen(true)} />
      {toast && (
        <div
          className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 animate-toast-in rounded-md border border-accent-green/40 bg-dark-800 px-4 py-2 text-sm text-accent-green shadow-lg"
          data-testid="toast"
        >
          {toast}
        </div>
      )}
      <header className="border-b border-dark-700 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button
            onClick={() => setView("home")}
            className="text-xl font-semibold tracking-tight transition-colors duration-150 hover:text-accent-blue"
            title="Home"
            data-testid="logo"
          >
            Options Detective
          </button>
          <nav className="flex items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => enabled[tab.id] && setView(tab.id)}
                title={tab.hint}
                disabled={!enabled[tab.id]}
                className={`rounded-md px-4 py-2 text-sm transition-all duration-150 ease-out ${
                  activeTab === tab.id
                    ? "bg-accent-blue text-white shadow-md"
                    : enabled[tab.id]
                      ? "bg-dark-800 text-content-3 hover:bg-dark-700 hover:text-content-1"
                      : "cursor-not-allowed bg-dark-800 text-content-3/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <span className="mx-1 h-6 w-px bg-dark-600" />
            <button
              onClick={toggleMode}
              title="Switch complexity level — beginner hides greeks behind plain-language summaries"
              data-testid="mode-toggle"
              className="rounded-md bg-dark-800 px-3 py-2 text-sm text-content-2 transition-all duration-150 ease-out hover:bg-dark-700"
            >
              {expertMode ? "Expert" : "Beginner"}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              title="Settings — themes and complexity"
              data-testid="settings-button"
              aria-label="Settings"
              className="rounded-md bg-dark-800 px-3 py-2 text-sm text-content-2 transition-all duration-150 ease-out hover:bg-dark-700"
            >
              ⚙
            </button>
            <button
              onClick={() => openHelp()}
              title="Help & glossary (Ctrl+Shift+?)"
              data-testid="help-button"
              aria-label="Help"
              className="rounded-md bg-dark-800 px-3 py-2 text-sm text-content-2 transition-all duration-150 ease-out hover:bg-dark-700"
            >
              ?
            </button>
          </nav>
        </div>
      </header>
      {error && (
        <div className="mx-auto mt-4 max-w-6xl rounded-md border border-red-800 bg-red-950/60 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      <main className="mx-auto max-w-6xl overflow-x-hidden p-6">
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
      </main>
    </div>
  );
}
