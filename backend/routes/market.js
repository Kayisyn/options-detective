// Market pulse for the sidebars (v1.5.0):
//   GET /market/pulse?watch=AAPL,VGT -> { breadth, trending, watch, news, asOf }
// One cached fetch feeds breadth, trending, watchlist quotes and headlines.
const express = require("express");

const { marketPulse } = require("../services/marketPulse");

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

module.exports = router;
