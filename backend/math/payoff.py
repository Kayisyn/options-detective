"""Expiry payoff math for multi-leg option positions.

Leg schema (dict):
    {"type": "long_call" | "short_call" | "long_put" | "short_put"
             | "long_stock" | "short_stock",
     "strike": float,   # required for option legs, ignored for stock
     "price":  float,   # entry price per share (premium for options)
     "qty":    int}     # contracts for options, SHARES for stock legs

Also accepted: {"type": "call"|"put"|"stock", "side": "long"|"short", ...}
and "premium" as an alias for "price".

Option legs are scaled by `multiplier` (default 100 shares per contract).
Stock legs are quoted in shares and never scaled.

All returned P&L values are dollars for the whole position at expiry.
The expiry payoff of any option position is piecewise linear in the
underlying price with kinks only at strikes, so breakevens, max profit and
max loss are computed *exactly* (no grid scanning).
"""

from __future__ import annotations

import math
from collections import namedtuple

import numpy as np

CONTRACT_MULTIPLIER = 100

_ZERO_TOL = 1e-9  # payoff dollars treated as exactly breakeven

_Leg = namedtuple("_Leg", "sign kind strike price qty")

_KINDS = ("call", "put", "stock")
_SIDES = {"long": 1.0, "short": -1.0}


def _parse_leg(leg, index):
    if not isinstance(leg, dict):
        raise ValueError(f"leg {index}: expected an object, got {type(leg).__name__}")
    raw_type = str(leg.get("type", ""))
    if "_" in raw_type:
        side, kind = raw_type.split("_", 1)
    else:
        kind = raw_type
        side = leg.get("side", "long")
    if kind not in _KINDS:
        raise ValueError(f"leg {index}: unknown leg type {raw_type!r} "
                         f"(expected long/short + call/put/stock)")
    if side not in _SIDES:
        raise ValueError(f"leg {index}: side must be 'long' or 'short', got {side!r}")

    if kind == "stock":
        strike = None
    else:
        try:
            strike = float(leg["strike"])
        except (KeyError, TypeError, ValueError):
            raise ValueError(f"leg {index}: option legs need a numeric strike") from None
        if not math.isfinite(strike) or strike <= 0.0:
            raise ValueError(f"leg {index}: strike must be > 0, got {strike}")

    try:
        price = float(leg.get("price", leg.get("premium", 0.0)))
    except (TypeError, ValueError):
        raise ValueError(f"leg {index}: price must be a number") from None
    if not math.isfinite(price) or price < 0.0:
        raise ValueError(f"leg {index}: price must be >= 0, got {price}")

    qty = leg.get("qty", 1)
    try:
        qty_int = int(qty)
    except (TypeError, ValueError):
        raise ValueError(f"leg {index}: qty must be a positive integer, got {qty!r}") from None
    if qty_int != qty or qty_int <= 0:
        raise ValueError(f"leg {index}: qty must be a positive integer, got {qty!r}")

    return _Leg(_SIDES[side], kind, strike, price, qty_int)


def _parse_legs(legs):
    if not legs:
        raise ValueError("at least one leg is required")
    return [_parse_leg(leg, i) for i, leg in enumerate(legs)]


def _leg_scale(leg, multiplier):
    return leg.qty * (1 if leg.kind == "stock" else multiplier)


def multi_leg_payoff(legs, underlying_prices, multiplier=CONTRACT_MULTIPLIER):
    """Expiry P&L in dollars at each underlying price. Returns a numpy array."""
    parsed = _parse_legs(legs)
    prices = np.asarray(underlying_prices, dtype=float)
    scalar_input = prices.ndim == 0
    if scalar_input:
        prices = prices.reshape(1)
    if np.any(~np.isfinite(prices)) or np.any(prices < 0.0):
        raise ValueError("underlying prices must be finite and >= 0")
    total = np.zeros_like(prices)
    for leg in parsed:
        if leg.kind == "call":
            value = np.maximum(prices - leg.strike, 0.0)
        elif leg.kind == "put":
            value = np.maximum(leg.strike - prices, 0.0)
        else:
            value = prices
        total = total + leg.sign * (value - leg.price) * _leg_scale(leg, multiplier)
    return total


