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

test("spread gate uses dollars with a floor, not naive percent-of-mid", () => {
  const { chains } = applyLiquidityGates({
    exp: {
      calls: [
        // tight book: $0.20 on a $5 mid -> liquid
        contract({ bid: 4.9, ask: 5.1, mid: 5.0, spreadPct: 0.04 }),
        // wide book: $2.00 on a $5 mid -> illiquid
        contract({ bid: 4.0, ask: 6.0, mid: 5.0, spreadPct: 0.4 }),
        // cheap wing: 33% of mid but only $0.10 wide -> LIQUID (the
        // percent-only gate wrongly flagged the entire AAPL chain)
        contract({ bid: 0.25, ask: 0.35, mid: 0.30, spreadPct: 0.3333 }),
        // busy ATM weekly: $0.23 on $3.04 (7.6% of mid) -> liquid
        contract({ bid: 2.92, ask: 3.15, mid: 3.035, spreadPct: 0.0758 }),
        // no book at all (market closed): indicative, not illiquid
        contract({ bid: 0, ask: 0, mid: 3.2, spreadPct: null }),
      ],
      puts: [],
    },
  });
  assert.deepEqual(chains.exp.calls.map((c) => c.illiquid),
    [false, true, false, false, false]);
  assert.deepEqual(chains.exp.calls.map((c) => c.indicativeOnly),
    [false, false, false, false, true]);
});

test("staleness keys off last trade time, not fetch time", async () => {
  const nowMs = Date.parse("2026-07-03T16:00:00Z"); // holiday: market closed
  const layer = createDataLayer({
    fetcher: async () => ({
      symbol: "TEST", price: 100, chains: {},
      fetchedAt: "2026-07-03T16:00:00Z",            // fetched right now...
      lastTradeAt: "2026-07-02T19:59:58-04:00",     // ...of yesterday's close
    }),
    now: () => nowMs,
  });
  const d = await layer.getMarketData("TEST");
  assert.equal(d.dataAgeSeconds, 0);
  assert.ok(d.quoteAgeSeconds > 15 * 60, `quoteAge ${d.quoteAgeSeconds}`);
  assert.equal(d.stale, true);
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
