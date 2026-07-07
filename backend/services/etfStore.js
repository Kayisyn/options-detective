// ETF screener persistence (v2.0 §2.2, adapted to JSON files): cached
// dynamic metrics per ticker + the user's watchlist. Same atomic-write
// pattern as the other stores. Metrics are the daily-refreshed §2.8 data;
// they carry their own asOf timestamp so the UI can flag staleness.
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = process.env.OD_DATA_DIR || path.join(__dirname, "..", "data");

function createEtfStore({ dir = DEFAULT_DIR } = {}) {
  const file = path.join(dir, "etf.json");

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        metrics: parsed.metrics && typeof parsed.metrics === "object" ? parsed.metrics : {},
        watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      };
    } catch (err) {
      if (err.code === "ENOENT") return { metrics: {}, watchlist: [] };
      throw new Error(`ETF store unreadable (${file}): ${err.message}`);
    }
  }

  function persist(state) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  }

  function getMetrics() {
    return load().metrics;
  }

  // Merge freshly fetched metrics; entries with an "error" are skipped so a
  // transient fetch failure never wipes previously-good data.
  function saveMetrics(fetched) {
    const state = load();
    for (const [ticker, metrics] of Object.entries(fetched)) {
      if (metrics && !metrics.error) state.metrics[ticker.toUpperCase()] = metrics;
    }
    persist(state);
    return state.metrics;
  }

  function getWatchlist() {
    return load().watchlist;
  }

  function setWatchlist(ticker, action) {
    const t = String(ticker || "").trim().toUpperCase();
    if (!t) throw new TypeError("ticker is required");
    const state = load();
    const set = new Set(state.watchlist);
    if (action === "remove") set.delete(t);
    else set.add(t); // default add
    state.watchlist = [...set];
    persist(state);
    return state.watchlist;
  }

  return { getMetrics, saveMetrics, getWatchlist, setWatchlist, file };
}

const etfStore = createEtfStore();

module.exports = { createEtfStore, etfStore };
