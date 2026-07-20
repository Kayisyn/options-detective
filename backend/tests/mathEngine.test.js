// Integration tests against the REAL persistent Python engine (--serve).
// Requires the venv at backend/math/.venv (see README).
const test = require("node:test");
const assert = require("node:assert/strict");

const { callEngine, callEngineBatch, EngineDomainError, engineClient } = require("../services/mathEngine");

test.after(() => engineClient.shutdown());

test("prices a call through the warm engine", async () => {
  const price = await callEngine("bs_call_price", { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 });
  assert.ok(Math.abs(price - 10.4506) < 1e-3, `got ${price}`);
});

test("pipelines concurrent calls over one process", async () => {
  const [call, put, pop] = await Promise.all([
    callEngine("bs_call_price", { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 }),
    callEngine("bs_put_price", { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 }),
    callEngine("prob_itm", { S: 100, K: 100, T: 0.5, sigma: 0.25, r: 0.03 }),
  ]);
  // put-call parity through the bridge
  assert.ok(Math.abs(call - put - (100 - 100 * Math.exp(-0.05))) < 1e-9);
  assert.ok(pop > 0 && pop < 1);
});

test("batch returns per-item envelopes", async () => {
  const results = await callEngineBatch([
    { fn: "bs_call_greeks", args: { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 } },
    { fn: "bs_call_price", args: { S: -1, K: 100, T: 1, r: 0.05, sigma: 0.2 } },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].ok, true);
  assert.ok("delta" in results[0].result);
  assert.equal(results[1].ok, false);
});

test("domain errors reject with EngineDomainError", async () => {
  await assert.rejects(
    () => callEngine("bs_call_price", { S: -5, K: 100, T: 1, r: 0.05, sigma: 0.2 }),
    EngineDomainError,
  );
});

test("engine stays warm: 200 batch items complete fast", async () => {
  await callEngine("bs_call_price", { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 }); // warm-up
  const requests = Array.from({ length: 200 }, (_, i) => ({
    fn: "bs_call_greeks",
    args: { S: 100, K: 80 + i * 0.2, T: 0.5, r: 0.04, sigma: 0.25 },
  }));
  const started = Date.now();
  const results = await callEngineBatch(requests);
  const elapsed = Date.now() - started;
  assert.equal(results.filter((r) => r.ok).length, 200);
  assert.ok(elapsed < 2_000, `200-item batch took ${elapsed}ms`);
});
