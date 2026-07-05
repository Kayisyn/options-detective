import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { useStore } from "../../store";

export const ONBOARDED_KEY = "od.onboarded.v1";

// First-launch walkthrough (updated brief §5.6). Controlled by App so the
// "?" help button and Ctrl+Shift+? can reopen it anytime. Steps cascade in
// with the standard stagger.
const STEPS = [
  {
    title: "1 · Pick a symbol",
    text: "Type a ticker (AAPL is pre-filled) and hit Screen. Every expiration and every eligible strategy is priced by the math engine and ranked.",
  },
  {
    title: "2 · Click a candidate",
    text: "The Calculator opens with the payoff chart, dollar greeks, breakevens and probabilities. Edit strikes to explore — adjustments are repriced instantly.",
  },
  {
    title: "3 · Review & export",
    text: "Compare the top five with plain trade-off facts, then export a broker-ready order ticket to your clipboard, or save it to your journal.",
  },
];

export default function Onboarding({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  const setView = useStore((s) => s.setView);

  function dismiss(startScreening: boolean) {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      // private mode: just close for this session
    }
    onClose();
    if (startScreening) setView("detector");
  }

  return (
    <Modal open={open} onClose={() => dismiss(false)} testid="onboarding" maxWidth="max-w-lg">
      <h2 className="text-lg font-semibold">Welcome to Options Detective</h2>
      <p className="mt-1 text-sm text-content-3">
        Three views, one flow. Every number you will see comes from a
        deterministic math engine — nothing is estimated by an AI.
      </p>
      <div className="mt-4 space-y-3">
        {STEPS.map((step, i) => (
          <div
            key={step.title}
            className="animate-card-enter rounded-lg bg-dark-700/60 p-3"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="text-sm font-medium text-accent-blue">{step.title}</div>
            <p className="mt-1 text-sm text-content-2">{step.text}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-content-3">
        Quotes come from free intraday data and can be stale outside market
        hours — staleness is always flagged, never hidden. This is analysis
        software, not investment advice.
      </p>
      <div className="mt-4 flex gap-3">
        <Button size="lg" className="flex-1" onClick={() => dismiss(true)}>
          Get started
        </Button>
        <Button variant="ghost" size="lg" onClick={() => dismiss(false)}>
          Skip
        </Button>
      </div>
    </Modal>
  );
}
