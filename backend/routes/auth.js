// v1.6.0 local-accounts auth API.
//   GET  /auth/state     -> { account|null, accounts:[...] } (resumes remember)
//   POST /auth/register  -> { account } (201); validates username + password
//   POST /auth/login     -> { account }; sets the active session, rememberMe
//   POST /auth/logout    -> { ok }; clears session + remember token
//
// No JWT/refresh: a desktop app has one active user, so the active account is
// held in-process (session.js). "Remember me" persists a hashed token in
// <root>/remember.json so the next launch auto-resumes without re-entering
// the password.
const { Router } = require("express");
const fs = require("fs");
const path = require("path");

const accounts = require("../services/accounts");
const session = require("../services/session");

const router = Router();
const REMEMBER_FILE = path.join(session.ROOT_DIR, "remember.json");

function readRemember() {
  try {
    return JSON.parse(fs.readFileSync(REMEMBER_FILE, "utf8"));
  } catch {
    return null;
  }
}
function writeRemember(data) {
  try {
    fs.mkdirSync(session.ROOT_DIR, { recursive: true });
    fs.writeFileSync(REMEMBER_FILE, JSON.stringify(data, null, 2));
  } catch {
    // best-effort: without a persisted token the user just logs in next time
  }
}
function clearRememberFile() {
  try {
    fs.rmSync(REMEMBER_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

function send(res, fn) {
  try {
    res.json(fn());
  } catch (err) {
    const status = err instanceof accounts.AuthError
      ? err.status
      : err instanceof TypeError ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
}

// One call on boot. If nothing is active, try to resume a remembered session.
router.get("/state", (_req, res) => send(res, () => {
  if (!session.getActive()) {
    const remembered = accounts.resolveRememberToken(readRemember() || {});
    if (remembered) session.setActive(remembered.id);
  }
  const activeId = session.getActive();
  const list = accounts.list();
  const account = activeId ? list.find((a) => a.id === activeId) ?? null : null;
  return { account, accounts: list };
}));

router.post("/register", (req, res) => send(res, () => {
  const account = accounts.register(req.body || {});
  res.status(201);
  return { account };
}));

router.post("/login", (req, res) => send(res, () => {
  const { username, password, rememberMe } = req.body || {};
  const account = accounts.authenticate({ username, password });
  session.setActive(account.id);
  if (rememberMe) {
    const token = accounts.issueRememberToken(account.id);
    writeRemember({ id: account.id, token });
  } else {
    accounts.clearRememberToken(account.id);
    clearRememberFile();
  }
  return { account };
}));

router.post("/logout", (_req, res) => send(res, () => {
  const id = session.getActive();
  if (id) accounts.clearRememberToken(id);
  clearRememberFile();
  session.clear();
  return { ok: true };
}));

// Middleware for per-account storage routes: 401 unless signed in.
function requireAccount(req, res, next) {
  if (!session.getActive()) return res.status(401).json({ error: "not signed in" });
  next();
}

module.exports = { router, requireAccount };
