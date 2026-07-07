// Paper trading API (v2.0 §1.4, adapted to the single-user JSON stores).
//   GET  /paper                    -> { balance, trades, stats }
//   POST /paper/budget             -> { initialBalance } (first-time setup)
//   GET  /paper/budget             -> derived balance
//   POST /paper/trades             -> open (manual body or { candidate })
//   GET  /paper/trades?status=     -> paper trades
//   POST /paper/trades/:id/close   -> { exitPrice, ... }
//   POST /paper/process            -> marks + expiration/assignment pass
//   GET  /paper/stats              -> win rate, profit factor, buckets
//   GET  /paper/equity-curve?days= -> snapshots
//   POST /paper/reset              -> archive positions, fresh balance
const { Router } = require("express");
const { NotFoundError, tradeStore } = require("../services/tradeStore");
const { paperTrading } = require("../services/paperTrading");

const router = Router();

function send(res, fn) {
  try {
    res.json(fn());
  } catch (err) {
    if (err instanceof NotFoundError) res.status(404).json({ error: err.message });
    else if (err instanceof TypeError) res.status(400).json({ error: err.message });
    else res.status(500).json({ error: String(err.message || err) });
  }
}

router.get("/", (_req, res) => send(res, () => ({
  balance: paperTrading.balance(),
  trades: tradeStore.list().filter((t) => t.paper),
  stats: paperTrading.stats(),
})));

router.post("/budget", (req, res) => send(res, () => paperTrading.setBudget(req.body?.initialBalance)));
router.get("/budget", (_req, res) => send(res, () => ({ balance: paperTrading.balance() })));

router.post("/trades", (req, res) => send(res, () => {
  res.status(201);
  return paperTrading.open(req.body || {});
}));

router.get("/trades", (req, res) => send(res, () => {
  let trades = tradeStore.list().filter((t) => t.paper);
  if (req.query.status) trades = trades.filter((t) => t.status === req.query.status);
  return { trades };
}));

router.post("/trades/:id/close", (req, res) => send(res, () => paperTrading.close(req.params.id, req.body || {})));

router.post("/process", async (_req, res) => {
  try {
    res.json(await paperTrading.process());
  } catch (err) {
    if (err instanceof TypeError) res.status(400).json({ error: err.message });
    else res.status(502).json({ error: String(err.message || err) });
  }
});

router.get("/stats", (_req, res) => send(res, () => paperTrading.stats()));

router.get("/equity-curve", (req, res) => send(res, () => ({
  points: paperTrading.equityCurve(Number.parseInt(req.query.days, 10) || 30),
})));

router.post("/reset", (req, res) => send(res, () => paperTrading.reset(req.body?.initialBalance)));

module.exports = router;
