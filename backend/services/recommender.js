// Recommender: rank scored candidates, explain the trade-offs between the
// top picks with deterministic templates (numbers only from the backend),
// and produce broker-format export text.

const { detector: defaultDetector } = require("./detector");
const { WEIGHTS } = require("./detector");

function fmtExpiry(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

function money(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "unlimited";
  return `$${Math.round(x).toLocaleString("en-US")}`;
}

// "BUY 1 AAPL 150 CALL, SELL 1 AAPL 155 CALL, 01/19/26, NET DEBIT $2.30 LIMIT"
function exportText(candidate) {
  const parts = candidate.legs.map((leg) => {
    const side = leg.type.startsWith("long") ? "BUY" : "SELL";
    if (leg.type.endsWith("stock")) {
      return `${side} ${leg.qty} ${candidate.symbol} SHARES`;
    }
    const kind = leg.type.endsWith("call") ? "CALL" : "PUT";
    return `${side} ${leg.qty} ${candidate.symbol} ${leg.strike} ${kind}`;
  });
  const perShare = Math.abs(candidate.sizing.totalDebit / 100).toFixed(2);
  const debitCredit = candidate.sizing.totalDebit >= 0 ? "DEBIT" : "CREDIT";
  return `${parts.join(", ")}, ${fmtExpiry(candidate.expiration)}, NET ${debitCredit} $${perShare} LIMIT`;
}

function label(candidate) {
  return `${candidate.strategyType.replace(/_/g, " ")} (${fmtExpiry(candidate.expiration)})`;
}

// One factual sentence per meaningful difference between two candidates.
function tradeoffPair(a, b) {
  const facts = [];
  const popDiff = Math.round((a.probability.pop - b.probability.pop) * 100);
  if (Math.abs(popDiff) >= 3) {
    const [hi, lo] = popDiff > 0 ? [a, b] : [b, a];
    facts.push(`${label(hi)} has a higher win rate: ${Math.round(hi.probability.pop * 100)}% POP vs ${Math.round(lo.probability.pop * 100)}%.`);
  }
  const capA = a.sizing.capitalRequired;
  const capB = b.sizing.capitalRequired;
  if (capA > 0 && capB > 0 && Math.abs(capA - capB) / Math.min(capA, capB) > 0.25) {
    const [cheap, rich] = capA < capB ? [a, b] : [b, a];
    facts.push(`${label(cheap)} ties up less capital: ${money(cheap.sizing.capitalRequired)} vs ${money(rich.sizing.capitalRequired)}.`);
  }
  if ((a.payoff.maxLoss === null) !== (b.payoff.maxLoss === null)) {
    const defined = a.payoff.maxLoss === null ? b : a;
    const open = a.payoff.maxLoss === null ? a : b;
    facts.push(`${label(defined)} has defined risk (max loss ${money(defined.payoff.maxLoss)}); ${label(open)} does not — its loss is unlimited.`);
  }
  if (a.legs.length !== b.legs.length) {
    const [simple, complex] = a.legs.length < b.legs.length ? [a, b] : [b, a];
    facts.push(`${label(simple)} is simpler to manage (${simple.legs.length} leg${simple.legs.length > 1 ? "s" : ""} vs ${complex.legs.length}).`);
  }
  const thetaA = a.metrics.thetaPerDay;
  const thetaB = b.metrics.thetaPerDay;
  if ((thetaA >= 0) !== (thetaB >= 0)) {
    const collector = thetaA >= 0 ? a : b;
    const payer = thetaA >= 0 ? b : a;
    facts.push(`${label(collector)} collects time decay (+$${collector.metrics.thetaPerDay.toFixed(2)}/day); ${label(payer)} pays it.`);
  }
  return facts;
}

function rank(candidates, { topK = 5 } = {}) {
  const sorted = [...candidates]
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, topK)
    .map((c, i) => ({ ...c, rank: i + 1, exportText: exportText(c) }));

  const tradeoffs = [];
  for (let i = 1; i < sorted.length && i <= 3; i += 1) {
    const facts = tradeoffPair(sorted[0], sorted[i]);
    if (facts.length > 0) {
      tradeoffs.push({ between: [sorted[0].id, sorted[i].id], facts });
    }
  }
  return { ranked: sorted, tradeoffs, weights: WEIGHTS };
}

function createRecommender({ detector = defaultDetector } = {}) {
  // Accepts either pre-screened candidates (the normal Detector -> UI ->
  // Recommender flow) or screen parameters to run a fresh screen.
  async function recommend(body = {}) {
    if (Array.isArray(body.candidates) && body.candidates.length > 0) {
      return { source: "provided", ...rank(body.candidates, body) };
    }
    if (typeof body.symbol === "string" && body.symbol.trim() !== "") {
      const screened = await detector.screen(body);
      return {
        source: "screened",
        symbol: screened.symbol,
        price: screened.price,
        stale: screened.stale,
        warnings: screened.warnings,
        ...rank(screened.candidates, body),
      };
    }
    throw new TypeError("body must provide candidates[] or a symbol to screen");
  }
  return { recommend };
}

const recommender = createRecommender();

module.exports = { createRecommender, recommender, rank, exportText, tradeoffPair };
