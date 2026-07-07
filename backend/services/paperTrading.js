// Paper trading engine (v2.0 §1). Positions live in the SAME journal store
// as real trades (paper: true), which gives §1.3I integration for free —
// the paper layer adds budget accounting, capital reservation, settlement
// mechanics and the equity curve.
//
// Money model (documented deviations from the brief, which mixed units):
// - Capital reservation at open: candidate-linked -> the candidate's
//   capitalRequired × qty; manual credit with an assignment strike ->
//   strike × multiplier × qty (cash-secured); else max-loss target; else a
//   debit's entry cost. Credit trades with no loss basis are rejected —
//   a simulator that can't account for risk teaches the wrong lesson.
// - available = initial + realized(paper) − Σ reserved(open paper)
// - accountValue = initial + realized(paper) + Σ unrealized(open, marked)
// - Settlement at expiry uses the math engine's EXACT payoff at the
//   settlement price for candidate-linked trades (the brief's §1.3F
//   formulas compare underlying to option premium — dimensionally wrong).
//   Assignment is deterministic (§1.6) and cash-settled at market; share
//   inventory is not carried, and every settlement note says so.
const { dataLayer: defaultDataLayer } = require("./dataLayer");
const { callEngineBatch } = require("./mathEngine");
const { paperStore: defaultPaperStore, DEFAULT_BALANCE } = require("./paperStore");
const { tradeStore: defaultTradeStore } = require("./tradeStore");

function round2(x) {
  return Math.round(x * 100) / 100;
}

function dteOf(expiration, nowMs) {
  return Math.round((Date.parse(`${expiration}T21:00:00Z`) - nowMs) / 86_400_000);
}

function engineLegsOf(candidate) {
  return candidate.legs.map((leg) => (leg.type.endsWith("stock")
    ? { type: leg.type, price: leg.price, qty: leg.qty }
    : { type: leg.type, strike: leg.strike, price: leg.price, qty: leg.qty, iv: leg.iv }));
}

