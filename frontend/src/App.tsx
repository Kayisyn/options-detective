import { useState } from "react";
import Calculator from "./components/Calculator";
import Detector from "./components/Detector";
import Recommender from "./components/Recommender";

export type View = "detector" | "calculator" | "recommender";

const TABS: Array<{ id: View; label: string; hint: string }> = [
  { id: "detector", label: "1 · Detector", hint: "Screen opportunities" },
  { id: "calculator", label: "2 · Calculator", hint: "Analyze the math" },
  { id: "recommender", label: "3 · Recommender", hint: "Compare and export" },
];

export default function App() {
  const [view, setView] = useState<View>("detector");

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            Options Detective
          </h1>
          <nav className="flex gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                title={tab.hint}
                className={`rounded-md px-4 py-2 text-sm transition-colors ${
                  view === tab.id
                    ? "bg-sky-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">
        {view === "detector" && (
          <Detector onSelectCandidate={() => setView("calculator")} />
        )}
        {view === "calculator" && (
          <Calculator onRecommend={() => setView("recommender")} />
        )}
        {view === "recommender" && (
          <Recommender onOpenCandidate={() => setView("calculator")} />
        )}
      </main>
    </div>
  );
}
