const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDraft, buildDrafts, strikeStep } = require("../services/candidates");
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

test("relaxed marks also admit wide closing books, labelled not hidden", () => {
  const closingBooks = {
    ...CTX,
    calls: CHAIN.calls.map((c) => ({ ...c, illiquid: true })),
    puts: CHAIN.puts.map((c) => ({ ...c, illiquid: true })),
  };
  assert.equal(buildDraft("iron_condor", closingBooks), null);
  assert.ok(buildDraft("iron_condor", { ...closingBooks, allowIndicative: true }));
});

test("width variants produce distinct verticals on a fine strike grid", () => {
  const fine = syntheticChain({
    spot: 100,
    strikes: Array.from({ length: 41 }, (_, i) => 80 + i), // $1 steps
  });
  const ctx = { spot: 100, atmIv: 0.25, dte: 45, calls: fine.calls, puts: fine.puts };
  const drafts = buildDrafts("call_vertical", ctx);
  assert.equal(drafts.length, 2);
  const widths = drafts.map((d) => d.legs[1].strike - d.legs[0].strike);
  assert.deepEqual(widths, [2, 5]); // 2% and 5% of spot
});

test("variants collapsing onto the same strikes deduplicate", () => {
  // $5 strike steps swallow both width targets -> one draft, not two clones
  const drafts = buildDrafts("call_vertical", CTX);
  assert.equal(drafts.length, 1);
});

test("cash-secured put variants pick different strikes", () => {
  const drafts = buildDrafts("cash_secured_put", CTX);
  assert.deepEqual(drafts.map((d) => d.legs[0].strike), [95, 90]); // 4% / 8% OTM
});

test("iron condor sigma variants move the shorts wider", () => {
  const drafts = buildDrafts("iron_condor", CTX);
  assert.equal(drafts.length, 2);
  const shortPuts = drafts.map((d) => d.legs[1].strike);
  assert.ok(shortPuts[1] < shortPuts[0], `expected wider shorts, got ${shortPuts}`);
});

test("empty chain yields no drafts, not errors", () => {
  const empty = { spot: 100, atmIv: 0.25, dte: 45, calls: [], puts: [] };
  for (const s of ["call_vertical", "put_vertical", "cash_secured_put",
                   "covered_call", "iron_condor", "long_straddle", "short_strangle"]) {
    assert.equal(buildDraft(s, empty), null, s);
  }
});
