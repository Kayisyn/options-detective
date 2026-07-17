const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ETF_UNIVERSE, TICKERS } = require("../services/etfUniverse");
const { screen, passesFilters, scoreFor, PRESETS } = require("../services/etfScreening");
const { createEtfStore } = require("../services/etfStore");
const { createScreener } = require("../services/etfScreener");

// A merged ETF record with dynamic metrics filled in.
function etf(over = {}) {
  return {
    ticker: "TST", name: "Test", issuer: "Vanguard", sector: "Technology",
    assetClass: "Equity", expenseRatio: 0.001, aumBillions: 50,
    price: 100, ytdReturn: 12, atmIv: 0.25, ivRank: 70,
    annualizedCallPremiumPct: 18, otmCallStrike: 105, callVolume: 3000, dte: 30,
    ...over,
  };
}

test("universe is curated with clean reference data", () => {
  assert.ok(ETF_UNIVERSE.length >= 40, `only ${ETF_UNIVERSE.length} ETFs`);
  assert.equal(new Set(TICKERS).size, TICKERS.length, "duplicate tickers");
  // v1.3.0 added QQQ + SPY: the most options-liquid ETFs, per the ICS spec
  for (const e of ETF_UNIVERSE) {
    assert.ok(["Vanguard", "iShares", "Invesco", "State Street"].includes(e.issuer), e.ticker);
    assert.ok(e.expenseRatio > 0 && e.expenseRatio < 0.02, `${e.ticker} ER`);
    assert.ok(e.aumBillions > 0, `${e.ticker} AUM`);
    assert.ok(["Equity", "Bond", "Commodity"].includes(e.assetClass), e.ticker);
  }
});

test("static filters apply even without dynamic metrics", () => {
  const noMetrics = { ...etf(), price: null, ivRank: null, annualizedCallPremiumPct: null, callVolume: null, ytdReturn: null };
  assert.equal(passesFilters(noMetrics, { sectors: ["Technology"] }), true);
  assert.equal(passesFilters(noMetrics, { sectors: ["Healthcare"] }), false);
  assert.equal(passesFilters(noMetrics, { minAum: 40 }), true);
  assert.equal(passesFilters(noMetrics, { minAum: 60 }), false);
  assert.equal(passesFilters(noMetrics, { maxExpenseRatioPct: 0.2 }), true); // 0.10% <= 0.20%
  assert.equal(passesFilters(noMetrics, { maxExpenseRatioPct: 0.05 }), false);
});

test("dynamic filters exclude ETFs missing the required metric", () => {
  assert.equal(passesFilters(etf({ ivRank: null }), { ivRankMin: 60 }), false);
  assert.equal(passesFilters(etf({ ivRank: 70 }), { ivRankMin: 60 }), true);
  assert.equal(passesFilters(etf({ ivRank: 50 }), { ivRankMin: 60 }), false);
  assert.equal(passesFilters(etf({ annualizedCallPremiumPct: null }), { premiumMin: 10 }), false);
  assert.equal(passesFilters(etf({ callVolume: null }), { minCallVolume: 500 }), false);
  assert.equal(passesFilters(etf({ price: 40 }), { priceMin: 50 }), false);
  assert.equal(passesFilters(etf({ ytdReturn: -5 }), { ytdMin: 0 }), false);
});

test("v1.9.0 filters: yield, 52w performance, ATR volatility, theta rank", () => {
  const rec = etf({ dividendYieldPct: 1.8, perf52wPct: 14, atrPct20: 6.5, thetaRank: 72 });
  // dividend yield range
  assert.equal(passesFilters(rec, { yieldMin: 1 }), true);
  assert.equal(passesFilters(rec, { yieldMin: 2 }), false);
  assert.equal(passesFilters(rec, { yieldMax: 3 }), true);
  assert.equal(passesFilters(rec, { yieldMax: 1 }), false);
  // 52w performance
  assert.equal(passesFilters(rec, { perf52wMin: 10 }), true);
  assert.equal(passesFilters(rec, { perf52wMax: 10 }), false);
  // ATR volatility band
  assert.equal(passesFilters(rec, { atrMin: 5, atrMax: 15 }), true);
  assert.equal(passesFilters(rec, { atrMax: 5 }), false);
  // theta rank floor
  assert.equal(passesFilters(rec, { thetaRankMin: 70 }), true);
  assert.equal(passesFilters(rec, { thetaRankMin: 80 }), false);
  // missing metric + active filter = excluded (never credit the unmeasured)
  assert.equal(passesFilters(etf({ dividendYieldPct: null }), { yieldMin: 0.5 }), false);
  assert.equal(passesFilters(etf({ atrPct20: null }), { atrMax: 10 }), false);
  assert.equal(passesFilters(etf({ thetaRank: null }), { thetaRankMin: 10 }), false);
});

