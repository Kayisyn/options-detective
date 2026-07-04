// Detector: screen all expirations x eligible strategies, price everything
// through ONE warm math-engine batch, score, rank.
//
// Composite score (docs/strategy-mapping.md):
//   POP 0.30 · risk/reward 0.20 · theta 0.20 · capital efficiency 0.15
//   · liquidity 0.15  -> 0-10
//
// Every number on a Candidate comes from the math engine or the quote feed;
// this module only selects, assembles and normalizes.

const { callEngineBatch } = require("./mathEngine");
const { dataLayer: defaultDataLayer } = require("./dataLayer");
const { buildDraft } = require("./candidates");
const { eligibleStrategies, ivBand } = require("./strategyMapping");
const { engineLegs, totalDebitOf, netGreeksOf, capitalRequiredOf } = require("./positionMath");

const DEFAULTS = {
  directionalView: "neutral",
  capital: 25_000,
  riskTolerancePct: 2,      // percent of capital risked per trade
  maxLossDollars: null,     // hard cap on top of the percentage budget
  minDTE: 5,
  maxDTE: 90,
  definedRiskOnly: false,
  allowedStrategies: [],
  maxExpirations: 6,
  riskFreeRate: Number(process.env.RISK_FREE_RATE ?? 0.04),
  topN: 20,
};

const WEIGHTS = { pop: 0.30, ror: 0.20, theta: 0.20, capEff: 0.15, liquidity: 0.15 };

function dteOf(expiration, nowMs) {
  // options expire at the US market close; 21:00 UTC is close enough for DTE
  const expiryMs = Date.parse(`${expiration}T21:00:00Z`);
  return Math.max(1, Math.round((expiryMs - nowMs) / 86_400_000));
}

function atmIvOf(chain, spot) {
  const found = [];
  for (const side of ["calls", "puts"]) {
    const withIv = (chain[side] || []).filter((c) => c.impliedVolatility);
    if (withIv.length > 0) {
      const best = withIv.reduce((a, b) => (
        Math.abs(a.strike - spot) <= Math.abs(b.strike - spot) ? a : b));
      found.push(best.impliedVolatility);
    }
  }
  if (found.length === 0) return null;
  return found.reduce((a, b) => a + b, 0) / found.length;
}

function liquidityOf(legs, dataAgeSeconds) {
  const optionLegs = legs.filter((l) => !l.type.endsWith("stock"));
  const spreads = optionLegs.map((l) => l.spreadPct).filter((s) => s !== null && s !== undefined);
  return {
    bidAskSpread: spreads.length
      ? Math.round((spreads.reduce((a, b) => a + b, 0) / spreads.length) * 10_000) / 10_000
      : null,
    volume: Math.min(...optionLegs.map((l) => l.volume ?? 0)),
    dataAgeSeconds,
  };
}

function money(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "unlimited";
  return `$${Math.round(x).toLocaleString("en-US")}`;
}

function scoreCandidates(list) {
  const thetas = list.map((c) => c.metrics.thetaPerDay);
  const tMin = Math.min(...thetas);
  const tMax = Math.max(...thetas);

  for (const c of list) {
    const { maxProfit, maxLoss } = c.payoff;
    const pop = c.probability.pop;

    let ror;
    if (maxProfit === null) ror = 1.0;                    // unbounded upside
    else if (maxLoss === null) ror = 0.15;                // unbounded risk
    else ror = Math.min(maxProfit / Math.max(maxLoss, 1), 3) / 3;

    const theta = tMax - tMin < 1e-9 ? 0.5
      : (c.metrics.thetaPerDay - tMin) / (tMax - tMin);

    const capEff = maxProfit === null ? 0.6
      : Math.min(c.metrics.capitalEfficiency ?? 0, 1);

    const spread = c.liquidity.bidAskSpread;
    const spreadScore = spread === null ? 0 : Math.min(Math.max(1 - spread / 0.05, 0), 1);
    const volumeScore = Math.min((c.liquidity.volume ?? 0) / 500, 1);
    const liq = spreadScore * 0.7 + volumeScore * 0.3;

    c.compositeScore = Math.round(
      10 * (WEIGHTS.pop * pop + WEIGHTS.ror * ror + WEIGHTS.theta * theta
        + WEIGHTS.capEff * capEff + WEIGHTS.liquidity * liq) * 100,
    ) / 100;

    c.rationale = [
      `${Math.round(pop * 100)}% POP`,
      `max profit ${money(maxProfit)} vs max loss ${money(maxLoss)}`,
      `theta ${c.metrics.thetaPerDay >= 0 ? "+" : ""}$${c.metrics.thetaPerDay.toFixed(2)}/day`,
      `needs ${money(c.sizing.capitalRequired)}${c.sizing.capitalApproximate ? " (margin approx.)" : ""}`,
    ].join(" · ");
  }
  list.sort((a, b) => b.compositeScore - a.compositeScore);
  return list;
}

