// Market data layer: Python/yfinance adapter + 60s cache + liquidity gates.
//
// Constraints honored here (from the build brief):
// - every payload carries fetchedAt / dataAgeSeconds / stale — stale data is
//   flagged, never hidden
// - contracts failing volume/OI gates are REMOVED before anyone screens them;
//   contracts with a wide (or unknowable) spread are kept but flagged
//   `illiquid: true` and must never end up in a recommendation
const { spawn } = require("child_process");
const path = require("path");

const { MATH_DIR, pythonBin } = require("./python");

// Upstream/domain problem (unknown symbol, no options listed) — maps to 404.
class DataError extends Error {}

const LIQUIDITY_GATES = { minVolume: 50, minOpenInterest: 100, maxSpreadPct: 0.05 };
const CACHE_TTL_MS = 60_000;
const STALE_AFTER_S = 15 * 60; // intraday data older than this is flagged

const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9.^-]{0,9}$/;

function fetchViaPython(symbol, maxExpirations, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin(), [path.join(MATH_DIR, "market_data.py")], {
      cwd: MATH_DIR,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`market data fetch timed out after ${timeoutMs}ms (${symbol})`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`failed to start market data adapter: ${err.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`market data adapter exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(new Error(`market data adapter returned invalid JSON: ${stdout.slice(0, 200)}`));
        return;
      }
      if (!parsed.ok) {
        reject(new DataError(parsed.error));
        return;
      }
      resolve(parsed.result);
    });

    proc.stdin.write(JSON.stringify({ symbol, max_expirations: maxExpirations }));
    proc.stdin.end();
  });
}

function applyLiquidityGates(chains, gates = LIQUIDITY_GATES) {
  const out = {};
  const dropped = { noPrice: 0, volume: 0, openInterest: 0 };
  let total = 0;
  let kept = 0;
  for (const [exp, sides] of Object.entries(chains)) {
    out[exp] = { calls: [], puts: [] };
    for (const side of ["calls", "puts"]) {
      for (const contract of sides[side] || []) {
        total += 1;
        if (contract.mid === null || contract.mid <= 0) {
          dropped.noPrice += 1;
          continue;
        }
        if (contract.volume < gates.minVolume) {
          dropped.volume += 1;
          continue;
        }
        if (contract.openInterest < gates.minOpenInterest) {
          dropped.openInterest += 1;
          continue;
        }
        kept += 1;
        out[exp][side].push({
          ...contract,
          illiquid: contract.spreadPct === null || contract.spreadPct > gates.maxSpreadPct,
        });
      }
    }
  }
  return { chains: out, stats: { total, kept, dropped } };
}

function createDataLayer({ fetcher = fetchViaPython, now = Date.now, ttlMs = CACHE_TTL_MS } = {}) {
  const cache = new Map(); // SYMBOL -> { at, data }

  function decorate(data) {
    const ageSeconds = Math.max(0, Math.round((now() - Date.parse(data.fetchedAt)) / 1000));
    return { ...data, dataAgeSeconds: ageSeconds, stale: ageSeconds > STALE_AFTER_S };
  }

  async function getMarketData(symbol, { refresh = false, maxExpirations = 6 } = {}) {
    if (typeof symbol !== "string" || !SYMBOL_RE.test(symbol.trim())) {
      throw new DataError(`invalid symbol: ${JSON.stringify(symbol)}`);
    }
    const key = symbol.trim().toUpperCase();
    const hit = cache.get(key);
    if (hit && !refresh && now() - hit.at < ttlMs) {
      return decorate(hit.data);
    }
    const raw = await fetcher(key, maxExpirations);
    const gated = applyLiquidityGates(raw.chains);
    const data = {
      ...raw,
      chains: gated.chains,
      liquidity: { gates: LIQUIDITY_GATES, ...gated.stats },
    };
    cache.set(key, { at: now(), data });
    return decorate(data);
  }

  return { getMarketData, cache };
}

const dataLayer = createDataLayer();

module.exports = {
  createDataLayer,
  applyLiquidityGates,
  fetchViaPython,
  dataLayer,
  DataError,
  LIQUIDITY_GATES,
  CACHE_TTL_MS,
  STALE_AFTER_S,
};