test("v1.9.0 theta rank is a premium percentile across the universe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-etf-"));
  const store = createEtfStore({ dir });
  // three ETFs with known premiums -> deterministic percentiles
  store.saveMetrics({
    QQQ: { price: 400, annualizedCallPremiumPct: 30, asOf: new Date().toISOString() },
    SPY: { price: 480, annualizedCallPremiumPct: 20, asOf: new Date().toISOString() },
    VTI: { price: 240, annualizedCallPremiumPct: 10, asOf: new Date().toISOString() },
  });
  const screener = createScreener({ store });
  const byTicker = Object.fromEntries(screener.universe().map((e) => [e.ticker, e]));
  assert.equal(byTicker.QQQ.thetaRank, 100);  // richest premium
  assert.equal(byTicker.SPY.thetaRank, 50);
  assert.equal(byTicker.VTI.thetaRank, 0);    // leanest premium
  assert.equal(byTicker.VOO.thetaRank, null); // no metrics -> no rank
});

test("scoring is bounded, weighted, and reflects the strategy", () => {
  const rich = etf({ annualizedCallPremiumPct: 25, callVolume: 6000, ivRank: 90, aumBillions: 120 });
  const cc = scoreFor(rich, "covered_call");
  assert.ok(cc.score > 9, `covered-call score ${cc.score}`);
  assert.equal(cc.breakdown.reduce((s, b) => s + b.points, 0).toFixed(2), cc.score.toFixed(2));

  // low-IV ETF scores poorly for covered calls but well for spreads
  const cheap = etf({ ivRank: 10, annualizedCallPremiumPct: 4, atmIv: 0.15, callVolume: 4000 });
  assert.ok(scoreFor(cheap, "covered_call").score < scoreFor(cheap, "spread").score);

  // missing metrics never exceed the bound and never NaN
  const bare = { ...etf({ ivRank: null, annualizedCallPremiumPct: null, callVolume: null, ytdReturn: null, atmIv: null }) };
  for (const strat of ["covered_call", "csp", "spread"]) {
    const s = scoreFor(bare, strat).score;
    assert.ok(s >= 0 && s <= 10 && Number.isFinite(s), `${strat} ${s}`);
  }
});

test("screen filters, scores, and ranks descending", () => {
  const universe = [
    etf({ ticker: "HI", annualizedCallPremiumPct: 22, callVolume: 5000, ivRank: 85 }),
    etf({ ticker: "MID", annualizedCallPremiumPct: 14, callVolume: 2000, ivRank: 65 }),
    etf({ ticker: "LO", annualizedCallPremiumPct: 8, callVolume: 300, ivRank: 40 }),
    etf({ ticker: "BOND", sector: "Bonds", assetClass: "Bond", ivRank: 20, annualizedCallPremiumPct: 3, callVolume: 100 }),
  ];
  const out = screen(universe, { strategy: "covered_call", filters: { ivRankMin: 60 } });
  assert.deepEqual(out.candidates.map((c) => c.ticker), ["HI", "MID"]);
  assert.ok(out.candidates[0].score >= out.candidates[1].score);
  assert.ok(out.candidates[0].scoreBreakdown.length > 0);
  assert.equal(out.total, 2);
});

test("presets are well-formed and reference real strategies", () => {
  assert.equal(PRESETS.length, 4);
  for (const p of PRESETS) {
    assert.ok(["covered_call", "csp", "spread"].includes(p.strategy), p.id);
    assert.equal(typeof p.filters, "object");
  }
});

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-etf-"));
  return createEtfStore({ dir });
}

