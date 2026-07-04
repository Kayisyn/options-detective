const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDraft, strikeStep } = require("../services/candidates");
const { syntheticChain } = require("./fixtures");

const CHAIN = syntheticChain({ spot: 100 });
const CTX = { spot: 100, atmIv: 0.25, dte: 45, calls: CHAIN.calls, puts: CHAIN.puts };

test("strike step is the median gap", () => {
  assert.equal(strikeStep(CHAIN.calls), 5);
});

test("call vertical: long near spot, short above, costs a debit", () => {
  const { legs } = buildDraft("call_vertical", CTX);
  const [long, short] = legs;
  assert.equal(long.type, "long_call");
  assert.equal(short.type, "short_call");
  assert.equal(long.strike, 100);
  assert.ok(short.strike > long.strike);
  assert.ok(long.price > short.price);
});

test("put vertical: long near spot, short below", () => {
  const { legs } = buildDraft("put_vertical", CTX);
  const [long, short] = legs;
  assert.equal(long.strike, 100);
  assert.ok(short.strike < long.strike);
  assert.ok(long.price > short.price);
});

test("cash-secured put sits below spot near the 4% target", () => {
  const { legs } = buildDraft("cash_secured_put", CTX);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].type, "short_put");
  assert.equal(legs[0].strike, 95);
});

test("covered call: 100 shares + short call above spot", () => {
  const { legs } = buildDraft("covered_call", CTX);
  const [stock, call] = legs;
  assert.equal(stock.type, "long_stock");
  assert.equal(stock.qty, 100);
  assert.equal(call.type, "short_call");
  assert.equal(call.strike, 105);
});

test("iron condor: wings outside shorts, shorts straddle spot, net credit", () => {
  const { legs } = buildDraft("iron_condor", CTX);
  const [wingPut, shortPut, shortCall, wingCall] = legs;
  assert.ok(wingPut.strike < shortPut.strike);
  assert.ok(shortPut.strike < 100);
  assert.ok(shortCall.strike > 100);
  assert.ok(wingCall.strike > shortCall.strike);
  const credit = shortPut.price + shortCall.price - wingPut.price - wingCall.price;
  assert.ok(credit > 0, `expected net credit, got ${credit}`);
});

test("long straddle: call and put share the ATM strike", () => {
  const { legs } = buildDraft("long_straddle", CTX);
  const [call, put] = legs;
  assert.equal(call.type, "long_call");
  assert.equal(put.type, "long_put");
  assert.equal(call.strike, put.strike);
  assert.equal(call.strike, 100);
});

test("short strangle shorts sit roughly one sigma out", () => {
  // sd = 100 * 0.25 * sqrt(45/365) ~= 8.8 -> nearest listed strikes 90 / 110
  const { legs } = buildDraft("short_strangle", CTX);
  const [put, call] = legs;
  assert.equal(put.strike, 90);
  assert.equal(call.strike, 110);
});

test("illiquid contracts are never selected", () => {
  const flagged = {
    ...CTX,
    calls: CHAIN.calls.map((c) => ({ ...c, illiquid: true })),
  };
  assert.equal(buildDraft("call_vertical", flagged), null);
  assert.equal(buildDraft("covered_call", flagged), null);
  // put-side strategies still work
  assert.ok(buildDraft("cash_secured_put", flagged));
});

test("indicative-only contracts need explicit opt-in (closed market)", () => {
  const closedMarket = {
    ...CTX,
    calls: CHAIN.calls.map((c) => ({ ...c, spreadPct: null, indicativeOnly: true })),
    puts: CHAIN.puts.map((c) => ({ ...c, spreadPct: null, indicativeOnly: true })),
  };
  assert.equal(buildDraft("call_vertical", closedMarket), null);
  const draft = buildDraft("call_vertical", { ...closedMarket, allowIndicative: true });
  assert.ok(draft, "allowIndicative should enable last-trade marks");
  assert.equal(draft.legs[0].spreadPct, null);
});

test("empty chain yields no drafts, not errors", () => {
  const empty = { spot: 100, atmIv: 0.25, dte: 45, calls: [], puts: [] };
  for (const s of ["call_vertical", "put_vertical", "cash_secured_put",
                   "covered_call", "iron_condor", "long_straddle", "short_strangle"]) {
    assert.equal(buildDraft(s, empty), null, s);
  }
});
