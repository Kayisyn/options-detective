const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { DataError } = require("../services/dataLayer");
const { curatedHoldingsFor, CURATED_TICKERS, SECTOR_OF, HOLDING_SETS } = require("../services/etfHoldings");
const { createIcsStore } = require("../services/icsStore");
const { createIcsScreener, HoldingsUnavailableError } = require("../services/icsScreener");
const { BY_TICKER } = require("../services/etfUniverse");

// ---- curated data integrity -------------------------------------------------

test("curated holdings: every mapped ETF is in the universe with sane data", () => {
  assert.ok(CURATED_TICKERS.includes("QQQ"), "QQQ must be curated (ICS spec)");
  assert.ok(CURATED_TICKERS.length >= 15, `only ${CURATED_TICKERS.length} curated ETFs`);
  for (const ticker of CURATED_TICKERS) {
    assert.ok(BY_TICKER.has(ticker), `${ticker} mapped but not in the universe`);
    const { holdings, source } = curatedHoldingsFor(ticker);
    assert.equal(source, "curated");
    assert.ok(holdings.length >= 10, `${ticker}: only ${holdings.length} holdings`);
    const symbols = holdings.map((h) => h.symbol);
    assert.equal(new Set(symbols).size, symbols.length, `${ticker}: duplicate holdings`);
    let prev = Infinity;
    let sum = 0;
    for (const h of holdings) {
      assert.ok(h.weight > 0 && h.weight < 0.5, `${ticker}/${h.symbol} weight ${h.weight}`);
      assert.ok(h.weight <= prev, `${ticker}: not sorted by weight`);
      assert.ok(typeof h.sector === "string" && h.sector.length > 0, `${ticker}/${h.symbol} sector`);
      assert.ok(Number.isInteger(h.rank) && h.rank >= 1, `${ticker}/${h.symbol} rank`);
      prev = h.weight;
      sum += h.weight;
    }
    assert.ok(sum < 1.001, `${ticker}: weights sum ${sum} > 1`);
  }
});

test("every holding symbol has a sector; QQQ top holding is a mega-cap", () => {
  for (const [setName, rows] of Object.entries(HOLDING_SETS)) {
    for (const [symbol] of rows) {
      assert.ok(SECTOR_OF[symbol], `${setName}/${symbol} missing in SECTOR_OF`);
    }
  }
  const qqq = curatedHoldingsFor("qqq"); // case-insensitive
  assert.ok(["NVDA", "AAPL", "MSFT"].includes(qqq.holdings[0].symbol));
  assert.equal(curatedHoldingsFor("BND"), null); // bond fund: no curated set
});

// ---- test rig ---------------------------------------------------------------

function tmpStore(now) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-ics-"));
  return createIcsStore({ dir, now });
}

function fakeCandidate(symbol, score, over = {}) {
  return {
    id: `csp:${symbol}:2026-08-21`,
    strategyType: "cash_secured_put",
    symbol,
    expiration: "2026-08-21",
    daysToExpiry: 43,
    legs: [],
    payoff: { maxProfit: 200, maxLoss: 800, breakevens: [95], profitAtExpiry: [[80, -1], [120, 2]] },
    probability: { pop: 0.7, probMaxProfit: 0.5 },
    compositeScore: score,
    ...over,
  };
}

// per-symbol canned screens; UNKNOWN throws DataError, BROKEN throws generic
function fakeDetector(callLog = []) {
  return {
    async screen({ symbol, topN }) {
      callLog.push(symbol);
      if (symbol === "TSLA") throw new DataError(`no options data for ${symbol}`);
      if (symbol === "META") throw new Error("engine hiccup");
      const scores = { NVDA: 8.4, AAPL: 7.1, MSFT: 6.2 };
      const base = scores[symbol] ?? 5.0;
      return {
        symbol,
        candidates: [
          fakeCandidate(symbol, base),
          fakeCandidate(symbol, base - 1.5, { strategyType: "call_vertical" }),
        ].slice(0, topN),
      };
    },
  };
}

function rig({ now = () => 1_000_000, fetchHoldings } = {}) {
  const callLog = [];
  const store = tmpStore(now);
  const screener = createIcsScreener({
    detector: fakeDetector(callLog),
    store,
    now,
    fetchHoldings: fetchHoldings ?? (async () => { throw new Error("fetch should not run"); }),
  });
  return { screener, store, callLog };
}

// ---- holdingsFor ------------------------------------------------------------

test("holdingsFor: curated is primary, unknown ticker rejects", async () => {
  const { screener } = rig();
  const qqq = await screener.holdingsFor("QQQ");
  assert.equal(qqq.source, "curated");
  assert.equal(qqq.totalHoldings, qqq.holdings.length);
  await assert.rejects(() => screener.holdingsFor("ZZZT"), TypeError);
  await assert.rejects(() => screener.holdingsFor(""), TypeError);
});

