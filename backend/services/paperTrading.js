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
//   Assignment is deterministic (§1.6): 100% when ITM at expiry.
//
// v1.5.0 realism:
// - SHARE CARRY: an assigned cash-secured put converts its reserved cash
//   into shares at the strike (the trade realizes only the premium; the
//   share position floats at market in accountValue until sold). An
//   assigned covered call sells held shares at the strike (share P&L goes
//   to the shareRealized ledger); with no held shares it stays the
//   buy-write cash settlement. Other strategies remain cash-settled via
//   the engine payoff.
// - COMMISSION: optional flat fee per order (entry and exit/settlement),
//   accumulated in the fees ledger and deducted from cash + accountValue.
// - THETA MODE: fast/slow reprices marks at 2x/0.5x elapsed time-decay
//   (marks only — real expiry dates still drive settlement).
// - AUTO-ASSIGN toggle: off = expired positions are left open with a
//   warning to settle manually.
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
        "paper credit trades need an assignmentStrike (cash-secured) or a maxLossTarget, otherwise the simulator cannot reserve risk capital");
    }
    if (Number.isFinite(input.maxLossTarget) && input.maxLossTarget > 0) {
      return round2(input.maxLossTarget);
    }
    return round2(input.entryPrice * mult * qty); // debit cost
  }

  // one flat commission per order when enabled (entry, exit, settlement)
  function chargeCommission(count = 1) {
    const settings = paperStore.getSettings();
    if (!settings.commissionEnabled || settings.commissionPerTrade <= 0) return 0;
    const fee = round2(settings.commissionPerTrade * count);
    paperStore.addFee(fee);
    return fee;
  }

  function balance() {
    const budget = paperStore.getBudget();
    if (!budget) return null;
    const trades = paperTrades();
    const closed = trades.filter((t) => t.status !== "open" && t.actualPnl !== null);
    const open = trades.filter((t) => t.status === "open");
    const { feesPaid, shareRealized } = paperStore.getLedgers();
    const holdings = paperStore.listHoldings();
    // trade realizations + share-sale realizations, net of commissions
    const realizedPnl = round2(
      closed.reduce((s, t) => s + t.actualPnl, 0) + shareRealized - feesPaid);
    const reserved = round2(open.reduce((s, t) => s + (t.reservedCapital ?? 0), 0));
    const marked = open.filter((t) => t.lastMark?.unrealizedPnl != null);
    const unrealizedPnl = marked.length
      ? round2(marked.reduce((s, t) => s + t.lastMark.unrealizedPnl, 0))
      : null;
    // shares tie up their cost basis in cash; they float at lastPrice
    // (refreshed each process pass) in accountValue
    const holdingsCost = round2(holdings.reduce((s, h) => s + h.shares * h.costBasis, 0));
    const holdingsValue = round2(holdings.reduce(
      (s, h) => s + h.shares * (h.lastPrice ?? h.costBasis), 0));
    return {
      initialBalance: budget.initialBalance,
      createdAt: budget.createdAt,
      resetAt: budget.resetAt,
      realizedPnl,
      unrealizedPnl,
      reserved,
      feesPaid,
      holdingsCost,
      holdingsValue,
      available: round2(budget.initialBalance + realizedPnl - reserved - holdingsCost),
      accountValue: round2(
        budget.initialBalance + realizedPnl - holdingsCost + holdingsValue
        + (unrealizedPnl ?? 0)),
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
      throw new TypeError("no paper account yet. Set an initial balance first");
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
    chargeCommission(); // entry order
    snapshot();
    return { trade, balance: balance() };
  }

  function close(id, payload) {
    const trade = tradeStore.get(id);
    if (!trade.paper) throw new TypeError("not a paper trade. Close it in the journal");
    const closed = tradeStore.close(id, payload);
    chargeCommission(); // exit order
    snapshot();
    return { trade: closed, balance: balance() };
  }

  // v1.5.0: sell shares acquired through assignment. Price defaults to the
  // live quote; realized share P&L lands in the shareRealized ledger.
  async function sellHolding(symbol, { shares, price } = {}) {
    requireBudget();
    const holding = paperStore.getHolding(symbol);
    if (!holding) throw new TypeError(`no ${symbol.toUpperCase()} shares held`);
    const qty = shares ?? holding.shares;
    let px = price;
    if (px === undefined || px === null) {
      const d = await dataLayer.getMarketData(holding.symbol);
      px = d.price;
    }
    px = Number(px);
    if (!Number.isFinite(px) || px <= 0) throw new TypeError("sell price must be > 0");
    paperStore.removeHolding(holding.symbol, qty);
    const realized = round2((px - holding.costBasis) * qty);
    paperStore.addShareRealized(realized);
    chargeCommission(); // the sale is an order too
    snapshot();
    return {
      sold: { symbol: holding.symbol, shares: qty, price: px, realized },
      holdings: paperStore.listHoldings(),
      balance: balance(),
    };
  }

  // Theta simulation (marks only): fast decays twice as quickly as the
  // wall clock since entry, slow at half speed. Real dates still expire.
  function simulatedDte(trade, realDte) {
    const mode = paperStore.getSettings().thetaMode;
    const mult = mode === "fast" ? 2 : mode === "slow" ? 0.5 : 1;
    if (mult === 1 || !trade.entryDate) return realDte;
    const elapsedDays = Math.max(0, (now() - Date.parse(trade.entryDate)) / 86_400_000);
    return Math.max(1, Math.round(realDte - (mult - 1) * elapsedDays));
  }

  // §1.3D/G: expiration + assignment, deterministic. Also refreshes marks
  // on surviving open positions (same theo model as the journal) and on
  // held shares. Returns `events` for user-facing notifications
  // ("AAPL: 100 shares assigned at $165").
  async function process() {
    requireBudget();
    const warnings = [];
    const events = [];
    const settings = paperStore.getSettings();
    const open = paperTrades().filter((t) => t.status === "open");
    const quotes = new Map();
    const symbols = new Set([
      ...open.map((t) => t.symbol),
      ...paperStore.listHoldings().map((h) => h.symbol),
    ]);
    for (const symbol of symbols) {
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
      const realDte = trade.expiration !== null ? dteOf(trade.expiration, now()) : null;
      const expired = realDte !== null && realDte <= 0;

      if (expired) {
        if (!settings.autoAssign) {
          warnings.push(`${trade.symbol} ${trade.strategy}: expired. Auto-assign is off, close it manually`);
          continue;
        }
        try {
          const settled = await settleAtExpiry(trade, spot, events);
          if (settled) continue;
          warnings.push(`${trade.symbol} ${trade.strategy}: expired but has no legs or assignment strike. Close it manually`);
          continue;
        } catch (err) {
          warnings.push(`${trade.symbol} ${trade.strategy}: settlement failed (${err.message})`);
          continue;
        }
      }

      // not expired: refresh the mark (at the simulated decay clock)
      let mark = null;
      let unrealized = null;
      if (trade.candidate?.legs?.length) {
        try {
          const res = await calc().analyze({
            legs: engineLegsOf(trade.candidate),
            spot,
            dte: simulatedDte(trade,
              Math.max(1, dteOf(trade.expiration ?? trade.candidate.expiration, now()))),
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

    // mark held shares at the latest quote so accountValue tracks them
    for (const holding of paperStore.listHoldings()) {
      const quote = quotes.get(holding.symbol);
      if (quote) paperStore.markHolding(holding.symbol, quote.price);
    }

    snapshot();
    return {
      trades: paperTrades(), balance: balance(), warnings, events,
      holdings: paperStore.listHoldings(),
    };
  }

  async function settleAtExpiry(trade, spot, events = []) {
    const scale = trade.entryQty * trade.multiplier;
    const strike = trade.assignmentStrike;

    // v1.5.0 SHARE CARRY: an assigned short put buys real (simulated)
    // shares at the strike. The trade realizes only its premium; the
    // shares enter the holdings ledger at the strike as cost basis and
    // float at market until the user sells them. Covered calls are NOT
    // wired to the holdings ledger: every CC here is a buy-write whose
    // settlement already contains the share leg — pulling separately-held
    // shares into it would double-count.
    const isShortPut = strike !== null && trade.side === "credit"
      && (trade.strategy === "cash_secured_put" || !trade.candidate?.legs?.length);
    if (isShortPut && spot <= strike) {
      tradeStore.settle(trade.id, {
        status: "assigned",
        actualPnl: round2(trade.entryPrice * scale), // premium kept
        note: `Assigned at expiry: bought ${scale} ${trade.symbol} shares at $${strike} `
          + `(underlying $${spot.toFixed(2)}); premium kept, shares now held in the Sandbox.`,
      });
      paperStore.addHolding(trade.symbol, {
        shares: scale, costBasis: strike, lastPrice: spot,
      });
      chargeCommission(); // settlement order
      events.push(`${trade.symbol}: ${scale} shares assigned at $${strike} strike`);
      return true;
    }
    // short put OTM at expiry: expired worthless, full premium kept (the
    // engine payoff gives the same number for candidate-linked CSPs)
    if (isShortPut) {
      tradeStore.settle(trade.id, {
        status: "expired",
        actualPnl: round2(trade.entryPrice * scale),
        note: `Expired worthless, underlying $${spot.toFixed(2)} above $${strike}. Premium kept.`,
      });
      chargeCommission();
      return true;
    }

    // candidate-linked: exact payoff at the settlement price, from the engine
    if (trade.candidate?.legs?.length) {
      const [res] = await engineBatch([{
        fn: "multi_leg_payoff",
        args: { legs: engineLegsOf(trade.candidate), underlying_prices: [spot] },
      }]);
      if (!res.ok) throw new Error(res.error);
      const pnl = round2(res.result[0] * trade.entryQty);
      const assigned = strike !== null && (
        (trade.strategy === "cash_secured_put" && spot <= strike)
        || (trade.strategy === "covered_call" && spot >= strike));
      tradeStore.settle(trade.id, {
        status: assigned ? "assigned" : "expired",
        actualPnl: pnl,
        note: assigned && trade.strategy === "covered_call"
          ? `Assigned at expiry: shares called away at $${strike} (buy-write settled, capital freed).`
          : `Settled at expiry, underlying $${spot.toFixed(2)} (cash-settled at market).`,
      });
      chargeCommission();
      if (assigned) {
        events.push(trade.strategy === "covered_call"
          ? `${trade.symbol}: shares called away at $${strike} strike`
          : `${trade.symbol}: assigned at $${strike} strike`);
      }
      return true;
    }
    // manual CC-style (debit, entry = buy-write cost per share)
    if (strike !== null) {
      const assigned = spot >= strike;
      const pnl = assigned
        ? round2((strike - trade.entryPrice) * scale)
        : round2((spot - trade.entryPrice) * scale);
      tradeStore.settle(trade.id, {
        status: assigned ? "assigned" : "expired",
        actualPnl: pnl,
        note: assigned
          ? `Assigned at expiry: shares called away at $${strike} (buy-write settled, capital freed).`
          : `Settled at expiry, underlying $${spot.toFixed(2)} vs strike $${strike}.`,
      });
      chargeCommission();
      if (assigned) events.push(`${trade.symbol}: shares called away at $${strike} strike`);
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
      throw new TypeError("account exists. Use reset to start over");
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

  function getSettings() {
    return paperStore.getSettings();
  }

  function setSettings(patch) {
    return paperStore.setSettings(patch);
  }

  function holdings() {
    return paperStore.listHoldings();
  }

  return {
    open, close, process, stats, equityCurve, balance, setBudget, reset,
    reservedCapitalFor, getSettings, setSettings, holdings, sellHolding,
  };
}

const paperTrading = createPaperTrading();

module.exports = { createPaperTrading, paperTrading };
