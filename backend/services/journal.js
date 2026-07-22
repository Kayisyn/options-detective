// Journal orchestration (v1.1 §3 Phase A): live position tracking.
//
// refreshMarks() walks the OPEN trades, pulls the underlying quote through
// the cached data layer, and — for trades that carry a candidate snapshot
// with legs — reprices the whole structure at Black-Scholes theoretical
// value at today's spot and DTE. The mark is the structure's signed value
// (positive = costs money to own, negative = credit to close), so
// unrealized P&L is one subtraction of signed values; that handles debit
// and credit sides uniformly. Manual trades without legs only get the
// underlying quote — no invented marks.
const { dataLayer: defaultDataLayer } = require("./dataLayer");
const { calculator: defaultCalculator } = require("./calculator");
const { tradeStore: defaultStore } = require("./tradeStore");

function dteOf(expiration, nowMs) {
  const expiryMs = Date.parse(`${expiration}T21:00:00Z`);
  return Math.round((expiryMs - nowMs) / 86_400_000);
}

function engineLegsOf(candidate) {
  return candidate.legs.map((leg) => (leg.type.endsWith("stock")
    ? { type: leg.type, price: leg.price, qty: leg.qty }
    : { type: leg.type, strike: leg.strike, price: leg.price, qty: leg.qty, iv: leg.iv }));
}

function createJournal({
  store = defaultStore,
  dataLayer = defaultDataLayer,
  calculator = defaultCalculator,
  now = Date.now,
} = {}) {
  async function refreshMarks() {
    const open = store.list().filter((t) => t.status === "open");
    const warnings = [];
    const quotes = new Map();

    for (const symbol of new Set(open.map((t) => t.symbol))) {
      try {
        const d = await dataLayer.getMarketData(symbol);
        quotes.set(symbol, { price: d.price, stale: d.stale });
      } catch (err) {
        warnings.push(`${symbol}: quote unavailable (${err.message})`);
      }
    }

    for (const trade of open) {
      const quote = quotes.get(trade.symbol);
      if (!quote) continue;

      let mark = null;
      let unrealized = null;
      const candidate = trade.candidate;
      if (candidate?.legs?.length && candidate.expiration) {
        const dte = dteOf(candidate.expiration, now());
        if (dte <= 0) {
          warnings.push(`${trade.symbol} ${trade.strategy}: expired ${candidate.expiration}. Close it with your broker's settlement values`);
        } else {
          try {
            const res = await calculator.analyze({
              legs: engineLegsOf(candidate),
              spot: quote.price,
              dte,
              sigma: candidate.meta?.sigma,
              riskFreeRate: candidate.meta?.riskFreeRate,
              repriceTheoretical: true,
            });
            // signed per-unit values: debit entry positive, credit negative
            const signedNow = res.sizing.totalDebit / 100;
            const signedEntry = trade.side === "credit" ? -trade.entryPrice : trade.entryPrice;
            mark = signedNow;
            unrealized = (signedNow - signedEntry) * trade.entryQty * trade.multiplier;
          } catch (err) {
            warnings.push(`${trade.symbol} ${trade.strategy}: reprice failed (${err.message})`);
          }
        }
      }
      store.recordMark(trade.id, {
        underlying: quote.price,
        mark,
        unrealizedPnl: unrealized,
        stale: quote.stale,
      });
    }

    return { trades: store.list(), warnings };
  }

  return { refreshMarks };
}

const journal = createJournal();

module.exports = { createJournal, journal };
