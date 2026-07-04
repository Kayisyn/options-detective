// Calculator: given a candidate (or user-adjusted legs), return the full
// analysis block — net greeks, per-leg greeks, payoff summary, payoff curve,
// POP / prob of max profit, capital required.
//
// Phase 4 responsibilities:
//   - compose math engine calls (bs_*_greeks, payoff_summary, payoff_curve,
//     prob_of_profit, prob_max_profit) into one response
//   - support adjustments: strike width, expiration, account size
//   - all numbers deterministic, all data timestamped

module.exports = {};
