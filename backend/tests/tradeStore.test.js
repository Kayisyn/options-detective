const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTradeStore, NotFoundError } = require("../services/tradeStore");
const { createJournal } = require("../services/journal");

function tmpStore(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-trades-"));
  return { store: createTradeStore({ dir, ...opts }), dir };
}

const CANDIDATE = {
  id: "call_vertical:2099-08-21:x",
  strategyType: "call_vertical",
  symbol: "AAPL",
  expiration: "2099-08-21",
  legs: [
    { type: "long_call", strike: 310, price: 8.0, qty: 1, iv: 0.25 },
    { type: "short_call", strike: 320, price: 4.2, qty: 1, iv: 0.24 },
  ],
  payoff: { maxProfit: 620, maxLoss: 380, breakevens: [313.8] },
  sizing: { totalDebit: 380 },
  meta: { sigma: 0.25, riskFreeRate: 0.04 },
};

test("manual create -> close computes debit-side P&L and outcome tag", () => {
  const { store } = tmpStore();
  const t = store.create({
    symbol: "aapl", strategy: "call_vertical", side: "debit",
    entryPrice: 3.8, entryQty: 2, notes: "earnings idea",
  });
  assert.equal(t.symbol, "AAPL");
  assert.equal(t.status, "open");
  assert.equal(t.multiplier, 100);

  const closed = store.close(t.id, { exitPrice: 5.1 });
  // (5.10 - 3.80) x 2 contracts x 100
  assert.equal(closed.actualPnl, 260);
  assert.equal(closed.status, "closed");
  assert.ok(closed.tags.includes("Winner"));
});

test("credit-side P&L: profits when the price to close falls", () => {
  const { store } = tmpStore();
  const t = store.create({
    symbol: "SPY", strategy: "iron_condor", side: "credit",
    entryPrice: 1.5, entryQty: 1,
  });
  const closed = store.close(t.id, { exitPrice: 0.4, mae: -120, mfe: 90 });
  // (1.50 - 0.40) x 1 x 100
  assert.equal(closed.actualPnl, 110);
  assert.equal(closed.mae, -120);
  assert.equal(closed.mfe, 90);
  assert.ok(closed.tags.includes("Winner"));

  const loser = store.create({
    symbol: "SPY", strategy: "short_strangle", side: "credit",
    entryPrice: 2.0, entryQty: 1,
  });
  const closedLoser = store.close(loser.id, { exitPrice: 3.25 });
  assert.equal(closedLoser.actualPnl, -125);
  assert.ok(closedLoser.tags.includes("Loser"));
});

test("candidate snapshot becomes an open trade with entry from its marks", () => {
  const { store } = tmpStore();
  const t = store.createFromCandidate({ candidate: CANDIDATE, exportText: "BUY..." });
  assert.equal(t.symbol, "AAPL");
  assert.equal(t.strategy, "call_vertical");
  assert.equal(t.side, "debit");
  assert.equal(t.entryPrice, 3.8); // totalDebit 380 / 100
  assert.equal(t.maxLossTarget, 380);
  assert.equal(t.candidate.id, CANDIDATE.id);
});

test("v1.3.1: candidate save honors edited entry/targets, keeps derived defaults", () => {
  const { store } = tmpStore();
  // overrides from the Calculator's save modal
  const edited = store.createFromCandidate({
    candidate: CANDIDATE, note: "adjusted fill",
    entryPrice: 3.55, maxLossTarget: 355, maxProfitTarget: null, // null = no target
  });
  assert.equal(edited.entryPrice, 3.55);
  assert.equal(edited.maxLossTarget, 355);
  assert.equal(edited.maxProfitTarget, null);
  assert.equal(edited.notes, "adjusted fill");
  assert.equal(edited.candidate.id, CANDIDATE.id); // snapshot fidelity kept

  // omitted overrides keep candidate-derived values
  const plain = store.createFromCandidate({ candidate: CANDIDATE });
  assert.equal(plain.entryPrice, 3.8);
  assert.equal(plain.maxLossTarget, 380);

  // junk entry price is rejected, not silently accepted
  assert.throws(() => store.createFromCandidate({ candidate: CANDIDATE, entryPrice: -1 }), TypeError);
  assert.throws(() => store.createFromCandidate({ candidate: CANDIDATE, entryPrice: "abc" }), TypeError);
});

test("v1.3.3: candidate save takes a contract count — whole contracts only", () => {
  const { store } = tmpStore();
  const sized = store.createFromCandidate({ candidate: CANDIDATE, entryQty: 3 });
  assert.equal(sized.entryQty, 3);
  assert.equal(sized.entryPrice, 3.8); // per-share entry unaffected by size
  assert.equal(store.createFromCandidate({ candidate: CANDIDATE }).entryQty, 1); // default

  assert.throws(() => store.createFromCandidate({ candidate: CANDIDATE, entryQty: 0 }), TypeError);
  assert.throws(() => store.createFromCandidate({ candidate: CANDIDATE, entryQty: 1.5 }), TypeError);
  assert.throws(() => store.createFromCandidate({ candidate: CANDIDATE, entryQty: -2 }), TypeError);
});

