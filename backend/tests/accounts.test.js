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

test("first account adopts legacy root data by COPY (originals kept)", () => {
  // stage legacy single-user files at the root (pre-v1.6.0 layout)
  const legacyTrades = [{ id: "t1", createdAt: "2026-01-01T00:00:00.000Z", status: "open",
    symbol: "GOOG", strategy: "covered_call", side: "credit", entryPrice: 4, entryQty: 1,
    multiplier: 100, entryDate: "2026-01-01", notes: "", tags: [], exitPrice: null,
    exitDate: null, closedAt: null, actualPnl: null, mae: null, mfe: null,
    lastMark: null, candidate: null, exportText: null }];
  fs.writeFileSync(path.join(ROOT, "trades.json"), JSON.stringify(legacyTrades));
  fs.writeFileSync(path.join(ROOT, "paper.json"), JSON.stringify({ budget: { initialBalance: 12345 } }));

  // NOTE: earlier tests in this file already registered accounts, so wipe the
  // registry to simulate a true first run
  fs.rmSync(accounts.REGISTRY, { force: true });
  const first = accounts.register({ username: "legacyuser", password: "Migrate123" });

  // copied into the account dir…
  const copied = JSON.parse(fs.readFileSync(
    path.join(ROOT, "accounts", first.id, "trades.json"), "utf8"));
  assert.equal(copied[0].symbol, "GOOG");
  assert.ok(fs.existsSync(path.join(ROOT, "accounts", first.id, "paper.json")));
  // …and the originals survive at the root as a backup
  assert.ok(fs.existsSync(path.join(ROOT, "trades.json")));

  // a SECOND account starts empty — no legacy adoption
  const second = accounts.register({ username: "cleanuser", password: "Fresh1234" });
  assert.equal(fs.existsSync(path.join(ROOT, "accounts", second.id, "trades.json")), false);
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

// v1.7.2 account settings ---------------------------------------------------

test("changePassword verifies the current password and applies strength rules", () => {
  const acct = accounts.register({ username: "rekey", password: "OldPass99" });
  // wrong current password: rejected, old password still works
  assert.throws(() => accounts.changePassword(acct.id, "WrongOld1", "NewPass11"),
    /Current password is incorrect/);
  assert.ok(accounts.authenticate({ username: "rekey", password: "OldPass99" }));
  // weak new password: rejected by the same rules as register
  assert.throws(() => accounts.changePassword(acct.id, "OldPass99", "weak"), /at least 8/);
  // success: new password signs in, old one doesn't, remember token is dead
  const token = accounts.issueRememberToken(acct.id);
  accounts.changePassword(acct.id, "OldPass99", "NewPass11");
  assert.ok(accounts.authenticate({ username: "rekey", password: "NewPass11" }));
  assert.throws(() => accounts.authenticate({ username: "rekey", password: "OldPass99" }),
    /Incorrect username or password/);
  assert.equal(accounts.resolveRememberToken({ id: acct.id, token }), null);
});

test("deleteAccount is password-gated, removes the registry entry and the data dir", () => {
  const acct = accounts.register({ username: "goner", password: "DeleteMe1" });
  session.setActive(acct.id);
  tradeStore.create({ symbol: "SPY", strategy: "covered_call", entryPrice: 2, entryQty: 1 });
  const dir = path.join(ROOT, "accounts", acct.id);
  assert.ok(fs.existsSync(dir));

  assert.throws(() => accounts.deleteAccount(acct.id, "WrongPass1"), /Password is incorrect/);
  assert.ok(accounts.list().some((a) => a.username === "goner"));

  accounts.deleteAccount(acct.id, "DeleteMe1");
  assert.equal(accounts.list().some((a) => a.username === "goner"), false);
  assert.equal(fs.existsSync(dir), false);
  assert.throws(() => accounts.authenticate({ username: "goner", password: "DeleteMe1" }),
    /Incorrect username or password/);
  session.clear();
});