test("holdingsFor: yfinance fallback is cached; unavailable is cached too", async () => {
  let fetches = 0;
  const { screener } = rig({
    fetchHoldings: async (t) => {
      fetches += 1;
      if (t === "BND") return { error: "no holdings data available" };
      return {
        asOf: "2026-07-08",
        holdings: [
          { symbol: "PLD", weight: 0.08, sector: null, rank: 1 },
          { symbol: "AMT", weight: 0.06, sector: null, rank: 2 },
        ],
      };
    },
  });

  const vnq = await screener.holdingsFor("VNQ"); // not curated -> fallback
  assert.equal(vnq.source, "yfinance-top10");
  assert.equal(vnq.holdings.length, 2);
  await screener.holdingsFor("VNQ");
  assert.equal(fetches, 1, "second call must hit the cache");

  await assert.rejects(() => screener.holdingsFor("BND"), HoldingsUnavailableError);
  await assert.rejects(() => screener.holdingsFor("BND"), HoldingsUnavailableError);
  assert.equal(fetches, 2, "known-unavailable must be cached, not refetched");
});

// ---- batchScreen ------------------------------------------------------------

test("batch: merges, attaches holding meta, ranks by score, strips curves", async () => {
  const { screener } = rig();
  const res = await screener.batchScreen({ etf: "QQQ" });

  assert.equal(res.etf, "QQQ");
  assert.equal(res.source, "curated");
  assert.ok(res.candidates.length > 20, `only ${res.candidates.length} candidates`);
  assert.equal(res.cached, false);

  // ranked descending by compositeScore, NVDA's 8.4 on top
  assert.equal(res.candidates[0].symbol, "NVDA");
  for (let i = 1; i < res.candidates.length; i++) {
    assert.ok(res.candidates[i - 1].compositeScore >= res.candidates[i].compositeScore);
  }

  // holding metadata present and consistent with the curated set
  const top = res.candidates[0];
  assert.equal(top.holding.symbol, "NVDA");
  assert.equal(top.holding.sector, "Technology");
  assert.ok(top.holding.weight > 0.05);
  assert.equal(top.holding.rank, 1);

  // payoff curves stripped (Calculator recomputes on open)
  assert.deepEqual(top.payoff.profitAtExpiry, []);
  assert.equal(top.payoff.maxProfit, 200);
});

test("batch: failed symbols are skipped with reasons, never fatal", async () => {
  const { screener } = rig();
  const res = await screener.batchScreen({ etf: "QQQ" });
  const skippedSymbols = res.skipped.map((s) => s.symbol).sort();
  assert.deepEqual(skippedSymbols, ["META", "TSLA"]);
  const tsla = res.skipped.find((s) => s.symbol === "TSLA");
  assert.match(tsla.reason, /no options data/);
  const meta = res.skipped.find((s) => s.symbol === "META");
  assert.match(meta.reason, /screen failed/);
  assert.ok(!res.candidates.some((c) => c.symbol === "TSLA"));
  assert.equal(res.screenedSymbols, res.holdings.length - 2);
});

test("batch: 24h cache hit, refresh bypass, TTL expiry", async () => {
  let t = 1_000_000;
  const now = () => t;
  const callLog = [];
  const store = tmpStore(now);
  const screener = createIcsScreener({
    detector: fakeDetector(callLog), store, now,
    fetchHoldings: async () => { throw new Error("no fetch"); },
  });

  await screener.batchScreen({ etf: "QQQ" });
  const coldCalls = callLog.length;
  assert.ok(coldCalls >= 20);

  const hit = await screener.batchScreen({ etf: "QQQ" });
  assert.equal(hit.cached, true);
  assert.equal(callLog.length, coldCalls, "cache hit must not re-screen");

  const forced = await screener.batchScreen({ etf: "QQQ", refresh: true });
  assert.equal(forced.cached, false);
  assert.equal(callLog.length, coldCalls * 2, "refresh must re-screen");

  t += 25 * 60 * 60 * 1000; // beyond the 24h TTL
  const expired = await screener.batchScreen({ etf: "QQQ" });
  assert.equal(expired.cached, false);
  assert.equal(callLog.length, coldCalls * 3, "expired cache must re-screen");
});

test("batch: constraints are part of the cache key", async () => {
  const { screener, callLog } = rig();
  await screener.batchScreen({ etf: "QQQ" });
  const coldCalls = callLog.length;
  const other = await screener.batchScreen({ etf: "QQQ", constraints: { capital: 50_000 } });
  assert.equal(other.cached, false, "different capital must not reuse the cache");
  assert.equal(other.constraints.capital, 50_000);
  assert.equal(callLog.length, coldCalls * 2);
});

test("batch: screeningTimeMs and screenedAt are reported", async () => {
  let t = 5_000;
  const store = tmpStore(() => t);
  const screener = createIcsScreener({
    detector: {
      async screen({ symbol }) {
        t += 100; // each symbol "takes" 100ms
        return { symbol, candidates: [fakeCandidate(symbol, 5)] };
      },
    },
    store,
    now: () => t,
    fetchHoldings: async () => { throw new Error("no fetch"); },
  });
  const res = await screener.batchScreen({ etf: "SOXX" });
  assert.ok(res.screeningTimeMs >= 100 * res.holdings.length);
  assert.ok(res.screenedAt.startsWith("1970-01-01T"));
});
