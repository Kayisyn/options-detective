// Trade journal store, v2 (v1.1 roadmap §3 Phase A): full trade lifecycle
// (open -> closed) with side-aware P&L, targets, tags, MAE/MFE watermarks
// and mark-to-market snapshots. JSON file with atomic tmp+rename writes —
// see the v1 header rationale (Electron's Node lacks node:sqlite; a journal
// is tens of entries).
//
// Price conventions: entryPrice/exitPrice/mark are quoted PER UNIT the way
// brokers quote them (per spread/contract for options, per share for stock);
// dollar P&L multiplies by qty × multiplier (100 for options, 1 for shares).
// side matters: a credit position profits when the price to close FALLS.
//   debit :  pnl = (exit - entry) × qty × multiplier
//   credit:  pnl = (entry - exit) × qty × multiplier
//
// v1 snapshot entries ({savedAt, candidate, note, exportText}) migrate to
// open v2 trades on read.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = process.env.OD_DATA_DIR || path.join(__dirname, "..", "data");

const SIDES = new Set(["debit", "credit"]);

class NotFoundError extends Error {}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function pnlOf(trade, exitPrice) {
  const dir = trade.side === "credit" ? -1 : 1;
  return round2((exitPrice - trade.entryPrice) * dir * trade.entryQty * trade.multiplier);
}

function migrateV2(entry) {
  // v2 -> v2.1: paper-trading fields (defaults keep old entries valid)
  if (entry.paper === undefined) entry.paper = false;
  if (entry.archived === undefined) entry.archived = false;
  if (entry.expiration === undefined) entry.expiration = entry.candidate?.expiration ?? null;
  if (entry.assignmentStrike === undefined) entry.assignmentStrike = null;
  if (entry.reservedCapital === undefined) entry.reservedCapital = null;
  return entry;
}

function migrate(entry) {
  if (entry.status) return migrateV2(entry); // already v2
  const c = entry.candidate ?? null;
  const totalDebit = c?.sizing?.totalDebit ?? 0;
  return migrateV2({
    id: entry.id,
    createdAt: entry.savedAt,
    status: "open",
    symbol: c?.symbol ?? "?",
    strategy: c?.strategyType ?? "unknown",
    side: totalDebit >= 0 ? "debit" : "credit",
    entryPrice: round2(Math.abs(totalDebit) / 100),
    entryQty: 1,
    multiplier: 100,
    entryDate: entry.savedAt,
    maxLossTarget: c?.payoff?.maxLoss ?? null,
    maxProfitTarget: c?.payoff?.maxProfit ?? null,
    notes: entry.note ?? "",
    tags: [],
    exitPrice: null,
    exitDate: null,
    closedAt: null,
    actualPnl: null,
    mae: null,
    mfe: null,
    lastMark: null,
    candidate: c,
    exportText: entry.exportText ?? null,
  });
}

