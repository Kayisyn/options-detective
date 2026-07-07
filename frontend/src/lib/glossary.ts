// In-app glossary (v1.1 roadmap §4). Static curated content — the single
// source of truth for the Help drawer; docs/algorithms/glossary.md mirrors
// it for readers outside the app. Keep wording consistent with the app's
// conventions (theta per CALENDAR day, vega/rho per 1 point, POP from the
// lognormal model with risk-neutral drift, IV rank = realized-vol proxy).

export interface GlossaryEntry {
  id: string;
  term: string;
  body: string;
  useCase?: string;
  link?: { label: string; url: string };
}

export interface GlossarySection {
  id: string;
  title: string;
  entries: GlossaryEntry[];
}

export const GLOSSARY: GlossarySection[] = [
  {
    id: "model",
    title: "The model",
    entries: [
      {
        id: "black-scholes",
        term: "Black-Scholes",
        body: "Black-Scholes prices European options from five inputs: underlying price, strike, time to expiry, interest rate and volatility. It assumes prices follow a lognormal random walk with constant volatility — false in detail, but it is the baseline the entire industry quotes in. Every theoretical price, greek and probability in this app comes from a deterministic Black-Scholes engine with 1,300+ unit tests; nothing is estimated by an AI.",
        useCase: "Real markets deviate (volatility smiles, early exercise on American options), so treat outputs as a disciplined approximation, not gospel.",
        link: { label: "Investopedia: Black-Scholes", url: "https://www.investopedia.com/terms/b/blackscholes.asp" },
      },
      {
        id: "theoretical-price",
        term: "Theoretical price (“theo”)",
        body: "When you edit strikes in the Calculator there is no market quote for the new leg, so the app reprices it at Black-Scholes theoretical value using the leg's own implied volatility. Those prices are labelled “theo” — they are model values, not tradeable marks.",
        useCase: "Use theo prices to compare structures; verify against live quotes before ordering.",
      },
    ],
  },
  {
    id: "greeks",
    title: "Greeks",
    entries: [
      {
        id: "delta",
        term: "Delta (Δ)",
        body: "How much the position gains or loses when the underlying rises $1. This app shows position delta in dollars: delta +65 means you make about $65 on a $1 up-move — roughly the exposure of 65 shares.",
        useCase: "Traders use delta to size direction: delta-neutral positions profit from something other than price direction (time, volatility).",
        link: { label: "Investopedia: Delta", url: "https://www.investopedia.com/terms/d/delta.asp" },
      },
      {
        id: "gamma",
        term: "Gamma (Γ)",
        body: "How fast delta itself changes per $1 move. High gamma means your directional exposure snowballs — great when you own options, dangerous when you are short them, and largest near the money close to expiry.",
        useCase: "Short-premium strategies (condors, strangles) are short gamma: a fast whipsaw hurts more than the theta they collect that day.",
      },
      {
        id: "theta",
        term: "Theta (Θ)",
        body: "Dollars the position gains (+) or loses (−) per day from time passing, shown here per CALENDAR day. Option value melts toward intrinsic as expiry approaches; sellers collect that melt, buyers pay it.",
        useCase: "Income strategies live off positive theta — the screen's Income preset weights it heavily.",
        link: { label: "Investopedia: Theta", url: "https://www.investopedia.com/terms/t/theta.asp" },
      },
      {
        id: "vega",
        term: "Vega",
        body: "Dollars gained or lost when implied volatility rises 1 point. Long options are long vega (they benefit when the market gets more nervous); short options are the reverse.",
        useCase: "The classic trap: buying options before earnings, being right on direction, and still losing because IV collapsed — “IV crush” hitting your long vega.",
      },
      {
        id: "rho",
        term: "Rho (ρ)",
        body: "Dollars gained or lost when interest rates rise 1 point. Usually the least important greek for short-dated trades; it matters for long-dated or deep in-the-money positions.",
      },
    ],
  },
  {
    id: "volatility",
    title: "Volatility",
    entries: [
      {
        id: "implied-volatility",
        term: "Implied volatility (IV)",
        body: "The market's priced-in expectation of future movement, backed out of option prices and quoted annualized: IV 25% roughly means the market prices a ±25% one-year, one-standard-deviation range. IV is what you pay for optionality — high IV makes every option expensive.",
        link: { label: "Investopedia: Implied volatility", url: "https://www.investopedia.com/terms/i/iv.asp" },
      },
      {
        id: "iv-rank",
        term: "IV rank",
        body: "Where today's IV sits inside its one-year range, 0–100. Rank 80 means IV is nearer its yearly high — options are rich, favoring premium-selling structures; rank 15 means they are cheap, favoring long-volatility trades. Honest caveat: free data has no IV history, so this app ranks today's ATM IV against the past year's realized-volatility range — a documented proxy, good for bucketing high/mid/low, not a precision instrument.",
        useCase: "The Detector uses the band (high/mid/low) to pick which strategies to screen at all.",
      },
    ],
  },
  {
    id: "strategies",
    title: "Strategies",
    entries: [
      {
        id: "covered-call",
        term: "Covered call",
        body: "Own 100 shares, sell a call against them. The premium is income; in exchange you cap your upside at the strike. Risk is the stock itself falling (less the premium collected).",
        useCase: "Earning extra yield on shares you already intended to hold.",
      },
      {
        id: "cash-secured-put",
        term: "Cash-secured put",
        body: "Sell a put while holding enough cash to buy the shares if assigned. You are paid to wait for a lower entry: keep the premium if the stock stays up, or buy stock at an effective discount if it drops through the strike.",
        useCase: "Getting paid while waiting to buy a stock you want anyway — at your price.",
      },
      {
        id: "vertical-spread",
        term: "Vertical spreads (defined risk)",
        body: "Buy one option and sell another of the same type and expiry at a different strike. The short leg pays for part of the long leg and, crucially, CAPS both profit and loss at the strike width — that is what “defined risk” means: the worst case is known to the dollar before you enter.",
        useCase: "A directional bet where you can size position off a hard maximum loss.",
        link: { label: "Investopedia: Vertical spread", url: "https://www.investopedia.com/terms/v/verticalspread.asp" },
      },
      {
        id: "iron-condor",
        term: "Iron condor",
        body: "A put spread below the market plus a call spread above it, both sold for credit. Maximum profit if the underlying finishes between the short strikes; the wings define the worst case. You are betting on calm, and time decay works for you every day the bet holds.",
        useCase: "Range-bound markets with rich IV — collect premium with a known worst case.",
      },
      {
        id: "straddle-strangle",
        term: "Straddles & strangles",
        body: "A long straddle buys the call and put at the same strike — a pure bet on a BIG move in either direction, paid for with heavy daily theta. A short strangle is the mirror: sell an OTM put and call, collect premium if nothing happens — but its loss is theoretically unlimited, which is why the app tags it and the defined-risk filter excludes it.",
        useCase: "Straddles before expected volatility (labelled: you fight theta); strangles only with the risk understood.",
      },
    ],
  },
  {
    id: "probability",
    title: "Probability",
    entries: [
      {
        id: "pop",
        term: "Probability of profit (POP)",
        body: "The model probability that the position expires with ANY profit. The engine computes exact breakevens from the payoff, then integrates the Black-Scholes lognormal distribution over the profitable price regions (risk-neutral drift — no return forecast baked in). “62% POP” means: under the model, 62 of 100 paths end profitable. Limitations: it is only as good as the lognormal assumption, says nothing about HOW MUCH you win or lose, and ignores early management — high POP usually pairs with small wins and occasional large losses.",
        useCase: "Compare POP against risk/reward together — never alone.",
      },
      {
        id: "prob-max-profit",
        term: "Probability of max profit",
        body: "The chance the position expires in its maximum-profit zone — for a credit spread, beyond the short strike; for a condor, between the shorts. Always at or below POP, and zero when max profit is unbounded or attained only at a single price point.",
      },
    ],
  },
  {
    id: "scoring",
    title: "Scoring & data",
    entries: [
      {
        id: "composite-score",
        term: "Composite score",
        body: "score = 10 × (w·POP + w·risk/reward + w·theta + w·capital efficiency + w·liquidity), each component normalized 0–1 by the backend. Default weights are POP 30 / RoR 20 / Theta 20 / CapEff 15 / Liquidity 15 — and they are yours to change in Settings → Scoring weights, with presets and saved profiles. Every card's breakdown bar shows exactly where its points came from.",
        useCase: "If the #1 result doesn't match your priorities, change the weights — the ranking is transparent, not an oracle.",
      },
      {
        id: "recommendations",
        term: "How recommendations work",
        body: "The Recommender is the same deterministic ranking, not a separate opinion: top candidates by composite score (under your weights), plus factual trade-off comparisons — win rate, capital tied up, defined vs undefined risk, complexity, theta direction. No number in a recommendation is generated by an AI.",
      },
      {
        id: "data-freshness",
        term: "Data freshness",
        body: "Quotes come from free delayed data (yfinance) with a 60-second cache. Staleness is measured from the chain's last actual trade, not fetch time — a weekend fetch of Friday's close is labelled stale. When the market is closed, books are empty or wide, so candidates are priced off closing marks and tagged “indicative”: verify live spreads before trading.",
      },
    ],
  },
];

export function findEntry(id: string): { section: GlossarySection; entry: GlossaryEntry } | null {
  for (const section of GLOSSARY) {
    const entry = section.entries.find((e) => e.id === id);
    if (entry) return { section, entry };
  }
  return null;
}

export function searchGlossary(query: string): GlossarySection[] {
  const q = query.trim().toLowerCase();
  if (!q) return GLOSSARY;
  return GLOSSARY
    .map((s) => ({
      ...s,
      entries: s.entries.filter((e) =>
        e.term.toLowerCase().includes(q) || e.body.toLowerCase().includes(q)),
    }))
    .filter((s) => s.entries.length > 0);
}
