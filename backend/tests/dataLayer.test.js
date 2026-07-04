const test = require("node:test");
const assert = require("node:assert/strict");

const { applyLiquidityGates, createDataLayer, DataError } = require("../services/dataLayer");

function contract(overrides = {}) {
  return {
    strike: 100, bid: 4.9, ask: 5.1, mid: 5.0,
    volume: 500, openInterest: 1000, impliedVolatility: 0.25,
    spreadPct: 0.04, timestamp: null,
    ...overrides,
  };
}

test("liquidity gates drop low-volume, low-OI and unpriced contracts", () => {
  const { chains, stats } = applyLiquidityGates({
    "2026-08-21": {
      calls: [
        contract(),                          // keep
        contract({ volume: 10 }),            // drop: volume
        contract({ openInterest: 50 }),      // drop: OI
        contract({ mid: null }),             // drop: no price
      ],
      puts: [contract({ strike: 95 })],
    },
  });
  assert.equal(chains["2026-08-21"].calls.length, 1);
  assert.equal(chains["2026-08-21"].puts.length, 1);
  assert.deepEqual(stats, {
    total: 5, kept: 2,
    dropped: { noPrice: 1, volume: 1, openInterest: 1 },
  });
});

test("wide spreads flagged illiquid; missing books flagged indicative", () => {
  const { chains } = applyLiquidityGates({
    exp: {
      calls: [
        contract({ spreadPct: 0.04 }),  // tight book: fine
        contract({ spreadPct: 0.08 }),  // wide book: illiquid
        contract({ spreadPct: null }),  // no book (market closed): indicative
      ],
      puts: [],
    },
  });
  assert.deepEqual(chains.exp.calls.map((c) => c.illiquid), [false, true, false]);
  assert.deepEqual(chains.exp.calls.map((c) => c.indicativeOnly), [false, false, true]);
});

test("cache serves within TTL, refetches after, refresh bypasses", async () => {
  let fetches = 0;
  let clock = 1_000_000;
  const layer = createDataLayer({
    fetcher: async () => {
      fetches += 1;
      return {
        symbol: "TEST", price: 100, chains: {},
        fetchedAt: new Date(clock).toISOString(),
      };
    },
    now: () => clock,
    ttlMs: 60_000,
  });

  await layer.getMarketData("TEST");
  await layer.getMarketData("test");            // same key, within TTL
  assert.equal(fetches, 1);

  clock += 61_000;                              // TTL expired
  await layer.getMarketData("TEST");
  assert.equal(fetches, 2);

  await layer.getMarketData("TEST", { refresh: true });
  assert.equal(fetches, 3);
});

test("data age and staleness computed from fetchedAt", async () => {
  let clock = Date.parse("2026-07-03T12:00:00Z");
  const layer = createDataLayer({
    fetcher: async () => ({
      symbol: "TEST", price: 100, chains: {},
      fetchedAt: "2026-07-03T12:00:00Z",
    }),
    now: () => clock,
  });
  const fresh = await layer.getMarketData("TEST");
  assert.equal(fresh.dataAgeSeconds, 0);
  assert.equal(fresh.stale, false);

  clock += 20 * 60 * 1000; // 20 minutes later, still cached? no — TTL expired,
  // but the fetcher returns the same old fetchedAt, so age reflects reality
  const aged = await layer.getMarketData("TEST");
  assert.equal(aged.dataAgeSeconds, 1200);
  assert.equal(aged.stale, true);
});

test("invalid symbols are rejected before any fetch", async () => {
  const layer = createDataLayer({
    fetcher: async () => { throw new Error("should not be called"); },
  });
  for (const bad of ["", "   ", "AAPL; DROP", "way_too_long_symbol", 42, null]) {
    await assert.rejects(() => layer.getMarketData(bad), DataError);
  }
});
