// POST /calculate  { candidate, adjustments? } -> greeks + payoff + probabilities
// The candidate-level calculator lands in Phase 4. The raw engine passthrough
// below is live NOW so integration against real numbers can start early.
const { Router } = require("express");
const { callEngine, EngineDomainError } = require("../services/mathEngine");

const router = Router();

// POST /calculate/engine  { fn, args } -> { result }
// Direct access to any math engine function (see docs/api-schema.md for the
// function list). The engine itself validates fn and args.
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

router.post("/", (_req, res) => {
  res.status(501).json({ error: "Candidate calculator arrives in Phase 4", phase: 4 });
});

module.exports = router;
