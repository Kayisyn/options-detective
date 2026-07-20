// v1.6.0 local accounts — active-account session for this backend process.
//
// Option Obelisk is a single-user desktop app: the Express "server" is an
// Electron utilityProcess child on localhost with one window driving it, so a
// single in-memory active account is the correct model (no JWT/session store
// needed — there is no network boundary or concurrent users). Per-account
// data lives under <root>/accounts/<id>/, isolated the same way OD_DATA_DIR
// already isolated the whole app. The registry (accounts.json) and the
// shared caches (ics.json, metrics) stay at the root.
const path = require("path");

const ROOT_DIR = process.env.OD_DATA_DIR || path.join(__dirname, "..", "data");
const ACCOUNTS_DIR = path.join(ROOT_DIR, "accounts");

let activeAccountId = null;

function setActive(id) {
  activeAccountId = id ? String(id) : null;
}

function clear() {
  activeAccountId = null;
}

function getActive() {
  return activeAccountId;
}

function accountDir(id) {
  return path.join(ACCOUNTS_DIR, String(id));
}

// The per-account data directory the storage stores read/write. Throws if no
// account is active — storage routes are gated by requireAccount, so this
// only fires on a programming error, never in normal flow.
function activeDataDir() {
  if (!activeAccountId) throw new Error("no active account");
  return accountDir(activeAccountId);
}

module.exports = {
  ROOT_DIR, ACCOUNTS_DIR,
  setActive, clear, getActive, accountDir, activeDataDir,
};
