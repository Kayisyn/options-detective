// POST /detect  { symbol, filters? } -> ranked Candidate[]
// Screens all expirations x all eligible strategies against live chains.
// Implemented in Phase 3 on top of the Phase 2 data layer.
const { Router } = require("express");

const router = Router();

router.post("/", (_req, res) => {
  res.status(501).json({ error: "Detector screening arrives in Phase 3", phase: 3 });
});

module.exports = router;
