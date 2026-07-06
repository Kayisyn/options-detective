// Trade journal API (v1.1 §3 Phase A).
//   GET    /journal            -> { trades } (newest first, v1 entries migrated)
//   POST   /journal            -> manual trade {symbol, strategy, entryPrice, ...}
//                                 or one-click {candidate, exportText?, note?}
//   PATCH  /journal/:id        -> edit whitelisted fields
//   POST   /journal/:id/close  -> { exitPrice, exitDate?, mae?, mfe?, tags? }
//   DELETE /journal/:id        -> { removed }
//   POST   /journal/marks      -> refresh quotes + theoretical marks (open trades)
const { Router } = require("express");
const { NotFoundError, tradeStore } = require("../services/tradeStore");
const { journal } = require("../services/journal");

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

router.get("/", (_req, res) => send(res, () => ({ trades: tradeStore.list() })));

router.post("/", (req, res) => send(res, () => {
  const body = req.body || {};
  const trade = body.candidate
    ? tradeStore.createFromCandidate(body)
    : tradeStore.create(body);
  res.status(201);
  return trade;
}));

router.post("/marks", async (_req, res) => {
  try {
    res.json(await journal.refreshMarks());
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

router.patch("/:id", (req, res) => send(res, () => tradeStore.update(req.params.id, req.body || {})));

router.post("/:id/close", (req, res) => send(res, () => tradeStore.close(req.params.id, req.body || {})));

router.delete("/:id", (req, res) => send(res, () => ({ removed: tradeStore.remove(req.params.id) })));

module.exports = router;