function assertFiniteNumber(value, name, { positive = false, allowNull = false } = {}) {
  if (value === null || value === undefined) {
    if (allowNull) return null;
    throw new TypeError(`${name} is required`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError(`${name} must be a number`);
  if (positive && n <= 0) throw new TypeError(`${name} must be > 0`);
  return n;
}

function cleanTags(tags) {
  if (tags === undefined || tags === null) return [];
  if (!Array.isArray(tags)) throw new TypeError("tags must be an array of strings");
  return tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
}

function createTradeStore({ dir = DEFAULT_DIR, now = () => new Date() } = {}) {
  const file = path.join(dir, "trades.json");

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(parsed) ? parsed.map(migrate) : [];
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

  function list({ includeArchived = false } = {}) {
    return load()
      .filter((t) => includeArchived || !t.archived)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function get(id) {
    const trade = load().find((t) => t.id === id);
    if (!trade) throw new NotFoundError(`no trade ${id}`);
    return trade;
  }

  // Manual entry (roadmap: symbol, strategy, entry, qty, targets, notes).
  function create(input = {}) {
    if (typeof input.symbol !== "string" || input.symbol.trim() === "") {
      throw new TypeError("symbol is required");
    }
    if (typeof input.strategy !== "string" || input.strategy.trim() === "") {
      throw new TypeError("strategy is required");
    }
    const side = input.side ?? "debit";
    if (!SIDES.has(side)) throw new TypeError('side must be "debit" or "credit"');
    const multiplier = input.multiplier ?? 100;
    if (multiplier !== 100 && multiplier !== 1) {
      throw new TypeError("multiplier must be 100 (options) or 1 (shares)");
    }
    const entryQty = assertFiniteNumber(input.entryQty ?? 1, "entryQty", { positive: true });
    if (!Number.isInteger(entryQty)) throw new TypeError("entryQty must be a whole number");

    const nowIso = now().toISOString();
    const trade = {
      id: crypto.randomUUID(),
      createdAt: nowIso,
      status: "open",
      paper: Boolean(input.paper),
      archived: false,
      expiration: input.expiration ? String(input.expiration) : null,
      assignmentStrike: assertFiniteNumber(input.assignmentStrike, "assignmentStrike", { allowNull: true, positive: true }),
      reservedCapital: null, // set by the paper engine when it reserves budget
      symbol: input.symbol.trim().toUpperCase(),
      strategy: input.strategy.trim(),
      side,
      entryPrice: round2(assertFiniteNumber(input.entryPrice, "entryPrice", { positive: true })),
      entryQty,
      multiplier,
      entryDate: input.entryDate ? String(input.entryDate) : nowIso,
      maxLossTarget: assertFiniteNumber(input.maxLossTarget, "maxLossTarget", { allowNull: true }),
      maxProfitTarget: assertFiniteNumber(input.maxProfitTarget, "maxProfitTarget", { allowNull: true }),
      notes: String(input.notes ?? ""),
      tags: cleanTags(input.tags),
      exitPrice: null,
      exitDate: null,
      closedAt: null,
      actualPnl: null,
      mae: null,
      mfe: null,
      lastMark: null,
      candidate: null,
      exportText: input.exportText ?? null,
    };
    const trades = load();
    trades.push(trade);
    persist(trades);
    return trade;
  }

  // One-click logging from the Recommender or the Calculator's save modal:
  // candidate snapshot -> open trade. v1.3.1: entryPrice / maxLossTarget /
  // maxProfitTarget may be overridden (the Calculator modal lets the user
  // adjust them before saving); omitted fields keep the candidate-derived
  // values, and an explicit null target means "no target".
  function createFromCandidate({
    candidate, exportText = null, note = "", paper = false,
    entryPrice, entryQty, maxLossTarget, maxProfitTarget,
  } = {}) {
    if (!candidate || typeof candidate !== "object"
        || typeof candidate.strategyType !== "string"
        || !Array.isArray(candidate.legs) || candidate.legs.length === 0) {
      throw new TypeError("body must include a candidate with strategyType and legs");
    }
    // v1.3.3: position size is overridable (paper modal); whole contracts only
    if (entryQty !== undefined && entryQty !== null
        && (!Number.isInteger(entryQty) || entryQty <= 0)) {
      throw new TypeError("entryQty must be a positive whole number of contracts");
    }
    const totalDebit = candidate?.sizing?.totalDebit ?? 0;
    const nowIso = now().toISOString();
    // assignment strike for the single-short-strike strategies
    const shortPut = candidate.legs.find((l) => l.type === "short_put");
    const shortCall = candidate.legs.find((l) => l.type === "short_call");
    const assignmentStrike = candidate.strategyType === "cash_secured_put"
      ? shortPut?.strike ?? null
      : candidate.strategyType === "covered_call" ? shortCall?.strike ?? null : null;
    const trade = {
      id: crypto.randomUUID(),
      createdAt: nowIso,
      status: "open",
      paper: Boolean(paper),
      archived: false,
      expiration: candidate.expiration ?? null,
      assignmentStrike,
      reservedCapital: null,
      symbol: String(candidate.symbol ?? "?").toUpperCase(),
      strategy: candidate.strategyType,
      side: totalDebit >= 0 ? "debit" : "credit",
      entryPrice: entryPrice === undefined || entryPrice === null
        ? round2(Math.abs(totalDebit) / 100)
        : round2(assertFiniteNumber(entryPrice, "entryPrice", { positive: true })),
      entryQty: entryQty ?? 1,
      multiplier: 100,
      entryDate: nowIso,
      maxLossTarget: maxLossTarget === undefined
        ? candidate?.payoff?.maxLoss ?? null
        : assertFiniteNumber(maxLossTarget, "maxLossTarget", { allowNull: true }),
      maxProfitTarget: maxProfitTarget === undefined
        ? candidate?.payoff?.maxProfit ?? null
        : assertFiniteNumber(maxProfitTarget, "maxProfitTarget", { allowNull: true }),
      notes: String(note ?? ""),
      tags: [],
      exitPrice: null,
      exitDate: null,
      closedAt: null,
      actualPnl: null,
      mae: null,
      mfe: null,
      lastMark: null,
      candidate,
      exportText: exportText === null || exportText === undefined ? null : String(exportText),
    };
    const trades = load();
    trades.push(trade);
    persist(trades);
    return trade;
  }

  const EDITABLE = new Set([
    "notes", "tags", "maxLossTarget", "maxProfitTarget",
    "entryPrice", "entryQty", "entryDate", "strategy", "symbol", "side",
    "expiration", "assignmentStrike",
  ]);

  function update(id, patch = {}) {
    const trades = load();
    const trade = trades.find((t) => t.id === id);
    if (!trade) throw new NotFoundError(`no trade ${id}`);
    for (const [key, value] of Object.entries(patch)) {
      if (!EDITABLE.has(key)) throw new TypeError(`field ${key} is not editable`);
      if (trade.status === "closed" && key !== "notes" && key !== "tags") {
        throw new TypeError(`cannot edit ${key} on a closed trade`);
      }
      if (key === "tags") trade.tags = cleanTags(value);
      else if (key === "notes") trade.notes = String(value ?? "");
      else if (key === "symbol") {
        if (typeof value !== "string" || !value.trim()) throw new TypeError("symbol must be a non-empty string");
        trade.symbol = value.trim().toUpperCase();
      } else if (key === "strategy") {
        if (typeof value !== "string" || !value.trim()) throw new TypeError("strategy must be a non-empty string");
        trade.strategy = value.trim();
      } else if (key === "side") {
        if (!SIDES.has(value)) throw new TypeError('side must be "debit" or "credit"');
        trade.side = value;
      } else if (key === "entryPrice") {
        trade.entryPrice = round2(assertFiniteNumber(value, "entryPrice", { positive: true }));
      } else if (key === "entryQty") {
        const q = assertFiniteNumber(value, "entryQty", { positive: true });
        if (!Number.isInteger(q)) throw new TypeError("entryQty must be a whole number");
        trade.entryQty = q;
      } else if (key === "entryDate") {
        trade.entryDate = String(value);
      } else if (key === "expiration") {
        trade.expiration = value === null ? null : String(value);
      } else {
        trade[key] = assertFiniteNumber(value, key, { allowNull: true });
      }
    }
    persist(trades);
    return trade;
  }

  // Close workflow: server computes the realized P&L; a Winner/Loser/
  // Breakeven tag is added from its sign unless the user tagged already.
  function close(id, { exitPrice, exitDate, mae, mfe, tags } = {}) {
    const trades = load();
    const trade = trades.find((t) => t.id === id);
    if (!trade) throw new NotFoundError(`no trade ${id}`);
    if (trade.status === "closed") throw new TypeError("trade is already closed");
    const exit = round2(assertFiniteNumber(exitPrice, "exitPrice"));
    if (exit < 0) throw new TypeError("exitPrice must be >= 0");
    const nowIso = now().toISOString();
    trade.exitPrice = exit;
    trade.exitDate = exitDate ? String(exitDate) : nowIso;
    trade.closedAt = nowIso;
    trade.actualPnl = pnlOf(trade, exit);
    trade.mae = assertFiniteNumber(mae, "mae", { allowNull: true }) ?? trade.mae;
    trade.mfe = assertFiniteNumber(mfe, "mfe", { allowNull: true }) ?? trade.mfe;
    trade.status = "closed";
    const userTags = cleanTags(tags);
    const outcome = trade.actualPnl > 0 ? "Winner" : trade.actualPnl < 0 ? "Loser" : "Breakeven";
    trade.tags = [...new Set([...trade.tags, ...userTags,
      ...(userTags.some((t) => ["Winner", "Loser", "Breakeven"].includes(t)) ? [] : [outcome])])];
    persist(trades);
    return trade;
  }

  // Mark-to-market snapshot for an OPEN trade + MAE/MFE watermarks.
  // Watermarks are based on marks observed while the app polls — sparse
  // sampling, not tick data; documented as such in the UI.
  function recordMark(id, { underlying, mark = null, unrealizedPnl = null, stale = false } = {}) {
    const trades = load();
    const trade = trades.find((t) => t.id === id);
    if (!trade) throw new NotFoundError(`no trade ${id}`);
    if (trade.status !== "open") return trade;
    trade.lastMark = {
      underlying: assertFiniteNumber(underlying, "underlying"),
      mark: mark === null ? null : round2(Number(mark)),
      unrealizedPnl: unrealizedPnl === null ? null : round2(Number(unrealizedPnl)),
      stale: Boolean(stale),
      at: now().toISOString(),
    };
    if (trade.lastMark.unrealizedPnl !== null) {
      const u = trade.lastMark.unrealizedPnl;
      if (u < 0) trade.mae = trade.mae === null ? u : Math.min(trade.mae, u);
      if (u > 0) trade.mfe = trade.mfe === null ? u : Math.max(trade.mfe, u);
    }
    persist(trades);
    return trade;
  }

  function remove(id) {
    const trades = load();
    const next = trades.filter((t) => t.id !== id);
    if (next.length === trades.length) return false;
    persist(next);
    return true;
  }

  // Paper engine: record the capital reserved when the position opened.
  function setReservedCapital(id, amount) {
    const trades = load();
    const trade = trades.find((t) => t.id === id);
    if (!trade) throw new NotFoundError(`no trade ${id}`);
    trade.reservedCapital = round2(assertFiniteNumber(amount, "reservedCapital"));
    persist(trades);
    return trade;
  }

  // Settlement writer for the paper engine's expiration/assignment logic:
  // the SERVICE computes actualPnl (via the math engine's payoff at the
  // settlement price); the store just records the outcome. exitPrice is
  // back-derived so pnlOf(trade, exitPrice) stays consistent.
  function settle(id, { status, actualPnl, exitDate, note } = {}) {
    if (status !== "assigned" && status !== "expired") {
      throw new TypeError('settle status must be "assigned" or "expired"');
    }
    const trades = load();
    const trade = trades.find((t) => t.id === id);
    if (!trade) throw new NotFoundError(`no trade ${id}`);
    if (trade.status !== "open") throw new TypeError("only open trades settle");
    const pnl = round2(assertFiniteNumber(actualPnl, "actualPnl"));
    const dir = trade.side === "credit" ? -1 : 1;
    const perUnit = pnl / (trade.entryQty * trade.multiplier);
    trade.exitPrice = Math.max(0, round2(trade.entryPrice + dir * perUnit));
    trade.exitDate = exitDate ? String(exitDate) : now().toISOString();
    trade.closedAt = now().toISOString();
    trade.actualPnl = pnl;
    trade.status = status;
    if (note) trade.notes = trade.notes ? `${trade.notes}\n${note}` : note;
    const outcome = pnl > 0 ? "Winner" : pnl < 0 ? "Loser" : "Breakeven";
    trade.tags = [...new Set([...trade.tags, status === "assigned" ? "Assigned" : "Expired", outcome])];
    persist(trades);
    return trade;
  }

  // Paper account reset: archive paper trades instead of deleting them.
  function archivePaperTrades() {
    const trades = load();
    let archived = 0;
    for (const t of trades) {
      if (t.paper && !t.archived) {
        t.archived = true;
        archived += 1;
      }
    }
    persist(trades);
    return archived;
  }

  return {
    list, get, create, createFromCandidate, update, close, recordMark, remove,
    setReservedCapital, settle, archivePaperTrades,
    pnlOf, file,
  };
}

const tradeStore = createTradeStore();

module.exports = { createTradeStore, tradeStore, NotFoundError };
