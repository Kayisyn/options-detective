// POST /calculate         { legs, spot, dte, sigma?, ... } -> full analysis
// POST /calculate/engine  { fn, args } -> raw math engine passthrough
// Phase 4 — live.
const { Router } = require("express");
const { CalcInputError, calculator } = require("../services/calculator");
const { callEngine, EngineDomainError } = require("../services/mathEngine");

const router = Router();

router.post("/", async (req, res) => {
  try {
    res.json(await calculator.analyze(req.body || {}));
  } catch (err) {
    if (err instanceof CalcInputError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof EngineDomainError) {
      res.status(422).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: String(err.message || err) });
  }
});

// Direct access to any math engine function (see docs/api-schema.md).
router.post("/engine", async (req, res) => {
  const { fn, args } = req.body || {};
  if (typeof fn !== "string" || fn.length === 0) {
    res.status(400).json({ error: "body must be { fn: string, args: object }" });
    return;
  }
  try {
    res.json({ result: await callEngine(fn, args || {}) });
  } catch (err) {
    if (err instanceof EngineDomainError) {
      res.status(422).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: String(err.message || err) });
  }
});

module.exports = router;
