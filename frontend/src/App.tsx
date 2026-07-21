import { lazy, Suspense, useEffect, useState } from "react";
import Detector from "./components/Detector";
import EtfScreener from "./components/EtfScreener";
import Home from "./components/Home";
import IndexComponentScreener from "./components/IndexComponentScreener";
import Journal from "./components/Journal";
import Recommender from "./components/Recommender";

// v1.10.1: the three recharts consumers — Analyzer (payoff chart), Sandbox
// and Analytics (equity/drawdown/scatter) — are code-split so the ~84 KB
// gzipped charting library loads on demand, not on the initial Home paint.
const Analytics = lazy(() => import("./components/Analytics"));
const Calculator = lazy(() => import("./components/Calculator"));
const PaperTrading = lazy(() => import("./components/PaperTrading"));
import FeedbackModal from "./components/shared/FeedbackModal";
import HelpDrawer from "./components/shared/HelpDrawer";
import Onboarding, { hasCompletedOnboarding } from "./components/shared/Onboarding";
import ObeliskInsignia from "./components/shared/ObeliskInsignia";
import ParticleField from "./components/shared/ParticleField";
import SettingsPanel, { type TabId as SettingsTabId } from "./components/shared/SettingsPanel";
import SplashScreen from "./components/shared/SplashScreen";
import { RightSidebar } from "./components/shared/Sidebars";
import AuthGate from "./components/AuthGate";
import ViewTransition from "./components/shared/ViewTransition";
import { useMode } from "./contexts/ModeContext";
import { useAlerts } from "./lib/useAlerts";
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
  { id: "analytics", label: "Analytics", hint: "Realized performance — equity curve, win rate, per-strategy stats" },
  { id: "paper", label: "Sandbox", hint: "Risk-free simulator with a practice budget" },
  { id: "etf", label: "Assets", hint: "Asset Screener — discover ETF option-selling candidates" },
];

// Suspense fallback for a lazy view chunk — mirrors the boot splash's
// pulsing accent bar so the load reads as intentional, not a flash.
function ViewLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" data-testid="view-loading">
      <div className="h-8 w-2 animate-pulse rounded-full bg-gradient-to-b from-accent-primary-hover to-accent-primary" />
    </div>
  );
}

