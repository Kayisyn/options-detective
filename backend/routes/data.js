// GET /data/:symbol -> { price, chains, ivRank, dataAge }
// yfinance adapter with 60s caching, normalization and liquidity gates
// (volume >= 50, OI >= 100, spread <= 5%). Implemented in Phase 2.
const { Router } = require("express");

const router = Router();

router.get("/:symbol", (req, res) => {
  res.status(501).json({
    error: "Data layer arrives in Phase 2",
    phase: 2,
    symbol: req.params.symbol,
  });
});

module.exports = router;
