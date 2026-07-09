// Index Component Screener persistence (v1.3.0 §5): fetched-holdings cache
// and batch-screen result cache, both with a 24h TTL, in ics.json (same
// atomic-write pattern as the other stores). "Refresh" bypasses via the
// service; entries carry their own timestamps so staleness is surfaced,
// never hidden. Screen results are pruned to the newest MAX_SCREENS so the
// file cannot grow without bound (candidate payloads are chunky).
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = process.env.OD_DATA_DIR || path.join(__dirname, "..", "data");
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SCREENS = 12;

function createIcsStore({ dir = DEFAULT_DIR, ttlMs = TTL_MS, now = Date.now } = {}) {
  const file = path.join(dir, "ics.json");

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        holdings: parsed.holdings && typeof parsed.holdings === "object" ? parsed.holdings : {},
        screens: parsed.screens && typeof parsed.screens === "object" ? parsed.screens : {},
      };
    } catch (err) {
      if (err.code === "ENOENT") return { holdings: {}, screens: {} };
      throw new Error(`ICS store unreadable (${file}): ${err.message}`);
    }
  }

  function persist(state) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  }

  function fresh(entry) {
    return entry && typeof entry.at === "number" && now() - entry.at < ttlMs;
  }

  // ---- fetched-holdings cache (yfinance fallback results, incl. known-
  // unavailable ETFs so bond funds don't refetch on every open) ----
  function getHoldings(ticker) {
    const entry = load().holdings[String(ticker).toUpperCase()];
    return fresh(entry) ? entry.value : null;
  }

  function saveHoldings(ticker, value) {
    const state = load();
    state.holdings[String(ticker).toUpperCase()] = { at: now(), value };
    persist(state);
  }

  // ---- batch-screen result cache ----
  function getScreen(key) {
    const entry = load().screens[key];
    return fresh(entry) ? entry.value : null;
  }

  function saveScreen(key, value) {
    const state = load();
    state.screens[key] = { at: now(), value };
    const keys = Object.keys(state.screens)
      .sort((a, b) => state.screens[b].at - state.screens[a].at);
    for (const stale of keys.slice(MAX_SCREENS)) delete state.screens[stale];
    persist(state);
  }

  function clearScreens(etf) {
    const state = load();
    const prefix = `${String(etf).toUpperCase()}|`;
    for (const key of Object.keys(state.screens)) {
      if (key.startsWith(prefix)) delete state.screens[key];
    }
    persist(state);
  }

  return { getHoldings, saveHoldings, getScreen, saveScreen, clearScreens, file };
}

const icsStore = createIcsStore();

module.exports = { createIcsStore, icsStore, TTL_MS, MAX_SCREENS };
