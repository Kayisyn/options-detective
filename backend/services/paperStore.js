// Paper-trading budget + equity snapshots (v2.0 §1). Same JSON-file
// pattern as the trade journal. The budget holds only the configuration;
// balances are always DERIVED from the paper trades themselves, so the
// numbers cannot drift out of sync with the journal.
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = process.env.OD_DATA_DIR || path.join(__dirname, "..", "data");
const DEFAULT_BALANCE = 50_000;
const MAX_SNAPSHOTS = 5_000;
// v1.3.2: the frontend polls marks every minute — identical back-to-back
// snapshots inside this window are skipped so a closed market doesn't
// paint 1,440 flat points a day. Any value CHANGE always records.
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

function round2(x) {
  return Math.round(x * 100) / 100;
}

function createPaperStore({ dir = DEFAULT_DIR, now = () => new Date() } = {}) {
  const file = path.join(dir, "paper.json");

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        budget: parsed.budget ?? null,
        snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      };
    } catch (err) {
      if (err.code === "ENOENT") return { budget: null, snapshots: [] };
      throw new Error(`paper store unreadable (${file}): ${err.message}`);
    }
  }

  function persist(state) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  }

  function getBudget() {
    return load().budget;
  }

  // Creates the account, or re-arms it on reset. Snapshots are cleared so
  // the equity curve restarts from the new baseline.
  function setBudget(initialBalance) {
    const n = Number(initialBalance);
    if (!Number.isFinite(n) || n <= 0) {
      throw new TypeError("initialBalance must be a positive number");
    }
    const state = load();
    const nowIso = now().toISOString();
    state.budget = {
      initialBalance: round2(n),
      createdAt: state.budget?.createdAt ?? nowIso,
      resetAt: state.budget ? nowIso : null,
    };
    state.snapshots = [];
    persist(state);
    return state.budget;
  }

  function addSnapshot(snapshot) {
    const state = load();
    const last = state.snapshots[state.snapshots.length - 1];
    const nowDate = now();
    if (last
        && last.accountValue === snapshot.accountValue
        && last.realizedPnl === snapshot.realizedPnl
        && last.unrealizedPnl === snapshot.unrealizedPnl
        && last.openCount === snapshot.openCount
        && nowDate.getTime() - Date.parse(last.at) < DEDUPE_WINDOW_MS) {
      return false; // nothing moved — don't spam the curve
    }
    state.snapshots.push({ at: nowDate.toISOString(), ...snapshot });
    if (state.snapshots.length > MAX_SNAPSHOTS) {
      state.snapshots = state.snapshots.slice(-MAX_SNAPSHOTS);
    }
    persist(state);
    return true;
  }

  function listSnapshots(sinceMs = 0) {
    return load().snapshots.filter((s) => Date.parse(s.at) >= sinceMs);
  }

  return { getBudget, setBudget, addSnapshot, listSnapshots, file, DEFAULT_BALANCE };
}

const paperStore = createPaperStore();

module.exports = { createPaperStore, paperStore, DEFAULT_BALANCE };
