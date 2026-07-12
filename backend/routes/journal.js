// Trade journal API (v1.1 §3 Phase A).
//   GET    /journal            -> { trades } (newest first, v1 entries migrated)
//   POST   /journal            -> manual trade {symbol, strategy, entryPrice, ...}
//                                 or one-click {candidate, exportText?, note?}
//   PATCH  /journal/:id        -> edit whitelisted fields
//   POST   /journal/:id/close  -> { exitPrice, exitDate?, mae?, mfe?, tags? }
//   DELETE /journal/:id        -> { removed } (permanent)
//   POST   /journal/marks      -> refresh quotes + theoretical marks (open trades)
//   v1.5.1 trash (soft delete):
//   GET    /journal/trash        -> { trades } (deleted, newest-deleted first)
//   POST   /journal/trash-all    -> { trashed } (Clear All; real positions)
//   POST   /journal/restore-all  -> { restored }
//   POST   /journal/purge-trash  -> { purged } (irreversible)
//   POST   /journal/:id/trash    -> soft-delete one
//   POST   /journal/:id/restore  -> restore one
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

// v1.5.1 trash. Literal collection routes are declared before the /:id
// routes so "trash" / "trash-all" are never captured as an :id.
router.get("/trash", (_req, res) => send(res, () => ({ trades: tradeStore.listTrash() })));
router.post("/trash-all", (req, res) => send(res, () =>
  ({ trashed: tradeStore.trashActive({ includePaper: Boolean(req.body?.includePaper) }) })));
router.post("/restore-all", (_req, res) => send(res, () => ({ restored: tradeStore.restoreAll() })));
router.post("/purge-trash", (_req, res) => send(res, () => ({ purged: tradeStore.purgeTrash() })));

router.patch("/:id", (req, res) => send(res, () => tradeStore.update(req.params.id, req.body || {})));

router.post("/:id/close", (req, res) => send(res, () => tradeStore.close(req.params.id, req.body || {})));

router.post("/:id/trash", (req, res) => send(res, () => tradeStore.trash(req.params.id)));

router.post("/:id/restore", (req, res) => send(res, () => tradeStore.restore(req.params.id)));

router.delete("/:id", (req, res) => send(res, () => ({ removed: tradeStore.remove(req.params.id) })));

module.exports = router;