function createDetector({ dataLayer = defaultDataLayer, engineBatch = callEngineBatch, now = Date.now } = {}) {
  async function screen(params = {}) {
    const opts = { ...DEFAULTS, ...params };
    if (!opts.symbol) throw new Error("symbol is required");

    const data = await dataLayer.getMarketData(opts.symbol, {
      refresh: Boolean(opts.refresh),
      maxExpirations: opts.maxExpirations,
    });

    const strategies = eligibleStrategies(opts.directionalView, data.ivRank, {
      definedRiskOnly: opts.definedRiskOnly,
      allowedStrategies: opts.allowedStrategies,
    });

    const warnings = [];
    if (data.stale) {
      const ageMin = Math.round((data.quoteAgeSeconds ?? data.dataAgeSeconds) / 60);
      warnings.push(`quotes are ~${ageMin} minutes old (market closed?) — treat marks as indicative`);
    }

    // Closed/quiet market (stale quotes, or mostly missing books): screening
    // on closing/last-trade marks is still useful — but it is opt-in and
    // labelled on every candidate, never silent.
    let bookless = 0;
    let keptContracts = 0;
    for (const expiration of data.expirations) {
      const chain = data.chains[expiration];
      if (!chain) continue;
      for (const side of ["calls", "puts"]) {
        for (const c of chain[side]) {
          keptContracts += 1;
          if (c.indicativeOnly) bookless += 1;
        }
      }
    }
    const allowIndicative = data.stale
      || (keptContracts > 0 && bookless / keptContracts > 0.5);
    if (allowIndicative) {
      warnings.push("market appears closed (stale quotes / empty books) — candidates priced off closing marks; verify live spreads before trading");
    }

    // ---- build drafts across expirations ----
    const drafts = [];
    for (const expiration of data.expirations) {
      const dte = dteOf(expiration, now());
      if (dte < opts.minDTE || dte > opts.maxDTE) continue;
      const chain = data.chains[expiration];
      if (!chain) continue;
      const atmIv = atmIvOf(chain, data.price) ?? data.atmIv;
      if (!atmIv) continue; // cannot price probabilities honestly without an IV
      const ctx = { spot: data.price, atmIv, dte, calls: chain.calls, puts: chain.puts, allowIndicative };
      for (const strategyType of strategies) {
        const draft = buildDraft(strategyType, ctx);
        if (draft) drafts.push({ ...draft, expiration, dte, atmIv });
      }
    }

    if (drafts.length === 0) {
      warnings.push("no candidates survived liquidity gates and DTE filters");
      return summaryEnvelope(data, opts, strategies, [], warnings, 0);
    }

    // ---- one engine batch: summary + POP + prob-max-profit + leg greeks ----
    const requests = [];
    const index = [];
    for (const draft of drafts) {
      const legs = engineLegs(draft.legs);
      const T = draft.dte / 365;
      const base = {
        legs, current_price: data.price, T, sigma: draft.atmIv, r: opts.riskFreeRate,
      };
      const entry = { summary: requests.length };
      requests.push({ fn: "payoff_summary", args: { legs } });
      entry.pop = requests.length;
      requests.push({ fn: "prob_of_profit", args: base });
      entry.pmp = requests.length;
      requests.push({ fn: "prob_max_profit", args: base });
      entry.greeks = [];
      for (const leg of draft.legs) {
        if (leg.type.endsWith("stock")) {
          entry.greeks.push(null);
          continue;
        }
        entry.greeks.push(requests.length);
        requests.push({
          fn: leg.type.endsWith("call") ? "bs_call_greeks" : "bs_put_greeks",
          args: { S: data.price, K: leg.strike, T, r: opts.riskFreeRate, sigma: leg.iv ?? draft.atmIv },
        });
      }
      index.push(entry);
    }

    const results = await engineBatch(requests);

    // ---- assemble candidates ----
    const candidates = [];
    drafts.forEach((draft, i) => {
      const ix = index[i];
      const summary = results[ix.summary];
      const pop = results[ix.pop];
      const pmp = results[ix.pmp];
      if (!summary.ok || !pop.ok || !pmp.ok) {
        warnings.push(`dropped ${draft.strategyType} ${draft.expiration}: ${(summary.error || pop.error || pmp.error)}`);
        return;
      }
      const legGreeks = ix.greeks.map((gi) => (gi === null ? null
        : (results[gi].ok ? results[gi].result : null)));

      const maxProfit = summary.result.max_profit; // null = unbounded (engine convention)
      const maxLoss = summary.result.max_loss;
      const totalDebit = totalDebitOf(draft.legs);
      const capReq = capitalRequiredOf(draft.strategyType, draft.legs, maxLoss ?? Infinity, data.price, totalDebit);
      const netGreeks = netGreeksOf(draft.legs, legGreeks);

      const budget = Math.min(
        opts.capital * (opts.riskTolerancePct / 100),
        opts.maxLossDollars ?? Infinity,
      );
      const contracts = maxLoss !== null && maxLoss > 0 ? Math.floor(budget / maxLoss) : 0;

      candidates.push({
        id: `${draft.strategyType}:${draft.expiration}:${draft.legs
          .map((l) => `${l.type}@${l.strike ?? "S"}`).join("|")}`,
        strategyType: draft.strategyType,
        symbol: data.symbol,
        expiration: draft.expiration,
        daysToExpiry: draft.dte,
        legs: draft.legs.map((leg, li) => ({ ...leg, greeks: legGreeks[li] ?? undefined })),
        netGreeks,
        payoff: {
          maxProfit,
          maxLoss,
          breakevens: summary.result.breakevens,
          profitAtExpiry: [], // filled below for the top N only (payload size)
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
        liquidity: liquidityOf(draft.legs, data.dataAgeSeconds),
        meta: {
          sigma: draft.atmIv,
          riskFreeRate: opts.riskFreeRate,
          spot: data.price,
          stale: data.stale,
          marksQuality: allowIndicative ? "indicative" : "live",
        },
      });
    });

    scoreCandidates(candidates);
    const top = candidates.slice(0, opts.topN);

    // ---- second small batch: payoff curves for the top N only ----
    if (top.length > 0) {
      const curveResults = await engineBatch(top.map((c) => ({
        fn: "payoff_curve",
        args: { legs: engineLegs(c.legs), current_price: data.price, num_points: 61 },
      })));
      top.forEach((c, i) => {
        if (curveResults[i].ok) c.payoff.profitAtExpiry = curveResults[i].result;
      });
    }

    return summaryEnvelope(data, opts, strategies, top, warnings, candidates.length);
  }

  function summaryEnvelope(data, opts, strategies, candidates, warnings, generated) {
    return {
      symbol: data.symbol,
      price: data.price,
      ivRank: data.ivRank,
      ivBand: ivBand(data.ivRank),
      atmIv: data.atmIv,
      directionalView: opts.directionalView,
      strategiesScreened: strategies,
      expirationsScreened: data.expirations,
      generated,
      candidates,
      dataAgeSeconds: data.dataAgeSeconds,
      stale: data.stale,
      warnings,
    };
  }

  return { screen };
}

const detector = createDetector();

module.exports = { createDetector, detector, DEFAULTS, WEIGHTS };
