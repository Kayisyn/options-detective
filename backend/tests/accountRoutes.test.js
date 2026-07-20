const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Isolate the data root BEFORE requiring the app (session reads OD_DATA_DIR
// at module load; node --test gives this file its own process).
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "od-acctroutes-"));
process.env.OD_DATA_DIR = ROOT;

const app = require("../server.js");

// v1.7.2 /account backup/restore: exercised over real HTTP against the real
// express app — register, trade, export, clear, import, verify.
test("account export → clear → import round-trips trades", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, route, body) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  // unauthenticated: the whole /account surface is gated
  assert.equal((await call("GET", "/account/export")).status, 401);

  await call("POST", "/auth/register", { username: "roundtrip", password: "RoundTrip1" });
  await call("POST", "/auth/login", { username: "roundtrip", password: "RoundTrip1", rememberMe: false });

  const created = await call("POST", "/journal", {
    symbol: "QQQ", strategy: "cash_secured_put", side: "credit",
    entryPrice: 3.5, entryQty: 2, multiplier: 100,
  });
  assert.equal(created.status, 201);

  const exported = (await call("GET", "/account/export")).json;
  assert.equal(exported.app, "option-obelisk");
  assert.equal(exported.format, 1);
  assert.equal(exported.data.trades.length, 1);
  assert.equal(exported.data.trades[0].symbol, "QQQ");

  // clear wipes the journal
  await call("POST", "/account/clear");
  assert.equal((await call("GET", "/journal")).json.trades.length, 0);

  // import restores it byte-identically
  const imported = await call("POST", "/account/import", exported);
  assert.equal(imported.json.ok, true);
  assert.deepEqual(imported.json.restored.includes("trades"), true);
  const after = (await call("GET", "/journal")).json.trades;
  assert.equal(after.length, 1);
  assert.equal(after[0].symbol, "QQQ");
  assert.equal(after[0].id, created.json.id);

  // damaged uploads are rejected before touching disk
  assert.equal((await call("POST", "/account/import", { app: "other", format: 1 })).status, 400);
  assert.equal((await call("POST", "/account/import",
    { app: "option-obelisk", format: 1, data: { trades: "not-a-list" } })).status, 400);
});
