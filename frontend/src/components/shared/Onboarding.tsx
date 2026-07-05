import { useState } from "react";
import Button from "../ui/Button";

const STORAGE_KEY = "od.onboarded.v1";

const STEPS = [
  {
    title: "1 · Detect",
    text: "Enter a symbol. Every expiration and every eligible strategy is screened, priced by the math engine, and ranked by a composite score (win probability, risk/reward, time decay, capital efficiency, liquidity).",
  },
  {
    title: "2 · Calculate",
    text: "Click any candidate to see its payoff diagram, dollar greeks, breakevens and probabilities. Edit strikes to explore — adjusted legs are repriced at Black-Scholes theoretical value and clearly labelled.",
  },
  {
    title: "3 · Recommend",
    text: "Compare the top five side by side with plain trade-off facts, then export a broker-ready order ticket to your clipboard. Max loss is always shown next to max profit — size positions off the loss, not the dream.",
  },
];

export default function Onboarding() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === null;
    } catch {
      return false;
    }
  });
  if (!open) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // private mode: just close for this session
    }
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6" data-testid="onboarding">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">Welcome to Options Detective</h2>
        <p className="mt-1 text-sm text-slate-400">
          Three views, one flow. Every number you will see comes from a
          deterministic math engine — nothing is estimated by an AI.
        </p>
        <div className="mt-4 space-y-3">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-lg bg-dark-700/60 p-3">
              <div className="text-sm font-medium text-accent-blue">{step.title}</div>
              <p className="mt-1 text-sm text-content-2">{step.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Quotes come from free intraday data and can be stale outside market
          hours — staleness is always flagged, never hidden. This is analysis
          software, not investment advice.
        </p>
        <Button size="lg" className="mt-4 w-full" onClick={dismiss}>
          Got it — let&apos;s screen
        </Button>
      </div>
    </div>
  );
}
