// v1.7.0 USD→CAD exchange rate service.
//
// Rate comes from Yahoo's CAD=X ticker through the same market_pulse fetch
// the sidebars use — no external API key (the spec's fixer.io needs one).
// Daily cadence: the cached rate is fresh for 24h; a fetch failure falls
// back to the last good persisted rate (survives restarts via fx.json at
// the data root — shared, not per-account), and only if we have NEVER
// fetched successfully does the documented static fallback apply.
//
// getRateSync() lets the trade store stamp exchangeRateUsed synchronously
// at trade creation; it never triggers a fetch.
const fs = require("fs");
const path = require("path");

const { ROOT_DIR } = require("./session");
const { fetchPulseViaPython } = require("./marketPulse");

const TTL_MS = 24 * 60 * 60 * 1000; // daily refresh cadence per spec
const FX_SYMBOL = "CAD=X";          // Yahoo: USD/CAD
// static last-resort fallback (documented; only used before the first
// successful fetch ever)
const STATIC_FALLBACK_RATE = 1.40;

function createFx({ fetcher = fetchPulseViaPython, now = Date.now,
                    file = path.join(ROOT_DIR, "fx.json") } = {}) {
  let cache = null; // { rate, asOf }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Number.isFinite(parsed.rate) && parsed.rate > 0) {
      cache = { rate: parsed.rate, asOf: parsed.asOf ?? null };
    }
  } catch { /* first run */ }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(cache, null, 2));
    } catch { /* best-effort */ }
  }

  function isFresh() {
    return cache?.asOf != null && now() - Date.parse(cache.asOf) < TTL_MS;
  }

  function getRateSync() {
    return cache?.rate ?? null;
  }

  // { rate, asOf, stale } — stale marks a rate that is not from a fresh
  // fetch (old cache after a failed refresh, or the static fallback).
  async function current({ refresh = false } = {}) {
    if (isFresh() && !refresh) return { ...cache, stale: false };
    try {
      const raw = await fetcher([FX_SYMBOL]);
      const q = raw?.quotes?.[FX_SYMBOL];
      if (q && Number.isFinite(q.price) && q.price > 0) {
        cache = { rate: q.price, asOf: new Date(now()).toISOString() };
        persist();
        return { ...cache, stale: false };
      }
    } catch { /* fall through to cache/static */ }
    if (cache) return { ...cache, stale: true };
    return { rate: STATIC_FALLBACK_RATE, asOf: null, stale: true };
  }

  return { current, getRateSync, isFresh, file };
}

const fx = createFx();

module.exports = { createFx, fx, TTL_MS, STATIC_FALLBACK_RATE, FX_SYMBOL };
