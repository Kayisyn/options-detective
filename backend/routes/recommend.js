// POST /recommend  { candidates[] } or { symbol, ...screenParams }
//   -> top candidates ranked by composite score, trade-off facts, and
//      broker-format export text. Phase 5 — live.
const { Router } = require("express");
const { DataError } = require("../services/dataLayer");
const { recommender } = require("../services/recommender");

const router = Router();

router.post("/", async (req, res) => {
  try {
    res.json(await recommender.recommend(req.body || {}));
  } catch (err) {
    if (err instanceof TypeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof DataError) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: String(err.message || err) });
  }
});

module.exports = router;
