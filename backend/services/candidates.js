// Pure candidate-draft generation: strike selection per strategy from a
// liquidity-gated chain. No I/O and no pricing math here — the Detector
// prices drafts through the math engine afterward.
//
// A draft is the structural half of a Candidate: legs with entry mids and
// per-leg IVs. Builders return null when the chain cannot support the
// structure honestly (missing/illiquid strikes, nonsensical economics) —
// a null draft is normal, not an error.

// Live sessions: wide-spread (illiquid) and bookless (indicativeOnly)
// contracts are excluded outright — never recommend what you can't trade at
// a fair price. Closed sessions: the Detector opts into relaxed marks via
// ctx.allowIndicative (closing books are systematically wide and last-trade
// marks are all that exists); every resulting candidate is labelled
// indicative and the response carries a warning.
function liquidOnly(contracts, allowIndicative = false) {
  return (contracts || []).filter((c) => c.mid > 0
    && (allowIndicative || (!c.illiquid && !c.indicativeOnly)));
}

function nearest(contracts, targetStrike) {
  let best = null;
  let bestDist = Infinity;
  for (const c of contracts) {
    const dist = Math.abs(c.strike - targetStrike);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

function nearestWhere(contracts, targetStrike, predicate) {
  return nearest(contracts.filter(predicate), targetStrike);
}

// Median gap between adjacent listed strikes — the chain's natural width unit.
function strikeStep(contracts) {
  const strikes = [...new Set(contracts.map((c) => c.strike))].sort((a, b) => a - b);
  if (strikes.length < 2) return null;
  const diffs = strikes.slice(1).map((s, i) => s - strikes[i]).sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function optionLeg(type, contract) {
  return {
    type,
    strike: contract.strike,
    price: contract.mid,
    qty: 1,
    iv: contract.impliedVolatility,
    spreadPct: contract.spreadPct,
    volume: contract.volume,
    openInterest: contract.openInterest,
  };
}

// ---- builders -------------------------------------------------------------
// ctx: { spot, atmIv, dte, calls, puts } (calls/puts already liquidity-gated)
// params: per-strategy tuning knobs, so the Detector can screen several
// variants of the same structure (narrow/wide verticals, closer/farther
// short strikes) and let the composite score arbitrate.

function buildCallVertical(ctx, { widthPct = 0.02 } = {}) {
  const calls = liquidOnly(ctx.calls, ctx.allowIndicative);
  const long = nearest(calls, ctx.spot);
  if (!long) return null;
  const width = Math.max(strikeStep(calls) || ctx.spot * 0.01, ctx.spot * widthPct);
  const short = nearestWhere(calls, long.strike + width, (c) => c.strike > long.strike);
  if (!short) return null;
  if (long.mid - short.mid <= 0) return null; // free spread = bad marks
  return [optionLeg("long_call", long), optionLeg("short_call", short)];
}

function buildPutVertical(ctx, { widthPct = 0.02 } = {}) {
  const puts = liquidOnly(ctx.puts, ctx.allowIndicative);
  const long = nearest(puts, ctx.spot);
  if (!long) return null;
  const width = Math.max(strikeStep(puts) || ctx.spot * 0.01, ctx.spot * widthPct);
  const short = nearestWhere(puts, long.strike - width, (c) => c.strike < long.strike);
  if (!short) return null;
  if (long.mid - short.mid <= 0) return null;
  return [optionLeg("long_put", long), optionLeg("short_put", short)];
}

function buildCashSecuredPut(ctx, { otmPct = 0.04 } = {}) {
  const puts = liquidOnly(ctx.puts, ctx.allowIndicative);
  const short = nearestWhere(puts, ctx.spot * (1 - otmPct), (c) => c.strike < ctx.spot);
  if (!short || short.mid <= 0) return null;
  return [optionLeg("short_put", short)];
}

function buildCoveredCall(ctx, { otmPct = 0.04 } = {}) {
  const calls = liquidOnly(ctx.calls, ctx.allowIndicative);
  const short = nearestWhere(calls, ctx.spot * (1 + otmPct), (c) => c.strike > ctx.spot);
  if (!short || short.mid <= 0) return null;
  return [
    { type: "long_stock", price: ctx.spot, qty: 100 },
    optionLeg("short_call", short),
  ];
}

function shortStrikesAtSigma(ctx, sigmaMult) {
  const sigma = ctx.atmIv || 0.25;
  const sd = ctx.spot * sigma * Math.sqrt(Math.max(ctx.dte, 1) / 365) * sigmaMult;
  const puts = liquidOnly(ctx.puts, ctx.allowIndicative);
  const calls = liquidOnly(ctx.calls, ctx.allowIndicative);
  const shortPut = nearestWhere(puts, ctx.spot - sd, (c) => c.strike < ctx.spot);
  const shortCall = nearestWhere(calls, ctx.spot + sd, (c) => c.strike > ctx.spot);
  if (!shortPut || !shortCall) return null;
  return { shortPut, shortCall, puts, calls };
}

function buildIronCondor(ctx, { sigmaMult = 1.0 } = {}) {
  const shorts = shortStrikesAtSigma(ctx, sigmaMult);
  if (!shorts) return null;
  const { shortPut, shortCall, puts, calls } = shorts;
  const wing = Math.max(strikeStep(puts) || ctx.spot * 0.01, ctx.spot * 0.01);
  const longPut = nearestWhere(puts, shortPut.strike - wing, (c) => c.strike < shortPut.strike);
  const longCall = nearestWhere(calls, shortCall.strike + wing, (c) => c.strike > shortCall.strike);
  if (!longPut || !longCall) return null;
  const credit = shortPut.mid + shortCall.mid - longPut.mid - longCall.mid;
  if (credit <= 0) return null;
  return [
    optionLeg("long_put", longPut),
    optionLeg("short_put", shortPut),
    optionLeg("short_call", shortCall),
    optionLeg("long_call", longCall),
  ];
}

function buildLongStraddle(ctx) {
  const calls = liquidOnly(ctx.calls, ctx.allowIndicative);
  const puts = liquidOnly(ctx.puts, ctx.allowIndicative);
  const putStrikes = new Set(puts.map((c) => c.strike));
  const paired = calls.filter((c) => putStrikes.has(c.strike));
  const call = nearest(paired, ctx.spot);
  if (!call) return null;
  const put = puts.find((c) => c.strike === call.strike);
  return [optionLeg("long_call", call), optionLeg("long_put", put)];
}

function buildShortStrangle(ctx, { sigmaMult = 1.0 } = {}) {
  const shorts = shortStrikesAtSigma(ctx, sigmaMult);
  if (!shorts) return null;
  const { shortPut, shortCall } = shorts;
  if (shortPut.mid + shortCall.mid <= 0) return null;
  return [optionLeg("short_put", shortPut), optionLeg("short_call", shortCall)];
}

const BUILDERS = {
  call_vertical: buildCallVertical,
  put_vertical: buildPutVertical,
  cash_secured_put: buildCashSecuredPut,
  covered_call: buildCoveredCall,
  iron_condor: buildIronCondor,
  long_straddle: buildLongStraddle,
  short_strangle: buildShortStrangle,
};

// Variants screened per strategy. Two flavors where it changes the trade's
// character; the composite score decides which survives the top-20.
const VARIANTS = {
  call_vertical: [{ widthPct: 0.02 }, { widthPct: 0.05 }],
  put_vertical: [{ widthPct: 0.02 }, { widthPct: 0.05 }],
  cash_secured_put: [{ otmPct: 0.04 }, { otmPct: 0.08 }],
  covered_call: [{ otmPct: 0.04 }, { otmPct: 0.08 }],
  iron_condor: [{ sigmaMult: 1.0 }, { sigmaMult: 1.5 }],
  long_straddle: [{}],
  short_strangle: [{ sigmaMult: 1.0 }],
};

function buildDraft(strategyType, ctx, params = {}) {
  const builder = BUILDERS[strategyType];
  if (!builder) throw new Error(`no builder for strategy ${JSON.stringify(strategyType)}`);
  const legs = builder(ctx, params);
  return legs ? { strategyType, legs } : null;
}

// All variants of a strategy for one expiration, deduplicated (coarse strike
// grids often collapse two variants onto the same strikes).
function buildDrafts(strategyType, ctx) {
  const seen = new Set();
  const drafts = [];
  for (const params of VARIANTS[strategyType] ?? [{}]) {
    const draft = buildDraft(strategyType, ctx, params);
    if (!draft) continue;
    const key = draft.legs.map((l) => `${l.type}@${l.strike ?? "S"}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(draft);
  }
  return drafts;
}

module.exports = { buildDraft, buildDrafts, BUILDERS, VARIANTS, strikeStep, liquidOnly, nearest };
