"""Probability metrics from the lognormal (Black-Scholes) terminal distribution.

Drift is the risk-neutral rate r by default. That is the standard,
deterministic choice for POP-style tooling: it is exactly consistent with the
pricing model in black_scholes.py and involves no forecast of real-world
returns. Pass r=0 for the common "zero-drift" convention.

Degenerate horizons (T == 0 or sigma == 0) collapse to a point mass at the
forward price, so probabilities become 0/1 indicators.
"""

from __future__ import annotations

import math

from scipy.stats import norm

from black_scholes import _validate
from payoff import (CONTRACT_MULTIPLIER, _parse_legs, _terminal_slopes,
                    payoff_at, payoff_summary)


def prob_below(S, price_level, T, sigma, r=0.0) -> float:
    """P(S_T < price_level) under the lognormal terminal distribution."""
    S, level, T, r, sigma = _validate(S, price_level, T, r, sigma)
    if T == 0.0 or sigma == 0.0:
        forward = S * math.exp(r * T)
        return 1.0 if forward < level else 0.0
    z = (math.log(level / S) - (r - 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
    return float(norm.cdf(z))


def prob_itm(S, K, T, sigma, r=0.0, option_type="call") -> float:
    """Probability the option finishes in the money."""
    if option_type == "call":
        return 1.0 - prob_below(S, K, T, sigma, r)
    if option_type == "put":
        return prob_below(S, K, T, sigma, r)
    raise ValueError(f"option_type must be 'call' or 'put', got {option_type!r}")


def _interval_prob(S, lo, hi, T, sigma, r):
    """P(lo < S_T < hi); lo <= 0 means from zero, hi == inf means to infinity."""
    p_hi = 1.0 if hi == math.inf else prob_below(S, hi, T, sigma, r)
    p_lo = 0.0 if lo <= 0.0 else prob_below(S, lo, T, sigma, r)
    return max(0.0, p_hi - p_lo)


def _probe_point(lo, hi):
    """A strictly interior point of the segment (lo, hi)."""
    if hi == math.inf:
        return lo * 2.0 + 1.0
    return (lo + hi) / 2.0


def prob_of_profit(legs, current_price, T, sigma, r=0.0,
                   multiplier=CONTRACT_MULTIPLIER) -> float:
    """P(expiry P&L > 0) for the whole position.

    Breakevens partition the price axis into segments where the sign of the
    payoff is constant; we sum the lognormal probability of the profitable
    segments. Exact up to the lognormal model assumption.
    """
    summary = payoff_summary(legs, multiplier)
    edges = [0.0] + summary["breakevens"] + [math.inf]
    total = 0.0
    for lo, hi in zip(edges, edges[1:]):
        if payoff_at(legs, _probe_point(lo, hi), multiplier) > 0.0:
            total += _interval_prob(current_price, lo, hi, T, sigma, r)
    return min(1.0, max(0.0, total))


def prob_max_profit(legs, current_price, T, sigma, r=0.0,
                    multiplier=CONTRACT_MULTIPLIER, rel_tol=1e-9) -> float:
    """P(position expires at its maximum profit).

    Max profit of a piecewise-linear payoff is attained either on flat
    segments (measured — contributes probability) or at isolated kink points
    (measure zero — contributes nothing, e.g. a butterfly's peak). Returns 0
    when max profit is unbounded.
    """
    parsed = _parse_legs(legs)
    summary = payoff_summary(legs, multiplier)
    max_profit = summary["max_profit"]
    if not math.isfinite(max_profit):
        return 0.0

    strikes = sorted({leg.strike for leg in parsed if leg.strike is not None})
    nodes = [0.0] + strikes
    values = [payoff_at(legs, x, multiplier) for x in nodes]
    _, slope_right = _terminal_slopes(parsed, multiplier)
    tol = max(1e-9, abs(max_profit) * rel_tol)

    total = 0.0
    for (x0, y0), (x1, y1) in zip(zip(nodes, values), zip(nodes[1:], values[1:])):
        if abs(y0 - max_profit) <= tol and abs(y1 - max_profit) <= tol:
            total += _interval_prob(current_price, x0, x1, T, sigma, r)
    if slope_right == 0.0 and abs(values[-1] - max_profit) <= tol:
        total += _interval_prob(current_price, nodes[-1], math.inf, T, sigma, r)
    return min(1.0, max(0.0, total))
