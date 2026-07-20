// Full-screen integration: synthetic chain (no network) through the REAL
// Python engine batch, end to end.
const test = require("node:test");
const assert = require("node:assert/strict");

const { engineClient } = require("../services/mathEngine");
const { createDetector } = require("../services/detector");
const { fakeDataLayer, syntheticMarketData } = require("./fixtures");

test.after(() => engineClient.shutdown());

test("neutral/high-IV screen produces ranked, priced candidates", async () => {
  const detector = createDetector({
    dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 80 })),
  });
  const out = await detector.screen({ symbol: "TEST", directionalView: "neutral" });

  assert.ok(out.candidates.length >= 4, `only ${out.candidates.length} candidates`);
  assert.equal(out.ivBand, "high");

  // ranked descending by composite score
  const scores = out.candidates.map((c) => c.compositeScore);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));

  for (const c of out.candidates) {
    assert.ok(c.probability.pop >= 0 && c.probability.pop <= 1, c.id);
    assert.ok(c.probability.probMaxProfit >= 0 && c.probability.probMaxProfit <= 1);
    assert.ok(Array.isArray(c.payoff.breakevens));
    assert.ok(c.payoff.profitAtExpiry.length > 0, `no curve for ${c.id}`);
    assert.ok(Number.isFinite(c.netGreeks.delta));
    assert.ok(c.sizing.capitalRequired > 0);
    assert.ok(c.compositeScore >= 0 && c.compositeScore <= 10);
    assert.ok(c.rationale.includes("POP"));
  }
});

test("iron condor economics: maxProfit + maxLoss equals wing width", async () => {
  const detector = createDetector({
    dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 80 })),
  });
  const out = await detector.screen({ symbol: "TEST", directionalView: "neutral" });
  const condor = out.candidates.find((c) => c.strategyType === "iron_condor");
  assert.ok(condor, "no iron condor produced");
  // 5-wide wings x 100 shares: credit + risk always sums to the width
  assert.ok(Math.abs(condor.payoff.maxProfit + condor.payoff.maxLoss - 500) < 1,
    `sum was ${condor.payoff.maxProfit + condor.payoff.maxLoss}`);
  assert.equal(condor.payoff.breakevens.length, 2);
});

test("cash-secured put capital is strike x 100 less credit", async () => {
  const detector = createDetector({
    dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 80 })),
  });
  const out = await detector.screen({ symbol: "TEST", directionalView: "income" });
  const csp = out.candidates.find((c) => c.strategyType === "cash_secured_put");
  assert.ok(csp, "no cash-secured put produced");
  const credit = -csp.sizing.totalDebit;
  assert.ok(credit > 0);
  const strike = csp.legs[0].strike;
  assert.ok(Math.abs(csp.sizing.capitalRequired - (strike * 100 - credit)) < 1);
});

test("definedRiskOnly drops the short strangle", async () => {
  const detector = createDetector({
    dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 80 })),
  });
  const out = await detector.screen({
    symbol: "TEST", directionalView: "neutral", definedRiskOnly: true,
  });
  assert.ok(out.candidates.length > 0);
  assert.ok(!out.candidates.some((c) => c.strategyType === "short_strangle"));
  assert.ok(!out.strategiesScreened.includes("short_strangle"));
});

test("bullish/low-IV screens only call verticals", async () => {
  const detector = createDetector({
    dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 15 })),
  });
  const out = await detector.screen({ symbol: "TEST", directionalView: "bullish" });
  assert.deepEqual(out.strategiesScreened, ["call_vertical"]);
  assert.ok(out.candidates.every((c) => c.strategyType === "call_vertical"));
  // one per expiration in range
  assert.equal(out.candidates.length, 2);
});

test("stale data is surfaced as a warning, not hidden", async () => {
  const stale = syntheticMarketData({ ivRank: 80 });
  stale.stale = true;
  stale.dataAgeSeconds = 3600;
  const detector = createDetector({ dataLayer: fakeDataLayer(stale) });
  const out = await detector.screen({ symbol: "TEST" });
  assert.ok(out.stale);
  assert.ok(out.warnings.some((w) => w.includes("minutes old")));
});

test("every candidate exposes a score breakdown consistent with its score", async () => {
  const detector = createDetector({
    dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 80 })),
  });
  const out = await detector.screen({ symbol: "TEST", directionalView: "neutral" });
  assert.ok(out.candidates.length > 0);
  for (const c of out.candidates) {
    const b = c.scoreBreakdown;
    assert.ok(b && b.components && b.weights, `${c.id} missing breakdown`);
    const keys = ["pop", "ror", "theta", "capEff", "liquidity"];
    assert.deepEqual(Object.keys(b.components).sort(), [...keys].sort());
    for (const k of keys) {
      assert.ok(b.components[k] >= 0 && b.components[k] <= 1, `${c.id} ${k}=${b.components[k]}`);
    }
    const weightSum = keys.reduce((s, k) => s + b.weights[k], 0);
    assert.ok(Math.abs(weightSum - 1) < 1e-9);
    const recomputed = 10 * keys.reduce((s, k) => s + b.weights[k] * b.components[k], 0);
    assert.ok(Math.abs(recomputed - c.compositeScore) < 0.02,
      `${c.id}: recomputed ${recomputed} vs composite ${c.compositeScore}`);
  }
});

test("topN is honored and clamped", async () => {
  const detector = createDetector({
    dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 80 })),
  });
  const small = await detector.screen({ symbol: "TEST", directionalView: "neutral", topN: 3 });
  assert.equal(small.candidates.length, 3);
  assert.ok(small.candidates.every((c) => c.payoff.profitAtExpiry.length > 0));
  const silly = await detector.screen({ symbol: "TEST", directionalView: "neutral", topN: 10_000 });
  assert.ok(silly.candidates.length <= 200);
});

test("sizing respects the risk budget", async () => {
  const detector = createDetector({
    dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 80 })),
  });
  const out = await detector.screen({
    symbol: "TEST", directionalView: "neutral", capital: 25_000, riskTolerancePct: 2,
  });
  for (const c of out.candidates) {
    if (c.payoff.maxLoss !== null && c.payoff.maxLoss > 0) {
      assert.ok(c.sizing.contractsSuggested * c.payoff.maxLoss <= 500 + 1e-9,
        `${c.id} risks more than the $500 budget`);
    }
  }
});
