import { useState, type ReactNode } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ViewTransition from "./ViewTransition";
import { THEMES, useTheme } from "../../contexts/ThemeContext";
import { useStore } from "../../store";
import { cx } from "../../lib/cx";

// v1.7.1 onboarding: a 4-step tutorial (Welcome → Screener → Analyzer →
// Position Log & Settings) plus a post-tutorial "ready" screen. Shows only
// for freshly created accounts; completion is stored per account as
// `onboardingComplete-<username>` so every local account onboards
// independently. Skip marks complete. Replayable from Help & Glossary.

export const onboardingKey = (username: string) => `onboardingComplete-${username}`;

export function hasCompletedOnboarding(username: string): boolean {
  try {
    return localStorage.getItem(onboardingKey(username)) !== null;
  } catch {
    return true; // private mode: never nag
  }
}

const TOTAL_STEPS = 4;

function Feature({ children }: { children: ReactNode }) {
  return (
    <li className="relative py-1 pl-5 text-sm text-content-2">
      <span aria-hidden className="absolute left-0 text-accent-primary-text">•</span>
      {children}
    </li>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex gap-3 rounded-md border-l-2 border-accent-primary bg-accent-primary/10 p-3">
      <span aria-hidden className="shrink-0 text-base">💡</span>
      <p className="text-sm text-content-2">{children}</p>
    </div>
  );
}

