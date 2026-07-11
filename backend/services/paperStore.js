// Paper-trading budget + equity snapshots (v2.0 §1). Same JSON-file
// pattern as the trade journal. The budget holds only the configuration;
// balances are always DERIVED from the paper trades themselves, so the
// numbers cannot drift out of sync with the journal.
//
// v1.5.0 adds: settings (commission/auto-assign/theta/risk), a fees ledger,
// a share-sale realized ledger, and share HOLDINGS created by assignment
// (CSP assignment converts reserved cash into shares at the strike; selling
// or a covered-call assignment releases them). Holdings carry a lastPrice
// updated during process passes so the sync balance() can value them.
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = process.env.OD_DATA_DIR || path.join(__dirname, "..", "data");
const DEFAULT_BALANCE = 50_000;
const MAX_SNAPSHOTS = 5_000;

const THETA_MODES = new Set(["normal", "fast", "slow"]);
// Commission default rides a Questrade-style flat rate but ships DISABLED —
// existing sandbox accounts must not start bleeding fees silently.
const DEFAULT_SETTINGS = {
  commissionEnabled: false,
  commissionPerTrade: 4.95,
  autoAssign: true,
  thetaMode: "normal", // normal 1x | fast 2x | slow 0.5x decay in marks
  maxRiskPct: 5,       // informational only
};
// v1.3.2: the frontend polls marks every minute — identical back-to-back
// snapshots inside this window are skipped so a closed market doesn't
// paint 1,440 flat points a day. Any value CHANGE always records.
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

function round2(x) {
  return Math.round(x * 100) / 100;
}

function createPaperStore({ dir = DEFAULT_DIR, now = () => new Date() } = {}) {
  const file = path.join(dir, "paper.json");

  const EMPTY = () => ({
    budget: null,
    snapshots: [],
    settings: { ...DEFAULT_SETTINGS },
    feesPaid: 0,
    shareRealized: 0,
    holdings: {}, // SYMBOL -> { shares, costBasis, lastPrice, acquiredAt, from }
  });

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        budget: parsed.budget ?? null,
        snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        feesPaid: Number.isFinite(parsed.feesPaid) ? parsed.feesPaid : 0,
        shareRealized: Number.isFinite(parsed.shareRealized) ? parsed.shareRealized : 0,
        holdings: parsed.holdings && typeof parsed.holdings === "object"
          ? parsed.holdings : {},
      };
    } catch (err) {
      if (err.code === "ENOENT") return EMPTY();
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
    // fresh account: ledgers and holdings restart; SETTINGS survive resets
    state.feesPaid = 0;
    state.shareRealized = 0;
    state.holdings = {};
    persist(state);
    return state.budget;
  }

  // ---- v1.5.0 settings + ledgers + holdings -------------------------------

  function getSettings() {
    return load().settings;
  }

  function setSettings(patch = {}) {
    const state = load();
    const next = { ...state.settings };
    if (patch.commissionEnabled !== undefined) {
      next.commissionEnabled = Boolean(patch.commissionEnabled);
    }
    if (patch.commissionPerTrade !== undefined) {
      const fee = Number(patch.commissionPerTrade);
      if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
        throw new TypeError("commissionPerTrade must be between 0 and 100");
      }
      next.commissionPerTrade = round2(fee);
    }
    if (patch.autoAssign !== undefined) next.autoAssign = Boolean(patch.autoAssign);
    if (patch.thetaMode !== undefined) {
      if (!THETA_MODES.has(patch.thetaMode)) {
        throw new TypeError('thetaMode must be "normal", "fast" or "slow"');
      }
      next.thetaMode = patch.thetaMode;
    }
    if (patch.maxRiskPct !== undefined) {
      const pctv = Number(patch.maxRiskPct);
      if (!Number.isFinite(pctv) || pctv <= 0 || pctv > 100) {
        throw new TypeError("maxRiskPct must be between 0 and 100");
      }
      next.maxRiskPct = round2(pctv);
    }
    state.settings = next;
    persist(state);
    return next;
  }

  function getLedgers() {
    const state = load();
    return { feesPaid: state.feesPaid, shareRealized: state.shareRealized };
  }

  function addFee(amount) {
    const fee = Number(amount);
    if (!Number.isFinite(fee) || fee < 0) throw new TypeError("fee must be >= 0");
    const state = load();
    state.feesPaid = round2(state.feesPaid + fee);
    persist(state);
    return state.feesPaid;
  }

  function addShareRealized(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) throw new TypeError("amount must be a number");
    const state = load();
    state.shareRealized = round2(state.shareRealized + n);
    persist(state);
    return state.shareRealized;
  }

  function listHoldings() {
    const holdings = load().holdings;
    return Object.entries(holdings).map(([symbol, h]) => ({ symbol, ...h }));
  }

  function getHolding(symbol) {
    const h = load().holdings[symbol.toUpperCase()];
    return h ? { symbol: symbol.toUpperCase(), ...h } : null;
  }

  // Assignment adds to (or opens) a position; average cost on additions.
  function addHolding(symbol, { shares, costBasis, lastPrice = null, from = "assignment" }) {
    const sym = symbol.toUpperCase();
    if (!Number.isFinite(shares) || shares <= 0) throw new TypeError("shares must be > 0");
    if (!Number.isFinite(costBasis) || costBasis <= 0) throw new TypeError("costBasis must be > 0");
    const state = load();
    const prev = state.holdings[sym];
    if (prev) {
      const totalShares = prev.shares + shares;
      state.holdings[sym] = {
        shares: totalShares,
        costBasis: round2((prev.shares * prev.costBasis + shares * costBasis) / totalShares),
        lastPrice: lastPrice ?? prev.lastPrice,
        acquiredAt: prev.acquiredAt,
        from,
      };
    } else {
      state.holdings[sym] = {
        shares, costBasis: round2(costBasis), lastPrice,
        acquiredAt: now().toISOString(), from,
      };
    }
    persist(state);
    return { symbol: sym, ...state.holdings[sym] };
  }

  function removeHolding(symbol, shares) {
    const sym = symbol.toUpperCase();
    const state = load();
    const prev = state.holdings[sym];
    if (!prev) throw new TypeError(`no ${sym} shares held`);
    const n = shares ?? prev.shares;
    if (!Number.isFinite(n) || n <= 0 || n > prev.shares) {
      throw new TypeError(`can only remove 1..${prev.shares} ${sym} shares`);
    }
    if (n === prev.shares) delete state.holdings[sym];
    else state.holdings[sym] = { ...prev, shares: prev.shares - n };
    persist(state);
    return prev;
  }

  function markHolding(symbol, lastPrice) {
    const sym = symbol.toUpperCase();
    const state = load();
    if (!state.holdings[sym]) return null;
    state.holdings[sym] = { ...state.holdings[sym], lastPrice: round2(lastPrice) };
    persist(state);
    return { symbol: sym, ...state.holdings[sym] };
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

  return {
    getBudget, setBudget, addSnapshot, listSnapshots,
    getSettings, setSettings, getLedgers, addFee, addShareRealized,
    listHoldings, getHolding, addHolding, removeHolding, markHolding,
    file, DEFAULT_BALANCE,
  };
}

const paperStore = createPaperStore();

module.exports = { createPaperStore, paperStore, DEFAULT_BALANCE, DEFAULT_SETTINGS };
