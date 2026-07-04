"""Implied volatility solver: Newton-Raphson with a guaranteed brentq fallback.

Newton-Raphson (seeded with the Brenner-Subrahmanyam approximation) converges
in a handful of iterations for well-behaved inputs. When it stalls — tiny vega
deep in/out of the money, or a step that leaves the valid sigma range — we
fall back to scipy's brentq on a bracket that is guaranteed to contain the
root, because Black-Scholes price is strictly increasing in sigma.
"""

from __future__ import annotations

import math

from scipy.optimize import brentq
from scipy.stats import norm

from black_scholes import _validate, bs_call_price, bs_put_price

SIGMA_MIN = 1e-9
SIGMA_MAX_START = 5.0   # initial upper bracket (500% vol)
SIGMA_MAX_HARD = 20.0   # absolute ceiling; beyond this the quote is junk


def implied_volatility(market_price, S, K, T, r, option_type="call",
                       tol=1e-8, max_iter=60) -> float:
    """Volatility that reproduces market_price under Black-Scholes.

    Returns 0.0 when the price sits exactly at the zero-vol floor
    (discounted intrinsic). Raises ValueError when the option is expired,
    the price violates no-arbitrage bounds, or the price is so close to its
    upper bound that implied volatility diverges.
    """
    if option_type not in ("call", "put"):
        raise ValueError(f"option_type must be 'call' or 'put', got {option_type!r}")
    try:
        price = float(market_price)
    except (TypeError, ValueError):
        raise ValueError(f"market_price must be a number, got {market_price!r}") from None
    if not math.isfinite(price) or price < 0.0:
        raise ValueError(f"market_price must be finite and >= 0, got {market_price!r}")

    S, K, T, r, _ = _validate(S, K, T, r, 0.0)
    if T == 0.0:
        raise ValueError("cannot imply volatility for an expired option (T <= 0)")

    disc_k = K * math.exp(-r * T)
    if option_type == "call":
        floor, ceil = max(S - disc_k, 0.0), S
        price_fn = bs_call_price
    else:
        floor, ceil = max(disc_k - S, 0.0), disc_k
        price_fn = bs_put_price

    eps = 1e-12 * max(1.0, S, K)
    if price < floor - eps:
        raise ValueError(
            f"market_price {price} is below intrinsic floor {floor:.6f}; "
            f"no volatility can produce it")
    if price > ceil + eps:
        raise ValueError(
            f"market_price {price} exceeds upper no-arbitrage bound {ceil:.6f} "
            f"for this {option_type}")
    if price <= floor + eps:
        return 0.0
    if price >= ceil - eps:
        raise ValueError(
            f"market_price {price} is at the upper no-arbitrage bound; "
            f"implied volatility diverges")

    # --- Newton-Raphson, Brenner-Subrahmanyam seed ---
    sigma = max(1e-3, math.sqrt(2.0 * math.pi / T) * price / S)
    sqrt_t = math.sqrt(T)
    for _ in range(max_iter):
        diff = price_fn(S, K, T, r, sigma) - price
        if abs(diff) < tol:
            return sigma
        d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrt_t)
        vega = S * norm.pdf(d1) * sqrt_t
        if vega < 1e-10:
            break
        nxt = sigma - diff / vega
        if nxt <= SIGMA_MIN or nxt >= SIGMA_MAX_HARD:
            break
        if abs(nxt - sigma) < 1e-14:
            sigma = nxt
            break
        sigma = nxt

    # --- brentq fallback: price is strictly increasing in sigma, so
    # f(SIGMA_MIN) < 0 < f(hi) brackets the root once hi is high enough ---
    def f(s):
        return price_fn(S, K, T, r, s) - price

    hi = SIGMA_MAX_START
    while f(hi) < 0.0 and hi < SIGMA_MAX_HARD:
        hi = min(hi * 2.0, SIGMA_MAX_HARD)
    if f(hi) < 0.0:
        raise ValueError(
            f"implied volatility exceeds solver ceiling ({SIGMA_MAX_HARD:.0f}); "
            f"quote is not usable")
    return float(brentq(f, SIGMA_MIN, hi, xtol=1e-12, maxiter=200))
