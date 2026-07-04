// Calculator: full analysis for one position (a Detector candidate or
// user-adjusted legs) — per-leg greeks, net greeks, exact payoff summary,
// payoff curve, probabilities, sizing. One warm engine batch per call, so
// adjustments recalculate in tens of milliseconds.

const { callEngineBatch } = require("./mathEngine");
const {
  capitalRequiredOf, engineLegs, netGreeksOf, totalDebitOf,
} = require("./positionMath");

// Bad request-shaped input (missing legs, nonsense numbers) — maps to 400.
class CalcInputError extends Error {}

const LEG_TYPES = new Set([
  "long_call", "short_call", "long_put", "short_put", "long_stock", "short_stock",
]);

const DEFAULTS = {
  riskFreeRate: Number(process.env.RISK_FREE_RATE ?? 0.04),
  capital: 25_000,
  riskTolerancePct: 2,
  maxLossDollars: null,
  curvePoints: 81,
};

function validateInputs({ legs, spot, dte, sigma }) {
  if (!Array.isArray(legs) || legs.length === 0 || legs.length > 6) {
    throw new CalcInputError("legs must be an array of 1-6 legs");
  }
  legs.forEach((leg, i) => {
    if (!leg || typeof leg !== "object" || !LEG_TYPES.has(leg.type)) {
      throw new CalcInputError(`leg ${i}: type must be one of ${[...LEG_TYPES].join(", ")}`);
    }
    if (!leg.type.endsWith("stock")
        && !(Number.isFinite(leg.strike) && leg.strike > 0)) {
      throw new CalcInputError(`leg ${i}: option legs need a positive strike`);
    }
    if (!(Number.isFinite(leg.price) && leg.price >= 0)) {
      throw new CalcInputError(`leg ${i}: price must be >= 0`);
    }
    if (!(Number.isInteger(leg.qty) && leg.qty > 0)) {
      throw new CalcInputError(`leg ${i}: qty must be a positive integer`);
    }
  });
  if (!(Number.isFinite(spot) && spot > 0)) {
    throw new CalcInputError("spot (current underlying price) must be > 0");
  }
  if (!(Number.isFinite(dte) && dte > 0)) {
    throw new CalcInputError("dte (days to expiry) must be > 0");
  }
  if (sigma !== undefined && sigma !== null
      && !(Number.isFinite(sigma) && sigma > 0)) {
    throw new CalcInputError("sigma must be > 0 when provided");
  }
}

function resolveSigma(sigma, legs) {
  if (Number.isFinite(sigma) && sigma > 0) return sigma;
  const ivs = legs.map((l) => l.iv).filter((v) => Number.isFinite(v) && v > 0);
  if (ivs.length === 0) {
    throw new CalcInputError(
      "sigma is required (none provided and no leg carries an implied volatility)");
  }
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

function createCalculator({ engineBatch = callEngineBatch } = {}) {
  async function analyze(params = {}) {
    const opts = { ...DEFAULTS, ...params };
    validateInputs(opts);
    const sigma = resolveSigma(opts.sigma, opts.legs);
    const T = opts.dte / 365;
    const eLegs = engineLegs(opts.legs);
    const probArgs = {
      legs: eLegs, current_price: opts.spot, T, sigma, r: opts.riskFreeRate,
    };

    const requests = [
      { fn: "payoff_summary", args: { legs: eLegs } },
      { fn: "payoff_curve", args: { legs: eLegs, current_price: opts.spot, num_points: opts.curvePoints } },
      { fn: "prob_of_profit", args: probArgs },
      { fn: "prob_max_profit", args: probArgs },
      ...opts.legs.map((leg) => (leg.type.endsWith("stock")
        ? null
        : {
          fn: leg.type.endsWith("call") ? "bs_call_greeks" : "bs_put_greeks",
          args: {
            S: opts.spot, K: leg.strike, T, r: opts.riskFreeRate,
            sigma: (Number.isFinite(leg.iv) && leg.iv > 0) ? leg.iv : sigma,
          },
        })).filter(Boolean),
    ];
    const results = await engineBatch(requests);

    const [summary, curve, pop, pmp] = results;
    for (const item of [summary, curve, pop, pmp]) {
      if (!item.ok) throw new CalcInputError(item.error);
    }
    const greekResults = results.slice(4);
    let gi = 0;
    const legGreeks = opts.legs.map((leg) => {
      if (leg.type.endsWith("stock")) return null;
      const r = greekResults[gi];
      gi += 1;
      return r.ok ? r.result : null;
    });

    const maxProfit = summary.result.max_profit; // null = unbounded
    const maxLoss = summary.result.max_loss;
    const totalDebit = totalDebitOf(opts.legs);
    const netGreeks = netGreeksOf(opts.legs, legGreeks);
    const capReq = capitalRequiredOf(
      opts.strategyType ?? null, opts.legs, maxLoss ?? Infinity, opts.spot, totalDebit);

    const budget = Math.min(
      opts.capital * (opts.riskTolerancePct / 100),
      opts.maxLossDollars ?? Infinity,
    );
    const contracts = maxLoss !== null && maxLoss > 0 ? Math.floor(budget / maxLoss) : 0;

    return {
      legs: opts.legs.map((leg, i) => ({ ...leg, greeks: legGreeks[i] ?? undefined })),
      netGreeks,
      payoff: {
        maxProfit,
        maxLoss,
        breakevens: summary.result.breakevens,
        profitAtExpiry: curve.result,
      },
      probability: { pop: pop.result, probMaxProfit: pmp.result },
      metrics: {
        riskRewardRatio: maxProfit !== null && maxLoss !== null && maxLoss > 0
          ? Math.round((maxProfit / maxLoss) * 100) / 100 : null,
        capitalEfficiency: maxProfit !== null && capReq.amount > 0
          ? Math.round((maxProfit / capReq.amount) * 1000) / 1000 : null,
        thetaPerDay: netGreeks.theta,
      },
      sizing: {
        contractsSuggested: contracts,
        totalDebit,
        pctOfAccount: Math.round((Math.abs(totalDebit) * Math.max(contracts, 1) / opts.capital) * 1000) / 1000,
        capitalRequired: Math.round(capReq.amount * 100) / 100,
        capitalApproximate: capReq.approximate,
      },
      inputs: {
        spot: opts.spot, dte: opts.dte, sigma, riskFreeRate: opts.riskFreeRate,
        capital: opts.capital, riskTolerancePct: opts.riskTolerancePct,
        strategyType: opts.strategyType ?? null,
      },
    };
  }

  return { analyze };
}

const calculator = createCalculator();

module.exports = { createCalculator, calculator, CalcInputError };
