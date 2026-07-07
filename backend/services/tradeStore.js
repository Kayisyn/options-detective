// Saved-trades journal: JSON file store with atomic writes.
//
// Deliberately not SQLite: the backend runs under Electron's utilityProcess
// in the packaged app, whose Node version does not ship node:sqlite, and a
// native driver would drag rebuild toolchains into a v1.x feature. A trade
// journal is tens of entries — a JSON file with tmp+rename writes is honest
// and portable. OD_DATA_DIR overrides the location (Electron sets it to the
// user-data directory when packaged).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = process.env.OD_DATA_DIR || path.join(__dirname, "..", "data");

function createTradeStore({ dir = DEFAULT_DIR } = {}) {
  const file = path.join(dir, "trades.json");

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw new Error(`trade journal unreadable (${file}): ${err.message}`);
    }
  }

  function persist(trades) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(trades, null, 2));
    fs.renameSync(tmp, file); // atomic on the same volume
  }

  function list() {
    return load().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  function save({ candidate, exportText = null, note = "" } = {}) {
    if (!candidate || typeof candidate !== "object"
        || typeof candidate.strategyType !== "string"
        || !Array.isArray(candidate.legs) || candidate.legs.length === 0) {
      throw new TypeError("body must include a candidate with strategyType and legs");
    }
    const entry = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      note: String(note ?? ""),
      exportText: exportText === null || exportText === undefined ? null : String(exportText),
      candidate,
    };
    const trades = load();
    trades.push(entry);
    persist(trades);
    return entry;
  }

  function remove(id) {
    const trades = load();
    const next = trades.filter((t) => t.id !== id);
    if (next.length === trades.length) return false;
    persist(next);
    return true;
  }

  return { list, save, remove, file };
}

const tradeStore = createTradeStore();

module.exports = { createTradeStore, tradeStore };
