// Trade journal (post-MVP v1.x "saved trades").
//   GET    /trades        -> newest-first list
//   POST   /trades        -> { candidate, exportText?, note? } -> saved entry
//   DELETE /trades/:id    -> { removed: boolean }
const { Router } = require("express");
const { tradeStore } = require("../services/tradeStore");

const router = Router();

router.get("/", (_req, res) => {
  try {
    res.json({ trades: tradeStore.list() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.post("/", (req, res) => {
  try {
    res.status(201).json(tradeStore.save(req.body || {}));
  } catch (err) {
    if (err instanceof TypeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.delete("/:id", (req, res) => {
  try {
    res.json({ removed: tradeStore.remove(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