def payoff_at(legs, price, multiplier=CONTRACT_MULTIPLIER) -> float:
    """Expiry P&L in dollars at a single underlying price."""
    return float(multi_leg_payoff(legs, [price], multiplier)[0])


def _terminal_slopes(parsed, multiplier):
    """Payoff slope ($ per $1 of underlying) below all strikes / above all strikes."""
    slope_left = 0.0
    slope_right = 0.0
    for leg in parsed:
        scale = leg.sign * _leg_scale(leg, multiplier)
        if leg.kind == "call":
            slope_right += scale
        elif leg.kind == "put":
            slope_left -= scale
        else:  # stock
            slope_left += scale
            slope_right += scale
    return slope_left, slope_right


def payoff_summary(legs, multiplier=CONTRACT_MULTIPLIER) -> dict:
    """Exact breakevens, max profit and max loss for the expiry payoff.

    Returns:
        max_profit : dollars; math.inf when unbounded above
        max_loss   : dollars at risk, >= 0; math.inf when unbounded
        breakevens : sorted underlying prices where P&L crosses (or touches) 0

    The payoff is piecewise linear with kinks only at strikes, so evaluating
    at S=0 and every strike plus the two terminal slopes covers the entire
    domain exactly.
    """
    parsed = _parse_legs(legs)
    strikes = sorted({leg.strike for leg in parsed if leg.strike is not None})
    nodes = [0.0] + strikes
    values = [payoff_at(legs, x, multiplier) for x in nodes]
    slope_left, slope_right = _terminal_slopes(parsed, multiplier)

    breakevens = []
    for (x0, y0), (x1, y1) in zip(zip(nodes, values), zip(nodes[1:], values[1:])):
        if abs(y0) <= _ZERO_TOL and x0 > 0.0:
            breakevens.append(x0)
        elif (y0 < 0.0 < y1) or (y1 < 0.0 < y0):
            breakevens.append(x0 + (x1 - x0) * (-y0) / (y1 - y0))
    if abs(values[-1]) <= _ZERO_TOL and nodes[-1] > 0.0:
        breakevens.append(nodes[-1])
    elif slope_right != 0.0:
        # crossing on the unbounded right segment exists iff payoff at the last
        # kink and the terminal slope have opposite signs
        x_cross = nodes[-1] - values[-1] / slope_right
        if x_cross > nodes[-1]:
            breakevens.append(x_cross)

    deduped = []
    for b in sorted(breakevens):
        if not deduped or b - deduped[-1] > 1e-9:
            deduped.append(b)

    max_profit = math.inf if slope_right > 0.0 else max(values)
    worst = -math.inf if slope_right < 0.0 else min(values)
    max_loss = -worst if worst < 0.0 else 0.0

    return {"max_profit": max_profit, "max_loss": max_loss, "breakevens": deduped}


def payoff_curve(legs, current_price=None, multiplier=CONTRACT_MULTIPLIER,
                 num_points=81, span=0.35) -> list:
    """Sampled P&L curve for charting.

    Covers current_price +/- span (fraction) and always includes a margin
    beyond the outermost strikes so every kink is visible.
    """
    parsed = _parse_legs(legs)
    strikes = [leg.strike for leg in parsed if leg.strike is not None]
    if current_price is not None:
        center = float(current_price)
        if not math.isfinite(center) or center <= 0.0:
            raise ValueError(f"current_price must be > 0, got {current_price!r}")
    elif strikes:
        center = (min(strikes) + max(strikes)) / 2.0
    else:
        raise ValueError("current_price is required for stock-only positions")
    if int(num_points) < 2:
        raise ValueError("num_points must be >= 2")

    lo = center * (1.0 - span)
    hi = center * (1.0 + span)
    if strikes:
        lo = min(lo, min(strikes) * 0.90)
        hi = max(hi, max(strikes) * 1.10)
    lo = max(lo, 0.0)

    grid = np.linspace(lo, hi, int(num_points))
    profits = multi_leg_payoff(legs, grid, multiplier)
    return [{"underlyingPrice": float(p), "profit": float(v)}
            for p, v in zip(grid, profits)]
