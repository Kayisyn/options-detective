const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTradeStore } = require("../services/tradeStore");

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-trades-"));
  return { store: createTradeStore({ dir }), dir };
}

const CANDIDATE = {
  id: "call_vertical:2026-08-21:x",
  strategyType: "call_vertical",
  symbol: "AAPL",
  expiration: "2026-08-21",
  legs: [
    { type: "long_call", strike: 310, price: 8.0, qty: 1 },
    { type: "short_call", strike: 320, price: 4.2, qty: 1 },
  ],
};

test("save -> list -> remove round trip", () => {
  const { store } = tmpStore();
  const saved = store.save({ candidate: CANDIDATE, exportText: "BUY 1 ...", note: "earnings play" });
  assert.ok(saved.id);
  assert.ok(saved.savedAt);

  const listed = store.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].note, "earnings play");
  assert.equal(listed[0].candidate.strategyType, "call_vertical");

  assert.equal(store.remove(saved.id), true);
  assert.equal(store.list().length, 0);
  assert.equal(store.remove(saved.id), false); // already gone
});

test("list is newest first and survives new store instances", () => {
  const { store, dir } = tmpStore();
  store.save({ candidate: { ...CANDIDATE, id: "first" } });
  store.save({ candidate: { ...CANDIDATE, id: "second" } });
  const reopened = createTradeStore({ dir });
  const listed = reopened.list();
  assert.equal(listed.length, 2);
  assert.ok(listed[0].savedAt >= listed[1].savedAt);
});

test("rejects entries without a real candidate", () => {
  const { store } = tmpStore();
  for (const bad of [
    {}, { candidate: null }, { candidate: { strategyType: "x" } },
    { candidate: { strategyType: "x", legs: [] } },
  ]) {
    assert.throws(() => store.save(bad), TypeError);
  }
  assert.equal(store.list().length, 0);
});

test("corrupted journal surfaces an error instead of silently wiping", () => {
  const { store, dir } = tmpStore();
  fs.writeFileSync(path.join(dir, "trades.json"), "{not json");
  assert.throws(() => store.list(), /unreadable/);
  assert.throws(() => store.save({ candidate: CANDIDATE }), /unreadable/);
});