test("store merges good metrics and skips error entries", () => {
  const store = tmpStore();
  store.saveMetrics({ VOO: { price: 500, asOf: "x" }, BAD: { error: "boom" } });
  const m = store.getMetrics();
  assert.equal(m.VOO.price, 500);
  assert.equal(m.BAD, undefined);
  // a later failed fetch does not wipe good data
  store.saveMetrics({ VOO: { error: "network" } });
  assert.equal(store.getMetrics().VOO.price, 500);
});

test("watchlist add/remove persists and dedupes", () => {
  const store = tmpStore();
  assert.deepEqual(store.setWatchlist("voo", "add"), ["VOO"]);
  assert.deepEqual(store.setWatchlist("VOO", "add"), ["VOO"]); // dedupe
  store.setWatchlist("qqq", "add");
  assert.deepEqual(store.setWatchlist("VOO", "remove").sort(), ["QQQ"]);
  assert.throws(() => store.setWatchlist("", "add"), TypeError);
});

test("screener merges static + cached metrics and flags freshness", async () => {
  const store = tmpStore();
  let fetchCalls = 0;
  const screener = createScreener({
    store,
    now: () => Date.parse("2026-07-07T12:00:00Z"),
    fetchMetrics: async (tickers) => {
      fetchCalls += 1;
      const out = {};
      for (const t of tickers) {
        out[t] = t === "IWM"
          ? { error: "no data" }
          : { price: 100, ivRank: 75, annualizedCallPremiumPct: 20, callVolume: 4000,
              ytdReturn: 10, atmIv: 0.3, asOf: "2026-07-07T09:00:00Z" };
      }
      return out;
    },
  });

  // before refresh: static present, metrics null, stale
  const vooBefore = screener.universe().find((e) => e.ticker === "VOO");
  assert.equal(vooBefore.hasMetrics, false);
  assert.equal(vooBefore.stale, true);
  assert.equal(vooBefore.price, null);
  assert.equal(vooBefore.expenseRatioPct, 0.03); // 0.0003 -> 0.03%

  const res = await screener.refresh(["VOO", "IWM"]);
  assert.equal(fetchCalls, 1);
  assert.equal(res.refreshed, 1);
  assert.ok(res.errors.some((e) => e.includes("IWM")));

  const voo = screener.universe().find((e) => e.ticker === "VOO");
  assert.equal(voo.hasMetrics, true);
  assert.equal(voo.ivRank, 75);
  assert.equal(voo.stale, false); // asOf within 24h of now

  // screen returns VOO (metrics) and not the unmetriced ETFs under an IV filter
  const screened = screener.screen({ strategy: "covered_call", filters: { ivRankMin: 60 } });
  assert.ok(screened.candidates.some((c) => c.ticker === "VOO"));
  assert.ok(!screened.candidates.some((c) => c.ticker === "VTI")); // no metrics -> excluded by IV filter

  // detail view exposes all three strategy scores
  const detail = screener.getEtf("VOO");
  assert.ok(detail.scores.covered_call.score > 0);
  assert.ok(detail.scores.spread.breakdown.length > 0);
  assert.equal(screener.getEtf("NOPE"), null);
});

test("refresh restricts to known tickers, ignores junk", async () => {
  const store = tmpStore();
  let requested = null;
  const screener = createScreener({
    store,
    fetchMetrics: async (tickers) => { requested = tickers; return {}; },
  });
  await screener.refresh(["VOO", "FAKE123", "iwm"]);
  assert.ok(requested.includes("VOO"));
  assert.ok(requested.includes("IWM")); // lowercased input normalized
  assert.ok(!requested.includes("FAKE123")); // not in the curated universe
});

test("watchlist through the screener validates tickers", () => {
  const store = tmpStore();
  const screener = createScreener({ store });
  assert.deepEqual(screener.toggleWatchlist("VOO", "add"), ["VOO"]);
  assert.throws(() => screener.toggleWatchlist("NOTREAL", "add"), TypeError);
  assert.equal(screener.watchlist()[0].ticker, "VOO");
});
