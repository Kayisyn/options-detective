// GET /data/:symbol[?refresh=1&expirations=6] -> normalized market data
// (price, chains after liquidity gates, IV rank, data age). Phase 2 — live.
const { Router } = require("express");
const { dataLayer, DataError } = require("../services/dataLayer");

const router = Router();

router.get("/:symbol", async (req, res) => {
  try {
    const maxExpirations = Math.min(Number.parseInt(req.query.expirations, 10) || 6, 8);
    const data = await dataLayer.getMarketData(req.params.symbol, {
      refresh: req.query.refresh === "1",
      maxExpirations,
    });
    res.json(data);
  } catch (err) {
    if (err instanceof DataError) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: String(err.message || err) });
  }
});

module.exports = router;