// step 4's inline quick-settings: the same theme + currency preferences as
// the Settings panel, so choices made here persist exactly the same way
function QuickSettings() {
  const { theme, setTheme } = useTheme();
  const currencyMode = useStore((s) => s.currencyMode);
  const setCurrency = useStore((s) => s.setCurrency);

  return (
    <div className="mt-4 space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-content-3">Theme</div>
        <div className="mt-1.5 flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              data-testid={`onboarding-theme-${t.id}`}
              aria-pressed={theme === t.id}
              className={cx(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-all duration-150 ease-out-quad",
                theme === t.id
                  ? "border-accent-primary bg-accent-primary/15 text-content-1"
                  : "border-white/10 text-content-3 hover:border-accent-primary/50 hover:text-content-1",
              )}
            >
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border border-white/20"
                style={{ background: t.swatch.accents[0] }}
              />
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-content-3">Currency display</div>
        <div className="mt-1.5 flex gap-2">
          {([
            ["usd", "USD"],
            ["cad", "CAD"],
            ["dual", "USD | CAD"],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setCurrency({ mode })}
              aria-pressed={currencyMode === mode}
              className={cx(
                "rounded-md border px-2.5 py-1.5 text-xs transition-all duration-150 ease-out-quad",
                currencyMode === mode
                  ? "border-accent-primary bg-accent-primary/15 text-content-1"
                  : "border-white/10 text-content-3 hover:border-accent-primary/50 hover:text-content-1",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Onboarding({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  const account = useStore((s) => s.account);
  const setView = useStore((s) => s.setView);
  const openHelp = useStore((s) => s.openHelp);
  // 0..3 = tutorial steps, 4 = post-tutorial "ready" screen
  const [step, setStep] = useState(0);

  function markComplete() {
    if (!account) return;
    try {
      localStorage.setItem(onboardingKey(account.username), "true");
    } catch {
      // private mode: it just reappears next session
    }
  }

  function finish(goToScreener = false) {
    markComplete();
    onClose();
    setStep(0); // replay starts from the top
    if (goToScreener) setView("detector");
  }

  const onLast = step === TOTAL_STEPS - 1;

  return (
    <Modal open={open} onClose={() => finish(false)} testid="onboarding" maxWidth="max-w-lg">
      <ViewTransition viewKey={String(step)}>
        {step < TOTAL_STEPS ? (
          <div role="group" aria-label={`Onboarding step ${step + 1} of ${TOTAL_STEPS}`}>
            {/* progress: 4 steps, fills 25% per step */}
            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={TOTAL_STEPS}
              aria-valuenow={step + 1}
              aria-label="Onboarding progress"
              className="mb-5 h-1 overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="h-full rounded-full bg-accent-primary transition-[width] duration-300 ease-out-quad"
                style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
              />
            </div>

            {step === 0 && (
              <>
                <h2 className="text-xl font-semibold text-accent-primary-text">
                  Welcome to Option Obelisk
                </h2>
                <p aria-live="polite" className="mt-1 text-xs uppercase tracking-wide text-content-3">
                  Step 1 of {TOTAL_STEPS}
                </p>
                <p className="mt-4 text-sm text-content-1">
                  Track options strategies with precision analytics.
                </p>
                <p className="mt-2 text-sm text-content-2">
                  Built for traders who want real data, not guesses — every
                  number comes from a deterministic math engine, nothing is
                  estimated by an AI.
                </p>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="text-xl font-semibold text-accent-primary-text">
                  Real-time Screener
                </h2>
                <p aria-live="polite" className="mt-1 text-xs uppercase tracking-wide text-content-3">
                  Step 2 of {TOTAL_STEPS}
                </p>
                <p className="mt-4 text-sm text-content-1">
                  Find option strategies worth a look, by stock or ETF.
                </p>
                <ul className="mt-3 list-none">
                  <Feature>
                    Type a ticker in the Screener — every expiration and
                    eligible strategy is priced and ranked.
                  </Feature>
                  <Feature>
                    The Asset Screener discovers ETF option-selling candidates
                    with filters for IV rank, yield, volatility and volume.
                  </Feature>
                  <Feature>
                    Sort by any metric, and see liquidity before you trade.
                  </Feature>
                </ul>
                <Tip>
                  Start with the Asset Screener&apos;s “Liquid” volume band — it
                  pre-filters for chains you can actually trade.
                </Tip>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-xl font-semibold text-accent-primary-text">
                  Trade Analyzer
                </h2>
                <p aria-live="polite" className="mt-1 text-xs uppercase tracking-wide text-content-3">
                  Step 3 of {TOTAL_STEPS}
                </p>
                <p className="mt-4 text-sm text-content-1">
                  Visualize a strategy&apos;s payoff before you risk a dime.
                </p>
                <ul className="mt-3 list-none">
                  <Feature>
                    Build spreads, iron condors, straddles — any multi-leg
                    combination.
                  </Feature>
                  <Feature>
                    See max profit, max loss and breakevens instantly on the
                    payoff chart.
                  </Feature>
                  <Feature>
                    Edit strikes to explore — greeks and probabilities are
                    repriced as you go.
                  </Feature>
                </ul>
                <Tip>
                  Use the Sandbox to practice with a paper budget before
                  risking real money.
                </Tip>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-xl font-semibold text-accent-primary-text">
                  Position Log &amp; Settings
                </h2>
                <p aria-live="polite" className="mt-1 text-xs uppercase tracking-wide text-content-3">
                  Step 4 of {TOTAL_STEPS}
                </p>
                <p className="mt-4 text-sm text-content-1">
                  Track every trade with live P&amp;L.
                </p>
                <ul className="mt-3 list-none">
                  <Feature>Entry and exit prices, commissions included.</Feature>
                  <Feature>Win rate and profit factor across your history.</Feature>
                  <Feature>P&amp;L by date, symbol and strategy.</Feature>
                </ul>
                <QuickSettings />
                <p className="mt-3 text-xs text-content-3">
                  Change these anytime in ⚙ Settings — along with motion,
                  effects and scoring weights.
                </p>
              </>
            )}

            <div className="mt-6 flex items-center gap-3">
              {step > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => setStep(step - 1)}
                  data-testid="onboarding-back"
                >
                  ← Back
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={() => (onLast ? (markComplete(), setStep(4)) : setStep(step + 1))}
                data-testid="onboarding-next"
              >
                {onLast ? "Done 🎯" : "Next →"}
              </Button>
              <button
                onClick={() => finish(false)}
                data-testid="onboarding-skip"
                className="px-1 py-2 text-sm text-content-3 underline decoration-content-3/40 underline-offset-2 transition-colors duration-150 hover:text-accent-primary-text"
              >
                Skip
              </button>
            </div>
          </div>
        ) : (
          <div role="group" aria-label="Onboarding complete">
            <h2 className="text-xl font-semibold text-accent-primary-text">
              You&apos;re ready! 🎯
            </h2>
            <p className="mt-1 text-sm text-content-3">Your account is set up.</p>
            <div className="mt-4 space-y-3">
              {[
                ["1", "Go to the Screener", "Screen a symbol for ranked strategies."],
                ["2", "Open the Analyzer", "Build and stress-test your first strategy."],
                ["3", "Track it in the Position Log", "See live P&L and stats as it plays out."],
              ].map(([n, title, text], i) => (
                <div
                  key={n}
                  className="animate-card-enter flex gap-3 rounded-lg bg-dark-700/60 p-3"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-xs font-semibold text-accent-primary-text">
                    {n}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-content-1">{title}</div>
                    <p className="text-sm text-content-3">{text}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-content-3">
              Questions?{" "}
              <button
                onClick={() => { finish(false); openHelp(); }}
                className="text-accent-primary-text underline decoration-accent-primary/40 underline-offset-2 hover:brightness-110"
                data-testid="onboarding-glossary-link"
              >
                Open Help &amp; Glossary
              </button>{" "}
              (Ctrl+Shift+?)
            </p>
            <div className="mt-5 flex gap-3">
              <Button size="lg" className="flex-1" onClick={() => finish(true)} data-testid="onboarding-start">
                Start Screener
              </Button>
              <Button variant="ghost" size="lg" onClick={() => finish(false)} data-testid="onboarding-close">
                Close
              </Button>
            </div>
          </div>
        )}
      </ViewTransition>
    </Modal>
  );
}
