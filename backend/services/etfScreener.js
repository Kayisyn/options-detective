// ETF screener orchestration (v2.0 §2). Merges the static universe with
// cached dynamic metrics, spawns the Python metric fetcher on refresh, and
// runs the pure screen()/scoring. Freshness is surfaced, never hidden.
const { spawn } = require("child_process");

const { mathCommand } = require("./python");
const { ETF_UNIVERSE, BY_TICKER, TICKERS, SECTORS, ASSET_CLASSES } = require("./etfUniverse");
const { PRESETS, screen: screenPure, scoreFor } = require("./etfScreening");
const { etfStore: defaultStore } = require("./etfStore");

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // §2.8 daily refresh cadence
const REFRESH_TIMEOUT_MS = 180_000;

function mergeOne(staticEtf, metrics, nowMs) {
  const m = metrics && !metrics.error ? metrics : null;
  const ageMs = m?.asOf ? nowMs - Date.parse(m.asOf) : null;
  return {
    ...staticEtf,
    expenseRatioPct: Math.round(staticEtf.expenseRatio * 10_000) / 100,
    price: m?.price ?? null,
    ytdReturn: m?.ytdReturn ?? null,
    atmIv: m?.atmIv ?? null,
    ivRank: m?.ivRank ?? null,
    annualizedCallPremiumPct: m?.annualizedCallPremiumPct ?? null,
    otmCallStrike: m?.otmCallStrike ?? null,
    callVolume: m?.callVolume ?? null,
    dte: m?.dte ?? null,
    // v1.7.0 metrics
    perf52wPct: m?.perf52wPct ?? null,
    dividendYieldPct: m?.dividendYieldPct ?? null,
    atrPct20: m?.atrPct20 ?? null,
    asOf: m?.asOf ?? null,
    hasMetrics: m != null,
    stale: ageMs == null ? true : ageMs > STALE_AFTER_MS,
  };
}

// v1.7.0 theta rank: percentile of annualized call premium across the
// universe's ETFs that have the metric — a documented proxy for "how much
// time decay favors sellers here" (richer premium = more decay to harvest).
// 0-100, higher = better for sellers. Computed over the merged universe so
// it always reflects the same refresh generation as the premium itself.
function attachThetaRank(list) {
  const values = list
    .map((e) => e.annualizedCallPremiumPct)
    .filter((v) => v != null)
    .sort((a, b) => a - b);
  if (values.length < 2) {
    return list.map((e) => ({ ...e, thetaRank: null }));
  }
  return list.map((e) => {
    const v = e.annualizedCallPremiumPct;
    if (v == null) return { ...e, thetaRank: null };
    const below = values.filter((x) => x < v).length;
    return { ...e, thetaRank: Math.round((below / (values.length - 1)) * 100) };
  });
}

function fetchMetricsViaPython(tickers, { timeoutMs = REFRESH_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const cmd = mathCommand("etf_metrics");
    const proc = spawn(cmd.bin, cmd.args, { cwd: cmd.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`ETF metrics fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on("data", (c) => { stdout += c; });
    proc.stderr.on("data", (c) => { stderr += c; });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`failed to start ETF metrics fetcher: ${err.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ETF metrics fetcher exited ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(new Error(`ETF metrics fetcher returned invalid JSON: ${stdout.slice(0, 200)}`));
        return;
      }
      if (!parsed.ok) reject(new Error(parsed.error));
      else resolve(parsed.result);
    });
    proc.stdin.write(JSON.stringify({ tickers, target_dte: 30 }));
    proc.stdin.end();
  });
}

function createScreener({ store = defaultStore, fetchMetrics = fetchMetricsViaPython, now = Date.now } = {}) {
  function universe() {
    const metrics = store.getMetrics();
    const nowMs = now();
    return attachThetaRank(ETF_UNIVERSE.map((e) => mergeOne(e, metrics[e.ticker], nowMs)));
  }

  function reference() {
    return {
      sectors: SECTORS,
      assetClasses: ASSET_CLASSES,
      count: TICKERS.length,
      presets: PRESETS,
    };
  }

  async function refresh(tickers) {
    const list = Array.isArray(tickers) && tickers.length
      ? tickers.map((t) => String(t).toUpperCase()).filter((t) => BY_TICKER.has(t))
      : TICKERS;
    if (list.length === 0) return { refreshed: 0, universe: universe() };
    const fetched = await fetchMetrics(list);
    store.saveMetrics(fetched);
    const errors = Object.entries(fetched)
      .filter(([, m]) => m && m.error)
      .map(([t, m]) => `${t}: ${m.error}`);
    const refreshed = Object.values(fetched).filter((m) => m && !m.error).length;
    return { refreshed, errors, universe: universe() };
  }

  function screen({ filters, strategy, limit } = {}) {
    const result = screenPure(universe(), { filters, strategy, limit });
    const anyMetrics = universe().some((e) => e.hasMetrics);
    return { ...result, anyMetrics };
  }

  function getEtf(ticker) {
    const t = String(ticker || "").toUpperCase();
    const staticEtf = BY_TICKER.get(t);
    if (!staticEtf) return null;
    const merged = mergeOne(staticEtf, store.getMetrics()[t], now());
    // attach score breakdowns for all three strategies (detail view §2.6B)
    return {
      ...merged,
      scores: {
        covered_call: scoreFor(merged, "covered_call"),
        csp: scoreFor(merged, "csp"),
        spread: scoreFor(merged, "spread"),
      },
    };
  }

  function watchlist() {
    const tickers = store.getWatchlist();
    const metrics = store.getMetrics();
    const nowMs = now();
    return tickers
      .filter((t) => BY_TICKER.has(t))
      .map((t) => mergeOne(BY_TICKER.get(t), metrics[t], nowMs));
  }

  function toggleWatchlist(ticker, action) {
    if (!BY_TICKER.has(String(ticker || "").toUpperCase())) {
      throw new TypeError(`unknown ETF ticker: ${ticker}`);
    }
    return store.setWatchlist(ticker, action);
  }

  return { universe, reference, refresh, screen, getEtf, watchlist, toggleWatchlist };
}

const screener = createScreener();

module.exports = { createScreener, screener, fetchMetricsViaPython, STALE_AFTER_MS };
