const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTradeStore } = require("../services/tradeStore");
const { createPaperStore } = require("../services/paperStore");
const { createPaperTrading } = require("../services/paperTrading");

const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const FAR_FUTURE = "2099-08-21";

function rig({ price = 100, engineResult = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-paper-"));
  const tradeStore = createTradeStore({ dir });
  const paperStore = createPaperStore({ dir });
  const calls = { engine: [], quotes: [] };
  const paper = createPaperTrading({
    tradeStore,
    paperStore,
    dataLayer: {
      getMarketData: async (sym) => {
        calls.quotes.push(sym);
        return { price, stale: false };
      },
    },
    engineBatch: async (reqs) => {
      calls.engine.push(reqs);
      return reqs.map(() => ({ ok: true, result: [engineResult] }));
    },
    calculator: { analyze: async () => ({ sizing: { totalDebit: 250 } }) },
  });
  return { paper, tradeStore, paperStore, calls };
}

const CSP_CANDIDATE = {
  id: "csp:x", strategyType: "cash_secured_put", symbol: "SPY",
  expiration: FAR_FUTURE,
  legs: [{ type: "short_put", strike: 95, price: 2, qty: 1, iv: 0.3 }],
  payoff: { maxProfit: 200, maxLoss: 9300 },
  sizing: { totalDebit: -200, capitalRequired: 9300 },
  meta: { sigma: 0.3, riskFreeRate: 0.04 },
};

test("budget lifecycle: setup once, then reset", () => {
  const { paper } = rig();
  assert.throws(() => paper.balance() === null && paper.reset(), /no paper account/);
  const { budget, balance } = paper.setBudget(50_000);
  assert.equal(budget.initialBalance, 50_000);
  assert.equal(balance.available, 50_000);
  assert.throws(() => paper.setBudget(25_000), /use reset/i);
  const after = paper.reset(25_000);
  assert.equal(after.balance.initialBalance, 25_000);
});

test("opening reserves capital and enforces the budget", () => {
  const { paper } = rig();
  paper.setBudget(9_000);
  const { trade, balance } = paper.open({
    symbol: "QQQ", strategy: "put_vertical", side: "debit",
    entryPrice: 2, entryQty: 2, maxLossTarget: 400,
  });
  assert.equal(trade.paper, true);
  assert.equal(trade.reservedCapital, 400);
  assert.equal(balance.available, 8_600);
  assert.equal(balance.accountValue, 9_000); // nothing realized yet

  // cash-secured put via candidate needs capitalRequired x qty = 9300 > 8600
  assert.throws(() => paper.open({ candidate: CSP_CANDIDATE }), /insufficient paper balance/);
});

test("v1.3.3: candidate opens scale reservation by contract count", () => {
  const { paper } = rig();
  paper.setBudget(20_000);
  // 2 contracts of a $9,300-capital CSP -> $18,600 reserved, still fits
  const { trade, balance } = paper.open({ candidate: CSP_CANDIDATE, entryQty: 2 });
  assert.equal(trade.entryQty, 2);
  assert.equal(trade.reservedCapital, 18_600);
  assert.equal(balance.available, 1_400);
  // 3 contracts would need $27,900 on a fresh $20k account -> rejected
  const fresh = rig();
  fresh.paper.setBudget(20_000);
  assert.throws(() => fresh.paper.open({ candidate: CSP_CANDIDATE, entryQty: 3 }),
    /insufficient paper balance/);
});

test("credit trades without a loss basis are rejected", () => {
  const { paper } = rig();
  paper.setBudget(50_000);
  assert.throws(() => paper.open({
    symbol: "SPY", strategy: "short_strangle", side: "credit",
    entryPrice: 3, entryQty: 1,
  }), /assignmentStrike .* or a maxLossTarget/);
});

test("manual close realizes P&L into the balance", () => {
  const { paper } = rig();
  paper.setBudget(20_000);
  const { trade } = paper.open({
    symbol: "IWM", strategy: "call_vertical", side: "debit",
    entryPrice: 1.5, entryQty: 1, maxLossTarget: 150,
  });
  const { balance } = paper.close(trade.id, { exitPrice: 2.4 });
  assert.equal(balance.realizedPnl, 90);           // (2.4-1.5)x100
  assert.equal(balance.available, 20_090);          // reservation released
  assert.equal(balance.accountValue, 20_090);
});

test("CSP assignment at expiry: ITM buys shares at the strike, OTM keeps premium", async () => {
  // v1.5.0 share carry — ITM: spot 88 vs strike 95, credit 2.00. The trade
  // realizes the premium (+200); 100 shares enter the holdings ledger at
  // cost basis 95 and are marked at spot 88.
  const itm = rig({ price: 88 });
  itm.paper.setBudget(50_000);
  itm.paper.open({
    symbol: "SPY", strategy: "cash_secured_put", side: "credit",
    entryPrice: 2, entryQty: 1, assignmentStrike: 95, expiration: YESTERDAY,
  });
  let out = await itm.paper.process();
  let t = out.trades[0];
  assert.equal(t.status, "assigned");
  assert.equal(t.actualPnl, 200); // premium kept; share loss floats unrealized
  assert.ok(t.tags.includes("Assigned"));
  assert.ok(t.notes.includes("shares now held"));
  assert.equal(out.events.length, 1);
  assert.match(out.events[0], /SPY: 100 shares assigned at \$95/);
  assert.equal(out.holdings.length, 1);
  assert.deepEqual(
    { shares: out.holdings[0].shares, costBasis: out.holdings[0].costBasis, lastPrice: out.holdings[0].lastPrice },
    { shares: 100, costBasis: 95, lastPrice: 88 });
  // cash: 50000 + 200 premium - 9500 spent on shares
  assert.equal(out.balance.available, 40_700);
  // account: cash 40700 + shares at market 8800 = 49500 (same net worth as
  // the old cash-settled model — the loss is just unrealized now)
  assert.equal(out.balance.accountValue, 49_500);

  // selling the shares at market realizes the share loss
  const sale = await itm.paper.sellHolding("SPY", {});
  assert.equal(sale.sold.realized, -700); // (88 - 95) x 100
  assert.equal(sale.holdings.length, 0);
  assert.equal(sale.balance.available, 49_500);
  assert.equal(sale.balance.accountValue, 49_500);

  // OTM: spot 100 > strike 95 -> full premium kept, no shares
  const otm = rig({ price: 100 });
  otm.paper.setBudget(50_000);
  otm.paper.open({
    symbol: "SPY", strategy: "cash_secured_put", side: "credit",
    entryPrice: 2, entryQty: 1, assignmentStrike: 95, expiration: YESTERDAY,
  });
  out = await otm.paper.process();
  t = out.trades[0];
  assert.equal(t.status, "expired");
  assert.equal(t.actualPnl, 200);
  assert.equal(out.holdings.length, 0);
});

test("covered call at expiry: called away above strike, rides the stock below", async () => {
  // buy-write entry 98/share, strike 105
  const called = rig({ price: 112 });
  called.paper.setBudget(50_000);
  called.paper.open({
    symbol: "AAPL", strategy: "covered_call", side: "debit",
    entryPrice: 98, entryQty: 1, assignmentStrike: 105, expiration: YESTERDAY,
    maxLossTarget: 9_800,
  });
  let out = await called.paper.process();
  assert.equal(out.trades[0].status, "assigned");
  assert.equal(out.trades[0].actualPnl, 700); // (105-98)x100

  const kept = rig({ price: 94 });
  kept.paper.setBudget(50_000);
  kept.paper.open({
    symbol: "AAPL", strategy: "covered_call", side: "debit",
    entryPrice: 98, entryQty: 1, assignmentStrike: 105, expiration: YESTERDAY,
    maxLossTarget: 9_800,
  });
  out = await kept.paper.process();
  assert.equal(out.trades[0].status, "expired");
  assert.equal(out.trades[0].actualPnl, -400); // (94-98)x100, settled at market
});

test("candidate-linked settlement uses the engine's exact payoff (non-CSP)", async () => {
  // engine says the structure's expiry P&L at spot is -180 per unit.
  // v1.5.0: assigned CSPs now settle via share carry, so the engine-payoff
  // path is exercised with a defined-risk vertical instead.
  const { paper, calls } = rig({ price: 88, engineResult: -180 });
  paper.setBudget(50_000);
  paper.open({
    candidate: {
      ...CSP_CANDIDATE,
      id: "pv:x",
      strategyType: "put_vertical",
      legs: [
        { type: "short_put", strike: 95, price: 2, qty: 1, iv: 0.3 },
        { type: "long_put", strike: 90, price: 1, qty: 1, iv: 0.3 },
      ],
      sizing: { totalDebit: -100, capitalRequired: 400 },
      expiration: YESTERDAY,
    },
  });
  const out = await paper.process();
  const t = out.trades[0];
  assert.equal(calls.engine.length, 1);
  assert.equal(calls.engine[0][0].fn, "multi_leg_payoff");
  assert.equal(t.actualPnl, -180);
  assert.equal(t.status, "expired"); // no assignment strike on a vertical
  // exitPrice back-derived so pnlOf stays consistent: credit 1.00, pnl -180
  // -> exit = 1.00 + 1.80 = 2.80
  assert.equal(t.exitPrice, 2.8);
});

test("v1.5.0: candidate-linked CSP assignment carries shares instead of cash-settling", async () => {
  const { paper, calls } = rig({ price: 88 });
  paper.setBudget(50_000);
  paper.open({ candidate: { ...CSP_CANDIDATE, expiration: YESTERDAY } });
  const out = await paper.process();
  const t = out.trades[0];
  assert.equal(calls.engine.length, 0); // share carry, no payoff call
  assert.equal(t.status, "assigned");
  assert.equal(t.actualPnl, 200); // premium kept
  assert.equal(out.holdings.length, 1);
  assert.equal(out.holdings[0].costBasis, 95);
});

test("open positions get marks, snapshots build the equity curve", async () => {
  const { paper, paperStore } = rig({ price: 320 });
  paper.setBudget(30_000);
  paper.open({ candidate: { ...CSP_CANDIDATE, sizing: { totalDebit: 380, capitalRequired: 380 } } });
  await paper.process();
  const curve = paper.equityCurve(0);
  assert.ok(curve.length >= 3); // budget + open + process snapshots
  const last = curve[curve.length - 1];
  assert.ok(Number.isFinite(last.accountValue));
  assert.equal(typeof last.at, "string");
  assert.ok(paperStore.getBudget().initialBalance === 30_000);
});

test("v1.5.0: commission charged per order (entry + exit) when enabled", () => {
  const { paper } = rig();
  paper.setBudget(20_000);
  paper.setSettings({ commissionEnabled: true, commissionPerTrade: 5 });
  const { trade, balance: afterOpen } = paper.open({
    symbol: "IWM", strategy: "call_vertical", side: "debit",
    entryPrice: 1.5, entryQty: 1, maxLossTarget: 150,
  });
  assert.equal(afterOpen.feesPaid, 5);
  assert.equal(afterOpen.available, 20_000 - 150 - 5);
  const { balance } = paper.close(trade.id, { exitPrice: 2.4 });
  assert.equal(balance.feesPaid, 10);
  assert.equal(balance.realizedPnl, 80);   // 90 gross - 10 fees
  assert.equal(balance.accountValue, 20_080);
});

test("v1.5.0: settings validate and persist; defaults are fee-off/auto-assign-on", () => {
  const { paper } = rig();
  const defaults = paper.getSettings();
  assert.equal(defaults.commissionEnabled, false);
  assert.equal(defaults.autoAssign, true);
  assert.equal(defaults.thetaMode, "normal");
  assert.throws(() => paper.setSettings({ thetaMode: "warp" }), /thetaMode/);
  assert.throws(() => paper.setSettings({ commissionPerTrade: -1 }), /commissionPerTrade/);
  const next = paper.setSettings({ thetaMode: "fast", maxRiskPct: 3 });
  assert.equal(next.thetaMode, "fast");
  assert.equal(next.maxRiskPct, 3);
});

test("v1.5.0: auto-assign off leaves expired positions open with a warning", async () => {
  const { paper } = rig({ price: 88 });
  paper.setBudget(50_000);
  paper.setSettings({ autoAssign: false });
  paper.open({
    symbol: "SPY", strategy: "cash_secured_put", side: "credit",
    entryPrice: 2, entryQty: 1, assignmentStrike: 95, expiration: YESTERDAY,
  });
  const out = await paper.process();
  assert.equal(out.trades[0].status, "open");
  assert.ok(out.warnings.some((w) => /auto-assign is off/i.test(w)));
  assert.equal(out.holdings.length, 0);
});

test("v1.5.0: theta mode warps the DTE used for marks (marks only)", async () => {
  const dteSeen = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-paper-"));
  const tradeStore = createTradeStore({ dir });
  const paperStore = createPaperStore({ dir });
  const paper = createPaperTrading({
    tradeStore,
    paperStore,
    dataLayer: { getMarketData: async () => ({ price: 100, stale: false }) },
    engineBatch: async (reqs) => reqs.map(() => ({ ok: true, result: [0] })),
    calculator: {
      analyze: async (req) => {
        dteSeen.push(req.dte);
        return { sizing: { totalDebit: 250 } };
      },
    },
  });
  paper.setBudget(50_000);
  // far-future expiry so nothing settles; backdate the entry 10 days so the
  // theta clock has elapsed time to warp against
  paper.open({ candidate: CSP_CANDIDATE });
  const id = tradeStore.list()[0].id;
  const entryTenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  tradeStore.update(id, { entryDate: entryTenDaysAgo });

  await paper.process();                 // normal: dte = real dte
  const normalDte = dteSeen[0];
  assert.ok(normalDte > 300);            // sanity: 2099 expiry

  paper.setSettings({ thetaMode: "fast" });
  await paper.process();                 // fast: extra (2-1)*10 days of decay
  assert.equal(dteSeen[1], normalDte - 10);

  paper.setSettings({ thetaMode: "slow" });
  await paper.process();                 // slow: half speed -> +5 days of DTE
  assert.equal(dteSeen[2], normalDte + 5);
});

test("reset archives paper trades and restarts the curve", async () => {
  const { paper, tradeStore } = rig();
  paper.setBudget(50_000);
  paper.open({
    symbol: "DIA", strategy: "call_vertical", side: "debit",
    entryPrice: 1, entryQty: 1, maxLossTarget: 100,
  });
  const { archived, balance } = paper.reset();
  assert.equal(archived, 1);
  assert.equal(balance.available, 50_000);
  assert.equal(balance.openCount, 0);
  // archived trades stay in the file but leave the journal listing
  assert.equal(tradeStore.list().length, 0);
  assert.equal(tradeStore.list({ includeArchived: true }).length, 1);
  assert.equal(paper.equityCurve(0).length, 1); // fresh baseline only
});

test("v1.3.2: identical snapshots inside the window are deduped, changes always record", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-paper-"));
  let t = Date.parse("2026-07-10T14:00:00Z");
  const store = createPaperStore({ dir, now: () => new Date(t) });
  store.setBudget(50_000);
  const snap = (v) => ({ accountValue: v, realizedPnl: 0, unrealizedPnl: null, openCount: 1 });

  assert.equal(store.addSnapshot(snap(50_000)), true);   // first
  t += 60_000;
  assert.equal(store.addSnapshot(snap(50_000)), false);  // 1 min later, unchanged -> skipped
  t += 60_000;
  assert.equal(store.addSnapshot(snap(49_870)), true);   // value moved -> recorded
  t += 60_000;
  assert.equal(store.addSnapshot(snap(49_870)), false);  // unchanged again -> skipped
  t += 16 * 60_000;
  assert.equal(store.addSnapshot(snap(49_870)), true);   // window elapsed -> heartbeat point
  assert.equal(store.listSnapshots(0).length, 3);
});

test("v1.3.2: minute-polling process() does not spam the curve when marks are unchanged", async () => {
  const { paper } = rig({ price: 320 });
  paper.setBudget(30_000);
  paper.open({ candidate: { ...CSP_CANDIDATE, sizing: { totalDebit: 380, capitalRequired: 380 } } });
  await paper.process(); // first pass: unrealized appears -> new curve point
  const after1 = paper.equityCurve(0).length;
  await paper.process(); // same fake quotes/marks -> deduped
  await paper.process();
  assert.equal(paper.equityCurve(0).length, after1);
});

test("paper trades stay isolated from the real journal accounting", () => {
  const { paper, tradeStore } = rig();
  paper.setBudget(10_000);
  tradeStore.create({ symbol: "REAL", strategy: "covered_call", entryPrice: 90, entryQty: 1 });
  const closedReal = tradeStore.close(tradeStore.list().find((t) => !t.paper).id, { exitPrice: 95 });
  assert.equal(closedReal.actualPnl, 500);
  const b = paper.balance();
  assert.equal(b.realizedPnl, 0); // real-trade P&L never touches paper balance
  assert.equal(b.available, 10_000);
});
