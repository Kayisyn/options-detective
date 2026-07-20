// Market pulse service (v1.5.0 sidebars): breadth math, trending ranking,
// watch quotes, caching. The Python fetcher is injected — no network.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createMarketPulse, breadthScore, trending } = require("../services/marketPulse");

const BASKET = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"];

function quotesFixture() {
  return {
    AAA: { price: 110, prevClose: 100, changePct: 10 },
    BBB: { price: 103, prevClose: 100, changePct: 3 },
    CCC: { price: 101, prevClose: 100, changePct: 1 },
    DDD: { price: 100, prevClose: 100, changePct: 0 },
    EEE: { price: 98, prevClose: 100, changePct: -2 },
    FFF: { price: 91, prevClose: 100, changePct: -9 },
    WWW: { price: 55, prevClose: 50, changePct: 10 },
  };
}

test("breadthScore: advancers vs decliners, flat counts half", () => {
  const b = breadthScore(quotesFixture(), BASKET);
  // 3 up, 2 down, 1 flat -> (3 + 0.5) / 6 = 58%
  assert.equal(b.advancers, 3);
  assert.equal(b.decliners, 2);
  assert.equal(b.unchanged, 1);
  assert.equal(b.score, 58);
});

test("breadthScore: empty quotes -> null (no fake 0)", () => {
  assert.equal(breadthScore({}, BASKET), null);
});

test("trending: top gainers and losers, sorted correctly", () => {
  const t = trending(quotesFixture(), BASKET);
  assert.equal(t.gainers[0].symbol, "AAA");
  assert.equal(t.losers[0].symbol, "FFF");
  assert.ok(t.gainers.length <= 5 && t.losers.length <= 5);
});

test("pulse: single fetch feeds breadth + trending + watch + news; 60s cache", async () => {
  let calls = 0;
  let clock = 1_000_000;
  const svc = createMarketPulse({
    basket: BASKET,
    now: () => clock,
    fetcher: async (symbols) => {
      calls += 1;
      // watch symbols are merged into the one batch
      assert.ok(symbols.includes("WWW") && symbols.includes("AAA"));
      return { quotes: quotesFixture(), news: [{ title: "headline" }], asOf: "t" };
    },
  });

  const first = await svc.pulse({ watch: ["www"] });
  assert.equal(first.breadth.score, 58);
  assert.equal(first.watch.WWW.changePct, 10);
  assert.equal(first.news[0].title, "headline");
  assert.equal(calls, 1);

  await svc.pulse({ watch: ["WWW"] }); // same key, within TTL -> cached
  assert.equal(calls, 1);

  clock += 61_000;
  await svc.pulse({ watch: ["WWW"] }); // TTL expired -> refetch
  assert.equal(calls, 2);
});

test("pulse: watch-key change busts the cache; unknown watch symbols dropped", async () => {
  let calls = 0;
  const svc = createMarketPulse({
    basket: BASKET,
    now: () => 5,
    fetcher: async () => {
      calls += 1;
      return { quotes: quotesFixture(), news: [] };
    },
  });
  const a = await svc.pulse({ watch: [] });
  assert.deepEqual(a.watch, {});
  const b = await svc.pulse({ watch: ["ZZZ"] }); // no quote for ZZZ
  assert.deepEqual(b.watch, {});
  assert.equal(calls, 2);
});
