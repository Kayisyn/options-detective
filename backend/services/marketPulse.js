// Market pulse for the sidebars (v1.5.0 Part 3): breadth score, trending
// symbols, watchlist quotes and headlines from ONE batched Python fetch,
// cached 60s. The breadth basket is the curated S&P 500 top-holdings set
// (etfHoldings SP500) — a documented proxy, not full-index breadth: it
// covers ~45% of index weight and is one HTTP round-trip on free data.
const { spawn } = require("child_process");

const { mathCommand } = require("./python");
const { HOLDING_SETS } = require("./etfHoldings");

const CACHE_TTL_MS = 60_000;
const PULSE_TIMEOUT_MS = 60_000;
const NEWS_SYMBOL = "SPY"; // market-level headlines ride the index proxy
const TRENDING_N = 5;
const MAX_WATCH = 20;

const BREADTH_BASKET = HOLDING_SETS.SP500.map(([symbol]) => symbol);

function fetchPulseViaPython(symbols, { timeoutMs = PULSE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const cmd = mathCommand("market_pulse");
    const proc = spawn(cmd.bin, cmd.args, { cwd: cmd.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`market pulse fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`failed to start market pulse adapter: ${err.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`market pulse adapter exited ${code}: ${stderr.slice(0, 400)}`));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(new Error(`market pulse adapter returned invalid JSON: ${stdout.slice(0, 200)}`));
        return;
      }
      if (!parsed.ok) {
        reject(new Error(parsed.error));
        return;
      }
      resolve(parsed.result);
    });
    proc.stdin.write(JSON.stringify({
      symbols,
      news_symbol: NEWS_SYMBOL,
      news_count: 5,
    }));
    proc.stdin.end();
  });
}

// advancers / (advancers + decliners) over the basket, 0-100. Unchanged
// symbols count as half so a flat holiday tape reads 50, not 0 or 100.
function breadthScore(quotes, basket) {
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const sym of basket) {
    const q = quotes[sym];
    if (!q) continue;
    if (q.changePct > 0.05) up += 1;
    else if (q.changePct < -0.05) down += 1;
    else flat += 1;
  }
  const counted = up + down + flat;
  if (counted === 0) return null;
  return {
    score: Math.round(((up + flat / 2) / counted) * 100),
    advancers: up,
    decliners: down,
    unchanged: flat,
    counted,
  };
}

function trending(quotes, basket) {
  const rows = basket
    .filter((sym) => quotes[sym])
    .map((sym) => ({ symbol: sym, ...quotes[sym] }));
  rows.sort((a, b) => b.changePct - a.changePct);
  return {
    gainers: rows.slice(0, TRENDING_N),
    losers: rows.slice(-TRENDING_N).reverse(),
  };
}

function createMarketPulse({ fetcher = fetchPulseViaPython, now = Date.now,
                             ttlMs = CACHE_TTL_MS, basket = BREADTH_BASKET } = {}) {
  let cache = null; // { at, key, data }
  let inFlight = null;

  async function pulse({ watch = [] } = {}) {
    const watchSyms = [...new Set(
      watch.map((s) => String(s).trim().toUpperCase()).filter(Boolean),
    )].slice(0, MAX_WATCH);
    const key = watchSyms.join(",");

    if (cache && cache.key === key && now() - cache.at < ttlMs) {
      return cache.data;
    }
    if (inFlight && inFlight.key === key) return inFlight.promise;

    const promise = (async () => {
      const symbols = [...new Set([...basket, ...watchSyms])];
      const raw = await fetcher(symbols);
      const quotes = raw.quotes || {};
      const data = {
        breadth: breadthScore(quotes, basket),
        trending: trending(quotes, basket),
        watch: Object.fromEntries(
          watchSyms.filter((s) => quotes[s]).map((s) => [s, quotes[s]]),
        ),
        news: raw.news || [],
        errors: raw.errors || {},
        asOf: raw.asOf || new Date(now()).toISOString(),
      };
      cache = { at: now(), key, data };
      return data;
    })();
    inFlight = { key, promise };
    try {
      return await promise;
    } finally {
      inFlight = null;
    }
  }

  return { pulse, get cache() { return cache; } };
}

const marketPulse = createMarketPulse();

module.exports = {
  createMarketPulse,
  fetchPulseViaPython, // reused by services/fx.js for the CAD=X quote
  breadthScore,
  trending,
  BREADTH_BASKET,
  marketPulse,
  CACHE_TTL_MS,
};
