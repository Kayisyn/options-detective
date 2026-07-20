import { signed } from "../../lib/format";
import { useMode } from "../../contexts/ModeContext";
import { useStore } from "../../store";
import CountUp from "../ui/CountUp";
import Hint from "../ui/Hint";
import type { Greeks } from "../../types";

// Position greeks in dollar terms. Explainer depth follows the complexity
// mode (updated brief §4.3): beginners get the plain-English version,
// experts the risk-language version.
const UNITS: Record<keyof Greeks, string> = {
  delta: "$/1$ move",
  gamma: "Δ/1$ move",
  theta: "$/day",
  vega: "$/IV pt",
  rho: "$/rate pt",
};

const BEGINNER: Record<keyof Greeks, string> = {
  delta: "How much you make or lose if the stock rises $1. Delta +65 means you gain $65 per $1 up-move.",
  gamma: "How quickly that sensitivity itself changes as the stock moves.",
  theta: "How much this trade makes (+) or loses (−) each day just from time passing.",
  vega: "How much you make or lose if the market gets more nervous (volatility rises 1 point).",
  rho: "How much interest-rate changes matter here (usually the least important).",
};

const EXPERT: Record<keyof Greeks, string> = {
  delta: "Directional exposure in $ per $1 underlying move; hedge ratio for the position",
  gamma: "Delta convexity per $1 move — short gamma loses on whipsaw, long gamma gains",
  theta: "Carry per calendar day; positive = collecting decay, negative = paying for optionality",
  vega: "IV exposure per point — long vega benefits from expansion, watch IV crush after events",
  rho: "Rate sensitivity per point; matters for long-dated or deep ITM positions",
};

export default function GreeksSummary({ greeks }: { greeks: Greeks }) {
  const { expertMode } = useMode();
  const openHelp = useStore((s) => s.openHelp);
  const explainers = expertMode ? EXPERT : BEGINNER;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="greeks-summary">
      {(Object.keys(UNITS) as Array<keyof Greeks>).map((key) => (
        <Hint key={key} text={explainers[key]} className="block">
          <div className="cursor-help rounded-md bg-dark-800 p-3">
            <dt className="text-xs uppercase tracking-wide text-heading">
              {key} <span className="normal-case text-content-3/70">({UNITS[key]})</span>
              <button
                onClick={() => openHelp(key)}
                data-greek-info={key}
                aria-label={`Glossary: ${key}`}
                title="Open in the glossary"
                className="ml-1 text-content-3/70 transition-colors duration-150 hover:text-accent-primary-text"
              >
                ⓘ
              </button>
            </dt>
            <dd className={`font-mono text-lg font-medium tabular-nums ${
              greeks[key] > 0 ? "text-accent-green" : greeks[key] < 0 ? "text-accent-red" : ""
            }`}>
              <CountUp to={greeks[key]} format={(n) => signed(n)} />
            </dd>
          </div>
        </Hint>
      ))}
    </dl>
  );
}
