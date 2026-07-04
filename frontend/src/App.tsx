import Calculator from "./components/Calculator";
import Detector from "./components/Detector";
import Journal from "./components/Journal";
import Recommender from "./components/Recommender";
import Onboarding from "./components/shared/Onboarding";
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

  const enabled: Record<View, boolean> = {
    detector: true,
    calculator: selected !== null,
    recommender: (screenResult?.candidates.length ?? 0) > 0,
    journal: true,
  };

  return (
    <div className="min-h-screen">
      <Onboarding />
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            Options Detective
          </h1>
          <nav className="flex gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => enabled[tab.id] && setView(tab.id)}
                title={tab.hint}
                disabled={!enabled[tab.id]}
                className={`rounded-md px-4 py-2 text-sm transition-colors ${
                  view === tab.id
                    ? "bg-sky-600 text-white"
                    : enabled[tab.id]
                      ? "bg-slate-900 text-slate-400 hover:bg-slate-800"
                      : "cursor-not-allowed bg-slate-900 text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      {error && (
        <div className="mx-auto mt-4 max-w-6xl rounded-md border border-rose-800 bg-rose-950/60 px-4 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}
      <main className="mx-auto max-w-6xl p-6">
        {view === "detector" && <Detector />}
        {view === "calculator" && <Calculator />}
        {view === "recommender" && <Recommender />}
        {view === "journal" && <Journal />}
      </main>
    </div>
  );
}
