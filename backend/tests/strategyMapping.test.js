const test = require("node:test");
const assert = require("node:assert/strict");

const { eligibleStrategies, ivBand } = require("../services/strategyMapping");

test("iv bands: >=70 high, <=30 low, between (or unknown) mid", () => {
  assert.equal(ivBand(85), "high");
  assert.equal(ivBand(70), "high");
  assert.equal(ivBand(30), "low");
  assert.equal(ivBand(12), "low");
  assert.equal(ivBand(50), "mid");
  assert.equal(ivBand(null), "mid");
  assert.equal(ivBand(undefined), "mid");
});

test("neutral + high IV sells premium", () => {
  const list = eligibleStrategies("neutral", 80);
  assert.ok(list.includes("iron_condor"));
  assert.ok(list.includes("short_strangle"));
  assert.ok(!list.includes("long_straddle"));
});

test("neutral + low IV buys volatility", () => {
  assert.deepEqual(eligibleStrategies("neutral", 15), ["long_straddle"]);
});

test("mid band screens the union of high and low", () => {
  const mid = new Set(eligibleStrategies("bullish", 50));
  const high = eligibleStrategies("bullish", 90);
  const low = eligibleStrategies("bullish", 10);
  for (const s of [...high, ...low]) assert.ok(mid.has(s), `missing ${s}`);
});

test("definedRiskOnly removes undefined-risk strategies", () => {
  const list = eligibleStrategies("neutral", 80, { definedRiskOnly: true });
  assert.ok(!list.includes("short_strangle"));
  assert.ok(list.includes("iron_condor"));
});

test("allowedStrategies intersects the table", () => {
  const list = eligibleStrategies("neutral", 80, {
    allowedStrategies: ["iron_condor", "call_vertical"],
  });
  assert.deepEqual(list, ["iron_condor"]); // call_vertical not eligible for neutral/high
});

test("unknown view throws", () => {
  assert.throws(() => eligibleStrategies("moonish", 50), /unknown directionalView/);
});
