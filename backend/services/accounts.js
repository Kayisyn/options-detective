// v1.6.0 local accounts registry.
//
// Passwords are hashed with Node's built-in crypto.scrypt (a strong, salted
// KDF) rather than bcrypt — this keeps the packaged app dependency-free and
// avoids a native module rebuild against Electron's ABI. scrypt at these
// parameters is comparable in cost/strength to bcrypt(12).
//
// IMPORTANT (honest scope): local accounts gate the app UI and keep each
// profile's data separate on a shared machine. They do NOT encrypt data at
// rest — anyone with filesystem access to <root>/accounts/<id>/ can read that
// account's JSON directly. That is the same exposure the app has always had.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { ROOT_DIR, accountDir } = require("./session");

const REGISTRY = path.join(ROOT_DIR, "accounts.json");
const USERNAME_RE = /^[A-Za-z0-9]{3,20}$/;
const LEGACY_FILES = ["trades.json", "paper.json", "etf.json"];

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

// ---- password + token hashing -------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  let test;
  try {
    test = crypto.scryptSync(String(password ?? ""), salt, 64).toString("hex");
  } catch {
    return false;
  }
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Remember tokens are 32 random bytes (high entropy), so a fast SHA-256 is
// sufficient — no need for a slow KDF on every app boot.
function newToken() {
  return crypto.randomBytes(32).toString("hex");
}
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
function tokenMatches(token, storedHash) {
  if (!storedHash) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(String(storedHash), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- registry persistence -----------------------------------------------

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
    return { accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [] };
  } catch (err) {
    if (err.code === "ENOENT") return { accounts: [] };
    throw new Error(`accounts registry unreadable (${REGISTRY}): ${err.message}`);
  }
}

function persist(state) {
  fs.mkdirSync(ROOT_DIR, { recursive: true });
  const tmp = `${REGISTRY}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, REGISTRY);
}

function publicView(a) {
  return {
    id: a.id,
    username: a.username,
    createdAt: a.createdAt,
    lastLoginAt: a.lastLoginAt ?? null,
  };
}

// ---- validation ----------------------------------------------------------

function validateUsername(username) {
  const name = String(username ?? "").trim();
  if (!USERNAME_RE.test(name)) {
    throw new AuthError("Username must be 3–20 letters or numbers");
  }
  return name;
}

function validatePassword(password) {
  const pw = String(password ?? "");
  if (pw.length < 8) throw new AuthError("Password must be at least 8 characters");
  if (!/[a-z]/.test(pw)) throw new AuthError("Password needs a lowercase letter");
  if (!/[A-Z]/.test(pw)) throw new AuthError("Password needs an uppercase letter");
  if (!/[0-9]/.test(pw)) throw new AuthError("Password needs a number");
}

// ---- first-run migration -------------------------------------------------

// The very first account created adopts the pre-accounts single-user data:
// COPY (never move) the legacy root-level JSON into the account's dir so the
// originals survive untouched as a backup. Best-effort — a copy failure must
// not block account creation.
function maybeMigrateLegacy(id, accountCount) {
  if (accountCount !== 1) return;
  const dir = accountDir(id);
  for (const name of LEGACY_FILES) {
    const src = path.join(ROOT_DIR, name);
    const dst = path.join(dir, name);
    try {
      if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
    } catch {
      // leave the legacy file in place; the account simply starts empty
    }
  }
}

// ---- public API ----------------------------------------------------------

function list() {
  return load().accounts.map(publicView);
}

function count() {
  return load().accounts.length;
}

function findByUsername(state, username) {
  const lower = String(username ?? "").trim().toLowerCase();
  return state.accounts.find((a) => a.username.toLowerCase() === lower);
}

function register({ username, password } = {}) {
  const name = validateUsername(username);
  validatePassword(password);
  const state = load();
  if (findByUsername(state, name)) throw new AuthError("That username is taken", 409);

  const account = {
    id: crypto.randomUUID(),
    username: name,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    rememberHash: null,
  };
  state.accounts.push(account);
  persist(state);
  fs.mkdirSync(accountDir(account.id), { recursive: true });
  maybeMigrateLegacy(account.id, state.accounts.length);
  return publicView(account);
}

// Verify credentials and stamp lastLoginAt. Returns the public account view.
// Throws AuthError(401) for both unknown user and wrong password (no
// enumeration signal).
function authenticate({ username, password } = {}) {
  const state = load();
  const account = findByUsername(state, username);
  const ok = account && verifyPassword(password, account.passwordHash);
  if (!account || !ok) throw new AuthError("Incorrect username or password", 401);
  account.lastLoginAt = new Date().toISOString();
  persist(state);
  return publicView(account);
}

// Issue a remember token for an account: store its hash, return the plaintext
// (the caller writes it to the remember file the app reads on boot).
function issueRememberToken(id) {
  const state = load();
  const account = state.accounts.find((a) => a.id === id);
  if (!account) throw new AuthError("no such account", 404);
  const token = newToken();
  account.rememberHash = hashToken(token);
  persist(state);
  return token;
}

// Resolve a remember token to an account (used on boot). Returns the public
// view or null if it doesn't match.
function resolveRememberToken({ id, token } = {}) {
  if (!id || !token) return null;
  const state = load();
  const account = state.accounts.find((a) => a.id === id);
  if (!account || !tokenMatches(token, account.rememberHash)) return null;
  account.lastLoginAt = new Date().toISOString();
  persist(state);
  return publicView(account);
}

function clearRememberToken(id) {
  const state = load();
  const account = state.accounts.find((a) => a.id === id);
  if (account) {
    account.rememberHash = null;
    persist(state);
  }
}

module.exports = {
  AuthError,
  list, count, register, authenticate,
  issueRememberToken, resolveRememberToken, clearRememberToken,
  // exposed for tests
  hashPassword, verifyPassword, validatePassword, validateUsername,
  REGISTRY,
};