test("v1 snapshot entries migrate to open v2 trades on read", () => {
  const { store, dir } = tmpStore();
  fs.writeFileSync(path.join(dir, "trades.json"), JSON.stringify([{
    id: "legacy-1",
    savedAt: "2026-07-04T12:00:00.000Z",
    note: "from v1",
    exportText: "SELL 1 ...",
    candidate: { ...CANDIDATE, sizing: { totalDebit: -150 } },
  }]));
  const [t] = store.list();
  assert.equal(t.status, "open");
  assert.equal(t.side, "credit");
  assert.equal(t.entryPrice, 1.5);
  assert.equal(t.notes, "from v1");
  assert.equal(t.createdAt, "2026-07-04T12:00:00.000Z");
});

test("recordMark tracks MAE/MFE watermarks on open trades only", () => {
  const { store } = tmpStore();
  const t = store.create({ symbol: "QQQ", strategy: "put_vertical", entryPrice: 2, entryQty: 1 });
  store.recordMark(t.id, { underlying: 500, mark: 1.5, unrealizedPnl: -50 });
  store.recordMark(t.id, { underlying: 505, mark: 2.8, unrealizedPnl: 80 });
  store.recordMark(t.id, { underlying: 501, mark: 1.8, unrealizedPnl: -20 }); // shallower dip
  const marked = store.get(t.id);
  assert.equal(marked.mae, -50);
  assert.equal(marked.mfe, 80);
  assert.equal(marked.lastMark.unrealizedPnl, -20);

  store.close(t.id, { exitPrice: 2.5 });
  const after = store.recordMark(t.id, { underlying: 510, mark: 3, unrealizedPnl: 999 });
  assert.equal(after.lastMark.unrealizedPnl, -20); // closed trades keep their history
});

test("update whitelists fields and locks closed trades", () => {
  const { store } = tmpStore();
  const t = store.create({ symbol: "AAPL", strategy: "covered_call", entryPrice: 300, entryQty: 1 });
  store.update(t.id, { notes: "rolled up", tags: ["Earnings", " custom "] });
  assert.deepEqual(store.get(t.id).tags, ["Earnings", "custom"]);
  assert.throws(() => store.update(t.id, { actualPnl: 999 }), /not editable/);
  store.close(t.id, { exitPrice: 305 });
  assert.throws(() => store.update(t.id, { entryPrice: 1 }), /closed trade/);
  store.update(t.id, { notes: "post-mortem ok" }); // notes stay editable
});

test("validation and not-found errors are typed", () => {
  const { store } = tmpStore();
  assert.throws(() => store.create({ strategy: "x", entryPrice: 1 }), /symbol/);
  assert.throws(() => store.create({ symbol: "A", strategy: "x", entryPrice: -1 }), /entryPrice/);
  assert.throws(() => store.create({ symbol: "A", strategy: "x", entryPrice: 1, side: "long" }), /side/);
  assert.throws(() => store.close("nope", { exitPrice: 1 }), NotFoundError);
  const t = store.create({ symbol: "A", strategy: "x", entryPrice: 1 });
  store.close(t.id, { exitPrice: 1 });
  assert.equal(store.get(t.id).tags.includes("Breakeven"), true);
  assert.throws(() => store.close(t.id, { exitPrice: 2 }), /already closed/);
});

test("journal.refreshMarks reprices candidate trades and warns on expiry", async () => {
  const { store } = tmpStore();
  const live = store.createFromCandidate({ candidate: CANDIDATE });          // 2099 expiry
  const expired = store.createFromCandidate({
    candidate: { ...CANDIDATE, id: "old", expiration: "2020-01-17" },
  });
  const manual = store.create({ symbol: "MSFT", strategy: "covered_call", entryPrice: 4, entryQty: 1 });

  const journal = createJournal({
    store,
    dataLayer: { getMarketData: async (sym) => ({ price: sym === "MSFT" ? 500 : 320, stale: false }) },
    calculator: {
      // fake theoretical revalue: structure now worth $5.00 (signed +500/unit)
      analyze: async () => ({ sizing: { totalDebit: 500 } }),
    },
  });

  const { trades, warnings } = await journal.refreshMarks();
  const liveAfter = trades.find((t) => t.id === live.id);
  assert.equal(liveAfter.lastMark.underlying, 320);
  assert.equal(liveAfter.lastMark.mark, 5);
  // (5.00 - 3.80) x 1 x 100
  assert.equal(liveAfter.lastMark.unrealizedPnl, 120);
  assert.equal(liveAfter.mfe, 120);

  const expiredAfter = trades.find((t) => t.id === expired.id);
  assert.equal(expiredAfter.lastMark.mark, null); // no invented marks
  assert.ok(warnings.some((w) => w.includes("expired")));

  const manualAfter = trades.find((t) => t.id === manual.id);
  assert.equal(manualAfter.lastMark.underlying, 500);
  assert.equal(manualAfter.lastMark.unrealizedPnl, null); // no legs -> no P&L guess
});
