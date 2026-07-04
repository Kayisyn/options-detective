// POST /recommend  { candidates | symbol } -> ranked candidates + trade-offs
// Composite score: POP 0.30, risk/reward 0.20, theta 0.20,
// capital efficiency 0.15, liquidity 0.15. Implemented in Phase 5.
const { Router } = require("express");

const router = Router();

router.post("/", (_req, res) => {
  res.status(501).json({ error: "Recommender ranking arrives in Phase 5", phase: 5 });
});

module.exports = router;
