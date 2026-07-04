// POST /detect  { symbol, directionalView?, capital?, ... } -> ranked candidates
// Phase 3 — live. Screens all expirations x eligible strategies.
const { Router } = require("express");
const { DataError } = require("../services/dataLayer");
const { detector } = require("../services/detector");

const router = Router();

const VIEWS = new Set(["bullish", "bearish", "neutral", "income"]);

router.post("/", async (req, res) => {
  const body = req.body || {};
  if (typeof body.symbol !== "string" || body.symbol.trim() === "") {
    res.status(400).json({ error: "symbol (string) is required" });
    return;
  }
  if (body.directionalView !== undefined && !VIEWS.has(body.directionalView)) {
    res.status(400).json({ error: `directionalView must be one of ${[...VIEWS].join(", ")}` });
    return;
  }
  for (const numeric of ["capital", "riskTolerancePct", "maxLossDollars", "minDTE", "maxDTE"]) {
    if (body[numeric] !== undefined && body[numeric] !== null
        && (typeof body[numeric] !== "number" || !Number.isFinite(body[numeric]) || body[numeric] <= 0)) {
      res.status(400).json({ error: `${numeric} must be a positive number` });
      return;
    }
  }
  try {
    res.json(await detector.screen(body));
  } catch (err) {
    if (err instanceof DataError) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: String(err.message || err) });
  }
});

module.exports = router;