function MainApp() {
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
  const account = useStore((s) => s.account);
  const logout = useStore((s) => s.logout);
  const { expertMode, toggleMode } = useMode();
  useAlerts(); // v1.9.0 notification sweeps (P&L / expiry / strategy score)
  // v1.7.1: the tutorial opens only in the session where the account was
  // created (never for returning sign-ins), and only until that account
  // completes or skips it once. Replayable from Help & Glossary.
  const freshAccount = useStore((s) => s.freshAccount);
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => freshAccount && account !== null && !hasCompletedOnboarding(account.username),
  );
  // v1.9.1: ⋮ menu + Feedback & Bugs modal; settings can deep-link to a tab
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId | null>(null);

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
    // v1.7.0: hydrate the USD→CAD rate (backend caches it daily; this only
    // forces a refetch when auto-update is on and the cache has gone stale)
    useStore.getState().loadFx();
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
    analytics: true,
    paper: true,
    etf: true,
    ics: true, // reached from the Asset Screener, not the nav
  };

  // ICS is a drill-down of the Asset Screener — keep its tab lit
  const activeTab = view === "ics" ? "etf" : view;

  return (
    <div className="min-h-screen">
      {/* v1.10.1 a11y: first focusable — jump past the nav to the view */}
      <a
        href="#main-content"
        data-testid="skip-link"
        className="sr-only rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-on-accent focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70]"
      >
        Skip to main content
      </a>
      <Onboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
      <SettingsPanel open={settingsOpen} openTab={settingsTab}
        onClose={() => { setSettingsOpen(false); setSettingsTab(null); }} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <HelpDrawer onReplayWalkthrough={() => setOnboardingOpen(true)} />
      {/* v1.10.1 a11y: persistent polite live region so toast confirmations
          (saved, exported, alerts…) are announced to screen readers */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="toast-live">
        {toast ?? ""}
      </div>
      {toast && (
        <div
          aria-hidden="true"
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
            <ObeliskInsignia size={24} />
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
            {/* v1.9.1 ⋮ menu: Settings / Account / Help / Feedback & Bugs */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                title="More"
                data-testid="more-menu-button"
                aria-label="More options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="rounded-md px-3 py-1.5 text-sm text-content-3 transition-all duration-150 ease-out-quad hover:bg-dark-700 hover:text-content-1"
              >
                ⋮
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" aria-hidden
                    onClick={() => setMenuOpen(false)} />
                  <div role="menu" data-testid="more-menu"
                    className="card-glass absolute right-0 top-full z-50 mt-1 w-52 animate-card-enter p-1.5">
                    {([
                      ["≡ Settings", () => { setSettingsTab(null); setSettingsOpen(true); }],
                      ["⚙ Account", () => { setSettingsTab("account"); setSettingsOpen(true); }],
                      ["❓ Help & Glossary", () => openHelp()],
                      ["📋 Feedback & Bugs", () => setFeedbackOpen(true)],
                    ] as const).map(([label, action]) => (
                      <button key={label} role="menuitem"
                        data-testid={`menu-${label.slice(2).toLowerCase().replace(/[^a-z]+/g, "-")}`}
                        onClick={() => { setMenuOpen(false); action(); }}
                        className="block w-full rounded px-3 py-2 text-left text-sm text-content-2 transition-colors duration-150 hover:bg-dark-700 hover:text-content-1"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <span className="mx-1 h-6 w-px bg-white/10" />
            <button
              onClick={() => logout()}
              title={account ? `Signed in as ${account.username} — sign out` : "Sign out"}
              data-testid="logout-button"
              className="rounded-md px-3 py-1.5 text-sm text-content-3 transition-all duration-150 ease-out-quad hover:bg-dark-700 hover:text-accent-red"
            >
              <span className="font-medium text-content-2">{account?.username}</span>
              <span className="text-content-3"> · Sign out</span>
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
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-x-hidden py-6">
          <div className="mx-auto max-w-7xl">
            <ViewTransition viewKey={view}>
              {/* Suspense catches the lazy chart chunk on first visit to
                  Analyzer / Sandbox / Analytics; other views render eagerly */}
              <Suspense fallback={<ViewLoading />}>
                {view === "home" && <Home />}
                {view === "detector" && <Detector />}
                {view === "calculator" && <Calculator />}
                {view === "recommender" && <Recommender />}
                {view === "journal" && <Journal />}
                {view === "analytics" && <Analytics />}
                {view === "paper" && <PaperTrading />}
                {view === "etf" && <EtfScreener />}
                {view === "ics" && <IndexComponentScreener />}
              </Suspense>
            </ViewTransition>
          </div>
        </main>
        <RightSidebar />
      </div>

      {/* v1.5.1 help affordance, bottom-left of Home. Rendered at the app
          root (not inside the view) so `fixed` anchors to the viewport — a
          transformed ViewTransition ancestor would otherwise capture it.
          Opens the same searchable Help & Glossary as Ctrl+Shift+?. */}
      {view === "home" && (
        <button
          onClick={() => openHelp()}
          title="Help & Glossary (Ctrl+Shift+?)"
          aria-label="Help and glossary"
          data-testid="home-help-button"
          className="card-glass fixed bottom-6 left-6 z-40 flex h-11 w-11 items-center justify-center rounded-full text-lg text-content-2 transition-all duration-200 ease-out-quad hover:scale-105 hover:text-accent-primary-text hover:shadow-accent-glow"
        >
          ?
        </button>
      )}
    </div>
  );
}

// v1.6.0 auth boundary: boot once, then show a splash → the sign-in gate →
// the app. The particle background rides behind all three states. MainApp
// only mounts when an account is active, so its data-loading effects (which
// hit the per-account, account-guarded routes) never fire unauthenticated.
export default function App() {
  const authReady = useStore((s) => s.authReady);
  const account = useStore((s) => s.account);
  const bootAuth = useStore((s) => s.bootAuth);

  // v1.10.2: the launch splash shows until the boot check finishes AND a short
  // minimum has elapsed, so the branded splash reads as intentional even when
  // the backend answers instantly (in the packaged app the backend spawn makes
  // authReady the longer wait). Then it crossfades out.
  const [minElapsed, setMinElapsed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const bootDone = authReady && minElapsed;

  useEffect(() => {
    bootAuth();
    const t = setTimeout(() => setMinElapsed(true), 1400);
    return () => clearTimeout(t);
  }, [bootAuth]);

  return (
    <>
      <ParticleField />
      {/* the app mounts behind the splash so the fade-out reveals it */}
      {bootDone && (account ? <MainApp /> : <AuthGate />)}
      {!splashGone && (
        <SplashScreen leaving={bootDone} onExited={() => setSplashGone(true)} />
      )}
    </>
  );
}
