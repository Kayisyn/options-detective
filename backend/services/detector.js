// Detector: generate Candidate objects for every eligible strategy x
// expiration, price them through the math engine, apply validation gates,
// attach composite scores.
//
// Phase 3 responsibilities:
//   - strategy eligibility from the mapping table (docs/strategy-mapping.md):
//     {directionalView, ivRank, allowedStrategies} -> strategy archetypes
//   - candidate generation: strike selection heuristics per strategy
//   - scoring: POP 0.30 + RoR 0.20 + Theta 0.20 + CapEff 0.15 + Liquidity 0.15
//   - never emit a candidate that fails liquidity or data-freshness gates

module.exports = {};
