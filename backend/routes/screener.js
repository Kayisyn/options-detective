// Index Component Screener API (v1.3.0 §2-§3, roadmap-specified paths):
//   GET  /screener/etf/:ticker/holdings -> { etf, source, asOf, holdings, totalHoldings }
//   POST /screener/batch                -> { etf, constraints?, refresh? } -> ranked candidates
// Unknown ticker -> 400; holdings unavailable (bond/commodity funds) -> 404
// with a user-facing message; infrastructure failures -> 502.
const { Router } = require("express");
const { icsScreener, HoldingsUnavailableError } = require("../services/icsScreener");

const router = Router();

function fail(res, err) {
  if (err instanceof TypeError) res.status(400).json({ error: err.message });
  else if (err instanceof HoldingsUnavailableError) res.status(404).json({ error: err.message });
  else res.status(502).json({ error: String(err.message || err) });
}

router.get("/etf/:ticker/holdings", async (req, res) => {
  try {
    res.json(await icsScreener.holdingsFor(req.params.ticker));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/batch", async (req, res) => {
  const body = req.body || {};
  if (typeof body.etf !== "string" || body.etf.trim() === "") {
    res.status(400).json({ error: "etf (string) is required" });
    return;
  }
  try {
    res.json(await icsScreener.batchScreen({
      etf: body.etf,
      refresh: Boolean(body.refresh),
      constraints: body.constraints && typeof body.constraints === "object" ? body.constraints : {},
    }));
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
