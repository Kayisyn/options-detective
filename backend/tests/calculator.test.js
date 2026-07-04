// Calculator analysis against the REAL Python engine.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createCalculator, CalcInputError } = require("../services/calculator");
const { engineClient } = require("../services/mathEngine");

test.after(() => engineClient.shutdown());

const calc = createCalculator();

const BULL_CALL = {
  legs: [
    { type: "long_call", strike: 100, price: 6.5, qty: 1, iv: 0.25 },
    { type: "short_call", strike: 105, price: 4.5, qty: 1, iv: 0.24 },
  ],
  spot: 100,
  dte: 45,
  capital: 25_000,
  riskTolerancePct: 2,
};

test("bull call spread: exact payoff, probabilities, sizing", async () => {
  const out = await calc.analyze(BULL_CALL);

  // exact payoff math (width 5, debit 2)
  assert.equal(out.payoff.maxProfit, 300);
  assert.equal(out.payoff.maxLoss, 200);
  assert.deepEqual(out.payoff.breakevens, [102]);
  assert.equal(out.payoff.profitAtExpiry.length, 81);

  // greeks: long ATM call delta > short OTM call delta -> net positive
  assert.ok(out.netGreeks.delta > 0);
  assert.ok(out.legs[0].greeks.delta > out.legs[1].greeks.delta);

  // probabilities are consistent: max profit is a subset of profit
  assert.ok(out.probability.pop > 0 && out.probability.pop < 1);
  assert.ok(out.probability.probMaxProfit <= out.probability.pop);

  // sizing: $500 budget / $200 max loss -> 2 contracts
  assert.equal(out.sizing.contractsSuggested, 2);
  assert.equal(out.sizing.totalDebit, 200);
  assert.equal(out.sizing.capitalRequired, 200);
});

test("sigma falls back to average leg IV and is echoed in inputs", async () => {
  const out = await calc.analyze(BULL_CALL);
  assert.ok(Math.abs(out.inputs.sigma - 0.245) < 1e-9);
});

test("covered call uses buy-write capital when strategyType is passed", async () => {
  const out = await calc.analyze({
    legs: [
      { type: "long_stock", price: 100, qty: 100 },
      { type: "short_call", strike: 105, price: 2, qty: 1, iv: 0.22 },
    ],
    spot: 100,
    dte: 30,
    strategyType: "covered_call",
  });
  assert.equal(out.sizing.totalDebit, 9800);       // stock less premium
  assert.equal(out.sizing.capitalRequired, 9800);
  assert.equal(out.payoff.maxProfit, 700);
  assert.deepEqual(out.payoff.breakevens, [98]);
});

test("undefined-risk position gets a flagged margin proxy", async () => {
  const out = await calc.analyze({
    legs: [
      { type: "short_put", strike: 95, price: 2, qty: 1, iv: 0.3 },
      { type: "short_call", strike: 105, price: 2, qty: 1, iv: 0.28 },
    ],
    spot: 100,
    dte: 30,
  });
  assert.equal(out.payoff.maxLoss, null); // unbounded, surfaced as null
  assert.equal(out.sizing.capitalApproximate, true);
  assert.equal(out.sizing.contractsSuggested, 0); // cannot size undefined risk
});

test("input validation rejects malformed requests", async () => {
  const bad = [
    { ...BULL_CALL, legs: [] },
    { ...BULL_CALL, legs: [{ type: "long_future", strike: 100, price: 1, qty: 1 }] },
    { ...BULL_CALL, legs: [{ type: "long_call", price: 1, qty: 1 }] },       // no strike
    { ...BULL_CALL, legs: [{ type: "long_call", strike: 100, price: 1, qty: 0 }] },
    { ...BULL_CALL, spot: -5 },
    { ...BULL_CALL, dte: 0 },
    { ...BULL_CALL, sigma: -0.2 },
    {
      legs: [{ type: "long_call", strike: 100, price: 6.5, qty: 1 }], // no iv anywhere
      spot: 100, dte: 45,
    },
  ];
  for (const params of bad) {
    await assert.rejects(() => calc.analyze(params), CalcInputError,
      JSON.stringify(params).slice(0, 80));
  }
});

test("adjustment flow: widening the spread raises max profit and max loss", async () => {
  const narrow = await calc.analyze(BULL_CALL);
  const wide = await calc.analyze({
    ...BULL_CALL,
    legs: [
      { type: "long_call", strike: 100, price: 6.5, qty: 1, iv: 0.25 },
      { type: "short_call", strike: 110, price: 3.0, qty: 1, iv: 0.23 },
    ],
  });
  assert.ok(wide.payoff.maxProfit > narrow.payoff.maxProfit);
  assert.ok(wide.payoff.maxLoss > narrow.payoff.maxLoss);
});
