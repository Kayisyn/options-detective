import { useState } from "react";
import Calculator from "./components/Calculator";
import Detector from "./components/Detector";
import Journal from "./components/Journal";
import Recommender from "./components/Recommender";
import Onboarding from "./components/shared/Onboarding";
import SettingsPanel from "./components/shared/SettingsPanel";
import ViewTransition from "./components/shared/ViewTransition";
import { useMode } from "./contexts/ModeContext";
import { useStore, type View } from "./store";

const TABS: Array<{ id: View; label: string; hint: string }> = [
  { id: "detector", label: "1 · Detector", hint: "Screen opportunities" },
  { id: "calculator", label: "2 · Calculator", hint: "Analyze the math" },
  { id: "recommender", label: "3 · Recommender", hint: "Compare and export" },
  { id: "journal", label: "Journal", hint: "Your saved trades" },
];

export default function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selected = useStore((s) => s.selected);
  const screenResult = useStore((s) => s.screenResult);
  const error = useStore((s) => s.error);
  const { expertMode, toggleMode } = useMode();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const enabled: Record<View, boolean> = {
    detector: true,
    calculator: selected !== null,
    recommender: (screenResult?.candidates.length ?? 0) > 0,
    journal: true,
  };

  return (
    <div className="min-h-screen">
      <Onboarding />
      <header className="border-b border-dark-700 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            Options Detective
          </h1>
          <nav className="flex items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => enabled[tab.id] && setView(tab.id)}
                title={tab.hint}
                disabled={!enabled[tab.id]}
                className={`rounded-md px-4 py-2 text-sm transition-all duration-150 ease-out ${
                  view === tab.id
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
          </nav>
        </div>
      </header>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {error && (
        <div className="mx-auto mt-4 max-w-6xl rounded-md border border-red-800 bg-red-950/60 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      <main className="mx-auto max-w-6xl overflow-x-hidden p-6">
        <ViewTransition viewKey={view}>
          {view === "detector" && <Detector />}
          {view === "calculator" && <Calculator />}
          {view === "recommender" && <Recommender />}
          {view === "journal" && <Journal />}
        </ViewTransition>
      </main>
    </div>
  );
}