function createPaperTrading({
  tradeStore = defaultTradeStore,
  paperStore = defaultPaperStore,
  dataLayer = defaultDataLayer,
  engineBatch = callEngineBatch,
  calculator = null, // lazily required to avoid cycles in tests
  now = Date.now,
} = {}) {
  const calc = () => calculator ?? require("./calculator").calculator;

  function paperTrades() {
    return tradeStore.list().filter((t) => t.paper);
  }

  function reservedCapitalFor(input, candidate) {
    const qty = input.entryQty ?? 1;
    const mult = input.multiplier ?? 100;
    if (candidate?.sizing?.capitalRequired > 0) {
      return round2(candidate.sizing.capitalRequired * qty);
    }
    if (input.side === "credit") {
      if (Number.isFinite(input.assignmentStrike) && input.assignmentStrike > 0) {
        return round2(input.assignmentStrike * mult * qty); // cash-secured
      }
      if (Number.isFinite(input.maxLossTarget) && input.maxLossTarget > 0) {
        return round2(input.maxLossTarget);
      }
      throw new TypeError(
        "paper credit trades need an assignmentStrike (cash-secured) or a maxLossTarget — otherwise the simulator cannot reserve risk capital");
    }
    if (Number.isFinite(input.maxLossTarget) && input.maxLossTarget > 0) {
      return round2(input.maxLossTarget);
    }
    return round2(input.entryPrice * mult * qty); // debit cost
  }

  function balance() {
    const budget = paperStore.getBudget();
    if (!budget) return null;
    const trades = paperTrades();
    const closed = trades.filter((t) => t.status !== "open" && t.actualPnl !== null);
    const open = trades.filter((t) => t.status === "open");
    const realizedPnl = round2(closed.reduce((s, t) => s + t.actualPnl, 0));
    const reserved = round2(open.reduce((s, t) => s + (t.reservedCapital ?? 0), 0));
    const marked = open.filter((t) => t.lastMark?.unrealizedPnl != null);
    const unrealizedPnl = marked.length
      ? round2(marked.reduce((s, t) => s + t.lastMark.unrealizedPnl, 0))
      : null;
    return {
      initialBalance: budget.initialBalance,
      createdAt: budget.createdAt,
      resetAt: budget.resetAt,
      realizedPnl,
      unrealizedPnl,
      reserved,
      available: round2(budget.initialBalance + realizedPnl - reserved),
      accountValue: round2(budget.initialBalance + realizedPnl + (unrealizedPnl ?? 0)),
      openCount: open.length,
      closedCount: closed.length,
    };
  }

  function snapshot() {
    const b = balance();
    if (!b) return;
    paperStore.addSnapshot({
      accountValue: b.accountValue,
      realizedPnl: b.realizedPnl,
      unrealizedPnl: b.unrealizedPnl,
      openCount: b.openCount,
    });
  }

  function requireBudget() {
    const budget = paperStore.getBudget();
    if (!budget) {
      throw new TypeError("no paper account yet — set an initial balance first");
    }
    return budget;
  }

  // §1.3A: open a paper position (manual body or {candidate}).
  function open(body = {}) {
    requireBudget();
    const b = balance();
    let reserved;
    let trade;
    if (body.candidate) {
      const qty = body.entryQty ?? 1;
      reserved = reservedCapitalFor({ entryQty: qty, multiplier: 100, side: "debit" }, body.candidate);
      if (reserved > b.available) {
        throw new TypeError(`insufficient paper balance: needs $${reserved}, available $${b.available}`);
      }
      trade = tradeStore.createFromCandidate({ ...body, paper: true });
    } else {
      reserved = reservedCapitalFor(body);
      if (reserved > b.available) {
        throw new TypeError(`insufficient paper balance: needs $${reserved}, available $${b.available}`);
      }
      trade = tradeStore.create({ ...body, paper: true });
    }
    trade = tradeStore.setReservedCapital(trade.id, reserved);
    snapshot();
    return { trade, balance: balance() };
  }

  function close(id, payload) {
    const trade = tradeStore.get(id);
    if (!trade.paper) throw new TypeError("not a paper trade — close it in the journal");
    const closed = tradeStore.close(id, payload);
    snapshot();
    return { trade: closed, balance: balance() };
  }

  // §1.3D/G: expiration + assignment, deterministic. Also refreshes marks
  // on surviving open positions (same theo model as the journal).
  async function process() {
    requireBudget();
    const warnings = [];
    const open = paperTrades().filter((t) => t.status === "open");
    const quotes = new Map();
    for (const symbol of new Set(open.map((t) => t.symbol))) {
      try {
        const d = await dataLayer.getMarketData(symbol);
        quotes.set(symbol, { price: d.price, stale: d.stale });
      } catch (err) {
        warnings.push(`${symbol}: quote unavailable (${err.message})`);
      }
    }

    for (const trade of open) {
      const quote = quotes.get(trade.symbol);
      if (!quote) continue;
      const spot = quote.price;
      const expired = trade.expiration !== null && dteOf(trade.expiration, now()) <= 0;

      if (expired) {
        try {
          const settled = await settleAtExpiry(trade, spot);
          if (settled) continue;
          warnings.push(`${trade.symbol} ${trade.strategy}: expired but has no legs or assignment strike — close it manually`);
          continue;
        } catch (err) {
          warnings.push(`${trade.symbol} ${trade.strategy}: settlement failed (${err.message})`);
          continue;
        }
      }

      // not expired: refresh the mark
      let mark = null;
      let unrealized = null;
      if (trade.candidate?.legs?.length) {
        try {
          const res = await calc().analyze({
            legs: engineLegsOf(trade.candidate),
            spot,
            dte: Math.max(1, dteOf(trade.expiration ?? trade.candidate.expiration, now())),
            sigma: trade.candidate.meta?.sigma,
            riskFreeRate: trade.candidate.meta?.riskFreeRate,
            repriceTheoretical: true,
          });
          const signedNow = res.sizing.totalDebit / 100;
          const signedEntry = trade.side === "credit" ? -trade.entryPrice : trade.entryPrice;
          mark = signedNow;
          unrealized = round2((signedNow - signedEntry) * trade.entryQty * trade.multiplier);
        } catch (err) {
          warnings.push(`${trade.symbol}: reprice failed (${err.message})`);
        }
      }
      tradeStore.recordMark(trade.id, {
        underlying: spot, mark, unrealizedPnl: unrealized, stale: quote.stale,
      });
    }

    snapshot();
    return { trades: paperTrades(), balance: balance(), warnings };
  }

  async function settleAtExpiry(trade, spot) {
    const scale = trade.entryQty * trade.multiplier;
    // candidate-linked: exact payoff at the settlement price, from the engine
    if (trade.candidate?.legs?.length) {
      const [res] = await engineBatch([{
        fn: "multi_leg_payoff",
        args: { legs: engineLegsOf(trade.candidate), underlying_prices: [spot] },
      }]);
      if (!res.ok) throw new Error(res.error);
      const pnl = round2(res.result[0] * trade.entryQty);
      const strike = trade.assignmentStrike;
      const assigned = strike !== null && (
        (trade.strategy === "cash_secured_put" && spot <= strike)
        || (trade.strategy === "covered_call" && spot >= strike));
      tradeStore.settle(trade.id, {
        status: assigned ? "assigned" : "expired",
        actualPnl: pnl,
        note: `Settled at expiry, underlying $${spot.toFixed(2)} (cash-settled at market; shares not carried).`,
      });
      return true;
    }
    // manual with an assignment strike: CSP-style (credit) or CC-style (debit)
    if (trade.assignmentStrike !== null) {
      const strike = trade.assignmentStrike;
      let pnl;
      let assigned;
      if (trade.side === "credit") { // cash-secured put
        assigned = spot <= strike;
        pnl = round2((trade.entryPrice - Math.max(strike - spot, 0)) * scale);
      } else { // covered call (entry = buy-write cost per share)
        assigned = spot >= strike;
        pnl = assigned
          ? round2((strike - trade.entryPrice) * scale)
          : round2((spot - trade.entryPrice) * scale);
      }
      tradeStore.settle(trade.id, {
        status: assigned ? "assigned" : "expired",
        actualPnl: pnl,
        note: `Settled at expiry, underlying $${spot.toFixed(2)} vs strike $${strike} (cash-settled at market; shares not carried).`,
      });
      return true;
    }
    return false; // nothing deterministic to settle against
  }

  function stats() {
    const closed = paperTrades().filter((t) => t.status !== "open" && t.actualPnl !== null);
    const wins = closed.filter((t) => t.actualPnl > 0);
    const losses = closed.filter((t) => t.actualPnl < 0);
    const grossProfit = round2(wins.reduce((s, t) => s + t.actualPnl, 0));
    const grossLoss = round2(losses.reduce((s, t) => s + t.actualPnl, 0));
    const bucket = (keyOf) => {
      const map = new Map();
      for (const t of closed) {
        const key = keyOf(t);
        const cur = map.get(key) ?? { key, pnl: 0, count: 0 };
        cur.pnl = round2(cur.pnl + t.actualPnl);
        cur.count += 1;
        map.set(key, cur);
      }
      return [...map.values()].sort((a, b) => b.pnl - a.pnl);
    };
    return {
      closed: closed.length,
      wins: wins.length,
      losses: losses.length,
      assigned: closed.filter((t) => t.status === "assigned").length,
      winRate: closed.length ? wins.length / closed.length : null,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss !== 0 ? round2(grossProfit / Math.abs(grossLoss)) : null,
      avgWin: wins.length ? round2(grossProfit / wins.length) : null,
      avgLoss: losses.length ? round2(grossLoss / losses.length) : null,
      largestWin: wins.length ? Math.max(...wins.map((t) => t.actualPnl)) : null,
      largestLoss: losses.length ? Math.min(...losses.map((t) => t.actualPnl)) : null,
      byStrategy: bucket((t) => t.strategy),
      bySymbol: bucket((t) => t.symbol),
    };
  }

  function equityCurve(days = 30) {
    const since = days > 0 ? now() - days * 86_400_000 : 0;
    return paperStore.listSnapshots(since);
  }

  function setBudget(initialBalance = DEFAULT_BALANCE) {
    const hadBudget = paperStore.getBudget() !== null;
    if (hadBudget) {
      throw new TypeError("account exists — use reset to start over");
    }
    const budget = paperStore.setBudget(initialBalance);
    snapshot();
    return { budget, balance: balance() };
  }

  // §1.6 reset: archive paper positions (history preserved in the journal
  // file), restart the curve at a fresh balance.
  function reset(initialBalance) {
    const budget = requireBudget();
    const archived = tradeStore.archivePaperTrades();
    paperStore.setBudget(initialBalance ?? budget.initialBalance);
    snapshot();
    return { archived, balance: balance() };
  }

  return {
    open, close, process, stats, equityCurve, balance, setBudget, reset,
    reservedCapitalFor,
  };
}

const paperTrading = createPaperTrading();

module.exports = { createPaperTrading, paperTrading };
