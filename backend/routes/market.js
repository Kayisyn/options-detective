// Market pulse for the sidebars (v1.5.0):
//   GET /market/pulse?watch=AAPL,VGT -> { breadth, trending, watch, news, asOf }
// One cached fetch feeds breadth, trending, watchlist quotes and headlines.
// v1.7.0 currency:
//   GET /market/fx[?refresh=1] -> { rate, asOf, stale } (USD -> CAD)
const express = require("express");

const { marketPulse } = require("../services/marketPulse");
const { fx } = require("../services/fx");

const router = express.Router();

router.get("/pulse", async (req, res) => {
  try {
    const watch = typeof req.query.watch === "string" && req.query.watch !== ""
      ? req.query.watch.split(",")
      : [];
    res.json(await marketPulse.pulse({ watch }));
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

router.get("/fx", async (req, res) => {
  try {
    res.json(await fx.current({ refresh: req.query.refresh === "1" }));
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

module.exports = router;
