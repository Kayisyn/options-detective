// Index Component Screener (v1.3.0): resolve an ETF's holdings, run the
// EXISTING Detector across every holding with bounded concurrency, merge
// and re-rank by composite score, cache 24h.
//
// Design decisions (vs the roadmap, documented):
// - Holdings: curated static sets are primary (etfHoldings.js), yfinance
//   top-10 is the fallback — free data has no full constituent lists.
// - Sector / top-N-subset filters are applied CLIENT-side over the merged
//   candidate set (each candidate carries its holding's weight+sector+rank),
//   so filter changes are instant and never re-screen.
// - The <5s roadmap target holds for the compute stage (warm engine batches)
//   and for cache hits. The network stage — live yfinance chains per symbol —
//   is the real cost; it is mitigated with concurrency, fewer expirations
//   per symbol than a single-symbol screen, and the 24h result cache.
// - Illiquid contracts are already dropped by the Detector's liquidity
//   gates; holdings that fail entirely (no options, delisted, no data) are
//   reported in `skipped`, never fatal.
const { detector: defaultDetector } = require("./detector");
const { DataError } = require("./dataLayer");
const { curatedHoldingsFor } = require("./etfHoldings");
const { BY_TICKER } = require("./etfUniverse");
const { icsStore: defaultStore } = require("./icsStore");
const { mathCommand } = require("./python");
const { spawn } = require("child_process");

const MAX_SYMBOLS = 40;      // safety cap per batch
const PER_SYMBOL_TOP_N = 8;  // merged set stays 50-200+ without bloating
const MAX_MERGED = 300;
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 120_000;

const BATCH_DEFAULTS = {
  directionalView: "neutral",
  capital: 25_000,
  riskTolerancePct: 2,
  definedRiskOnly: false,
  minDTE: 5,
  maxDTE: 60,          // roadmap §3 example constraint
  maxExpirations: 3,   // fewer than single-symbol screens: speed over depth
};

function fetchHoldingsViaPython(ticker, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const cmd = mathCommand("etf_holdings");
    const proc = spawn(cmd.bin, cmd.args, { cwd: cmd.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`holdings fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on("data", (c) => { stdout += c; });
    proc.stderr.on("data", (c) => { stderr += c; });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`failed to start holdings fetcher: ${err.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`holdings fetcher exited ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(new Error(`holdings fetcher returned invalid JSON: ${stdout.slice(0, 200)}`));
        return;
      }
      if (!parsed.ok) reject(new Error(parsed.error));
      else resolve(parsed.result[String(ticker).toUpperCase()]);
    });
    proc.stdin.write(JSON.stringify({ tickers: [ticker] }));
    proc.stdin.end();
  });
}

// run tasks over items with a fixed-size worker pool; order preserved
async function mapPool(items, size, task) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await task(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

class HoldingsUnavailableError extends Error {}

function createIcsScreener({
  detector = defaultDetector,
  store = defaultStore,
  fetchHoldings = fetchHoldingsViaPython,
  now = Date.now,
} = {}) {
  // Curated set if we have one; otherwise the (cached) yfinance top-10.
  // Known-unavailable results are cached too, so bond funds fail fast.
  async function holdingsFor(ticker) {
    const t = String(ticker || "").trim().toUpperCase();
    if (!BY_TICKER.has(t)) throw new TypeError(`unknown ETF ticker: ${t || "(empty)"}`);

    const curated = curatedHoldingsFor(t);
    if (curated) return { etf: t, ...curated, totalHoldings: curated.holdings.length };

    const cached = store.getHoldings(t);
    if (cached) {
      if (cached.unavailable) throw new HoldingsUnavailableError(unavailableMsg(t));
      return cached;
    }

    let fetched;
    try {
      fetched = await fetchHoldings(t);
    } catch (err) {
      throw new Error(`holdings fetch failed for ${t}: ${err.message}`);
    }
    if (!fetched || fetched.error || !Array.isArray(fetched.holdings) || fetched.holdings.length === 0) {
      store.saveHoldings(t, { unavailable: true });
      throw new HoldingsUnavailableError(unavailableMsg(t));
    }
    const value = {
      etf: t,
      source: "yfinance-top10",
      asOf: fetched.asOf,
      holdings: fetched.holdings,
      totalHoldings: fetched.holdings.length,
    };
    store.saveHoldings(t, value);
    return value;
  }

  function unavailableMsg(t) {
    return `Holdings data is not available for ${t}. Try an equity index or sector ETF.`;
  }

  function cacheKeyOf(etf, opts) {
    return [
      etf,
      `v:${opts.directionalView}`,
      `c:${opts.capital}`,
      `r:${opts.riskTolerancePct}`,
      `d:${opts.definedRiskOnly ? 1 : 0}`,
      `dte:${opts.minDTE}-${opts.maxDTE}`,
    ].join("|");
  }

  async function batchScreen({ etf, refresh = false, constraints = {} } = {}) {
    const startedAt = now();
    const info = await holdingsFor(etf); // TypeError / unavailable propagate
    const opts = { ...BATCH_DEFAULTS, ...constraints };

    const key = cacheKeyOf(info.etf, opts);
    if (!refresh) {
      const hit = store.getScreen(key);
      if (hit) return { ...hit, cached: true };
    }

    const holdings = info.holdings.slice(0, MAX_SYMBOLS);
    const skipped = [];
    const perHolding = await mapPool(holdings, CONCURRENCY, async (h) => {
      try {
        const res = await detector.screen({
          symbol: h.symbol,
          directionalView: opts.directionalView,
          capital: opts.capital,
          riskTolerancePct: opts.riskTolerancePct,
          definedRiskOnly: opts.definedRiskOnly,
          minDTE: opts.minDTE,
          maxDTE: opts.maxDTE,
          maxExpirations: opts.maxExpirations,
          topN: PER_SYMBOL_TOP_N,
        });
        return { holding: h, candidates: res.candidates };
      } catch (err) {
        // roadmap §6: missing data / delisted / no options — skip, never fail
        skipped.push({
          symbol: h.symbol,
          reason: err instanceof DataError ? err.message : `screen failed: ${err.message}`,
        });
        return { holding: h, candidates: [] };
      }
    });

    const candidates = [];
    for (const { holding, candidates: list } of perHolding) {
      for (const c of list) {
        // payoff curves are recomputed by the Calculator on open; dropping
        // them keeps a 200-candidate payload sane
        candidates.push({
          ...c,
          payoff: { ...c.payoff, profitAtExpiry: [] },
          holding: {
            symbol: holding.symbol,
            weight: holding.weight,
            sector: holding.sector,
            rank: holding.rank,
          },
        });
      }
    }
    candidates.sort((a, b) => b.compositeScore - a.compositeScore);

    const result = {
      etf: info.etf,
      source: info.source,
      asOf: info.asOf,
      totalHoldings: info.totalHoldings,
      holdings,
      screenedSymbols: holdings.length - skipped.length,
      skipped,
      candidates: candidates.slice(0, MAX_MERGED),
      totalCandidates: Math.min(candidates.length, MAX_MERGED),
      constraints: opts,
      screeningTimeMs: now() - startedAt,
      screenedAt: new Date(now()).toISOString(),
      cached: false,
    };
    store.saveScreen(key, result);
    return result;
  }

  return { holdingsFor, batchScreen };
}

const icsScreener = createIcsScreener();

module.exports = {
  createIcsScreener, icsScreener, HoldingsUnavailableError,
  fetchHoldingsViaPython, BATCH_DEFAULTS, MAX_SYMBOLS, PER_SYMBOL_TOP_N,
};
