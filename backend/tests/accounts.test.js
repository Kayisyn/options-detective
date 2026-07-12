const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Isolate the data root BEFORE requiring the account-aware modules — session
// reads OD_DATA_DIR at module load. node --test runs each file in its own
// process, so this doesn't leak into other suites.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "od-acct-"));
process.env.OD_DATA_DIR = ROOT;

const accounts = require("../services/accounts");
const session = require("../services/session");
const { tradeStore } = require("../services/tradeStore");
const { paperStore } = require("../services/paperStore");

test("register validates username + password and rejects duplicates", () => {
  assert.throws(() => accounts.register({ username: "ab", password: "GoodPass1" }), /Username/);
  assert.throws(() => accounts.register({ username: "has space", password: "GoodPass1" }), /Username/);
  assert.throws(() => accounts.register({ username: "trader", password: "Shrt1A" }), /at least 8/);
  assert.throws(() => accounts.register({ username: "trader", password: "alllowercase1" }), /uppercase/);
  assert.throws(() => accounts.register({ username: "trader", password: "ALLUPPERCASE1" }), /lowercase/);
  assert.throws(() => accounts.register({ username: "trader", password: "NoNumbersHere" }), /number/);

  const a = accounts.register({ username: "trader", password: "GoodPass1" });
  assert.equal(a.username, "trader");
  assert.ok(a.id);
  assert.equal(a.lastLoginAt, null);
  // usernames are unique case-insensitively
  assert.throws(() => accounts.register({ username: "TRADER", password: "GoodPass1" }), /taken/);
});

test("authenticate accepts the right password and rejects wrong/unknown alike", () => {
  accounts.register({ username: "alice", password: "Wonderland1" });
  const ok = accounts.authenticate({ username: "alice", password: "Wonderland1" });
  assert.equal(ok.username, "alice");
  assert.ok(ok.lastLoginAt);
  // same message for wrong password and unknown user (no account enumeration)
  assert.throws(() => accounts.authenticate({ username: "alice", password: "wrongpass" }),
    /Incorrect username or password/);
  assert.throws(() => accounts.authenticate({ username: "ghost", password: "whatever1A" }),
    /Incorrect username or password/);
});

test("password hashing uses salted scrypt and round-trips", () => {
  const h = accounts.hashPassword("Secret123");
  assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(accounts.verifyPassword("Secret123", h), true);
  assert.equal(accounts.verifyPassword("Secret124", h), false);
  // two hashes of the same password differ (random salt)
  assert.notEqual(accounts.hashPassword("Secret123"), h);
});

test("remember token: issue -> resolve -> clear", () => {
  const acct = accounts.register({ username: "remy", password: "Remember1" });
  const token = accounts.issueRememberToken(acct.id);
  assert.equal(accounts.resolveRememberToken({ id: acct.id, token }).id, acct.id);
  assert.equal(accounts.resolveRememberToken({ id: acct.id, token: "bad" }), null);
  assert.equal(accounts.resolveRememberToken({ id: "nope", token }), null);
  accounts.clearRememberToken(acct.id);
  assert.equal(accounts.resolveRememberToken({ id: acct.id, token }), null);
});

test("per-account isolation: trades + sandbox follow the active account", () => {
  const a = accounts.register({ username: "userA", password: "PasswordA1" });
  const b = accounts.register({ username: "userB", password: "PasswordB1" });

  session.setActive(a.id);
  tradeStore.create({ symbol: "AAPL", strategy: "covered_call", entryPrice: 5, entryQty: 1 });
  paperStore.setBudget(25000);
  assert.equal(tradeStore.list().length, 1);
  assert.equal(paperStore.getBudget().initialBalance, 25000);

  // switch to B — sees none of A's data
  session.setActive(b.id);
  assert.equal(tradeStore.list().length, 0);
  assert.equal(paperStore.getBudget(), null);
  tradeStore.create({ symbol: "TSLA", strategy: "long_put", side: "debit", entryPrice: 3, entryQty: 2 });
  assert.equal(tradeStore.list()[0].symbol, "TSLA");

  // back to A — data intact and separate
  session.setActive(a.id);
  assert.equal(tradeStore.list().length, 1);
  assert.equal(tradeStore.list()[0].symbol, "AAPL");
  assert.equal(paperStore.getBudget().initialBalance, 25000);

  // files really live in separate per-account dirs
  assert.ok(fs.existsSync(path.join(ROOT, "accounts", a.id, "trades.json")));
  assert.ok(fs.existsSync(path.join(ROOT, "accounts", b.id, "trades.json")));

  // with no active account the stores refuse to read (routes gate this)
  session.clear();
  assert.throws(() => tradeStore.list(), /no active account/);
});
