const test = require("node:test");
const assert = require("node:assert/strict");

const { exportText, rank, tradeoffPair, createRecommender } = require("../services/recommender");
const { createDetector } = require("../services/detector");
const { engineClient } = require("../services/mathEngine");
const { fakeDataLayer, syntheticMarketData } = require("./fixtures");

test.after(() => engineClient.shutdown());

function fakeCandidate(overrides = {}) {
  return {
    id: overrides.id ?? "call_vertical:2026-08-21:x",
    strategyType: "call_vertical",
    symbol: "AAPL",
    expiration: "2026-08-21",
    legs: [
      { type: "long_call", strike: 150, price: 6.5, qty: 1 },
      { type: "short_call", strike: 155, price: 4.2, qty: 1 },
    ],
    payoff: { maxProfit: 270, maxLoss: 230, breakevens: [152.3] },
    probability: { pop: 0.62, probMaxProfit: 0.35 },
    metrics: { thetaPerDay: -1.2, riskRewardRatio: 1.17, capitalEfficiency: 1.17 },
    sizing: { totalDebit: 230, capitalRequired: 230, contractsSuggested: 2 },
    compositeScore: 6.1,
    ...overrides,
  };
}

test("export text matches broker format for a debit vertical", () => {
  assert.equal(
    exportText(fakeCandidate()),
    "BUY 1 AAPL 150 CALL, SELL 1 AAPL 155 CALL, 08/21/26, NET DEBIT $2.30 LIMIT",
  );
});

test("export text handles credit structures and stock legs", () => {
  const condor = fakeCandidate({
    strategyType: "iron_condor",
    legs: [
      { type: "long_put", strike: 90, price: 0.5, qty: 1 },
      { type: "short_put", strike: 95, price: 1.2, qty: 1 },
      { type: "short_call", strike: 105, price: 1.5, qty: 1 },
      { type: "long_call", strike: 110, price: 0.7, qty: 1 },
    ],
    sizing: { totalDebit: -150, capitalRequired: 350 },
  });
  assert.equal(
    exportText(condor),
    "BUY 1 AAPL 90 PUT, SELL 1 AAPL 95 PUT, SELL 1 AAPL 105 CALL, BUY 1 AAPL 110 CALL, 08/21/26, NET CREDIT $1.50 LIMIT",
  );

  const coveredCall = fakeCandidate({
    strategyType: "covered_call",
    legs: [
      { type: "long_stock", price: 308.63, qty: 100 },
      { type: "short_call", strike: 320, price: 4.1, qty: 1 },
    ],
    sizing: { totalDebit: 30_453, capitalRequired: 30_453 },
  });
  assert.equal(
    exportText(coveredCall),
    "BUY 100 AAPL SHARES, SELL 1 AAPL 320 CALL, 08/21/26, NET DEBIT $304.53 LIMIT",
  );
});

test("rank sorts by composite score and annotates export text", () => {
  const out = rank([
    fakeCandidate({ id: "a", compositeScore: 4.0 }),
    fakeCandidate({ id: "b", compositeScore: 7.2 }),
    fakeCandidate({ id: "c", compositeScore: 5.5 }),
  ]);
  assert.deepEqual(out.ranked.map((c) => c.id), ["b", "c", "a"]);
  assert.deepEqual(out.ranked.map((c) => c.rank), [1, 2, 3]);
  assert.ok(out.ranked.every((c) => typeof c.exportText === "string"));
  assert.ok(out.weights.pop === 0.30);
});

test("trade-off facts surface POP, capital, defined risk and simplicity", () => {
  const condor = fakeCandidate({
    id: "condor",
    strategyType: "iron_condor",
    legs: [
      { type: "long_put", strike: 90, price: 0.5, qty: 1 },
      { type: "short_put", strike: 95, price: 1.2, qty: 1 },
      { type: "short_call", strike: 105, price: 1.5, qty: 1 },
      { type: "long_call", strike: 110, price: 0.7, qty: 1 },
    ],
    probability: { pop: 0.71, probMaxProfit: 0.5 },
    sizing: { totalDebit: -150, capitalRequired: 350 },
    metrics: { thetaPerDay: 2.1 },
  });
  const vertical = fakeCandidate({ id: "vert" });
  const facts = tradeoffPair(condor, vertical);
  const text = facts.join(" ");
  assert.ok(text.includes("higher win rate"), text);
  assert.ok(text.includes("less capital") || text.includes("ties up"), text);
  assert.ok(text.includes("simpler to manage"), text);
  assert.ok(text.includes("time decay"), text);
});

test("recommend() screens when given a symbol, ranks when given candidates", async () => {
  const recommender = createRecommender({
    detector: createDetector({
      dataLayer: fakeDataLayer(syntheticMarketData({ ivRank: 80 })),
    }),
  });
  const screened = await recommender.recommend({ symbol: "TEST", directionalView: "neutral" });
  assert.equal(screened.source, "screened");
  assert.ok(screened.ranked.length >= 3);
  assert.ok(screened.ranked[0].compositeScore >= screened.ranked.at(-1).compositeScore);
  assert.ok(screened.ranked.every((c) => c.exportText.includes("TEST")));

  const provided = await recommender.recommend({ candidates: screened.ranked });
  assert.equal(provided.source, "provided");
  assert.equal(provided.ranked.length, Math.min(5, screened.ranked.length));

  await assert.rejects(() => recommender.recommend({}), TypeError);
});
