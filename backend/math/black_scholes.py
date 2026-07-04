"""Black-Scholes pricing and analytic greeks for European options.

Conventions
-----------
- All prices are per share. Multiply by the contract multiplier (100)
  to get dollars per contract.
- T is time to expiry in years (calendar days / 365).
- r is the annualized continuously compounded risk-free rate.
- sigma is annualized volatility (0.20 = 20%).
- Greeks follow trader conventions:
    delta : price change per $1 move in the underlying
    gamma : delta change per $1 move in the underlying
    theta : price change per calendar day (annual theta / 365)
    vega  : price change per 1 percentage-point change in IV (raw / 100)
    rho   : price change per 1 percentage-point change in r (raw / 100)

Degenerate inputs are handled rather than rejected, because expiring and
zero-vol contracts show up routinely while screening:
- T <= 0     -> intrinsic value; step-function delta; other greeks 0
- sigma == 0 -> discounted-forward intrinsic; step delta; other greeks 0

Invalid inputs (S <= 0, K <= 0, sigma < 0, NaN/inf, non-numeric) raise
ValueError.
"""

from __future__ import annotations

import math

from scipy.stats import norm

DAYS_PER_YEAR = 365.0


def _validate(S, K, T, r, sigma):
    """Coerce inputs to floats, reject nonsense, clamp expired T to 0."""
    out = {}
    for name, value in (("S", S), ("K", K), ("T", T), ("r", r), ("sigma", sigma)):
        try:
            f = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be a number, got {value!r}") from None
        if not math.isfinite(f):
            raise ValueError(f"{name} must be finite, got {value!r}")
        out[name] = f
    if out["S"] <= 0.0:
        raise ValueError(f"S (underlying price) must be > 0, got {out['S']}")
    if out["K"] <= 0.0:
        raise ValueError(f"K (strike) must be > 0, got {out['K']}")
    if out["sigma"] < 0.0:
        raise ValueError(f"sigma must be >= 0, got {out['sigma']}")
    out["T"] = max(out["T"], 0.0)  # negative time-to-expiry means expired
    return out["S"], out["K"], out["T"], out["r"], out["sigma"]


def _d1_d2(S, K, T, r, sigma):
    sqrt_t = math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrt_t)
    return d1, d1 - sigma * sqrt_t


def bs_call_price(S, K, T, r, sigma) -> float:
    """European call price."""
    S, K, T, r, sigma = _validate(S, K, T, r, sigma)
    if T == 0.0:
        return max(S - K, 0.0)
    if sigma == 0.0:
        return max(S - K * math.exp(-r * T), 0.0)
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    return float(S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2))


def bs_put_price(S, K, T, r, sigma) -> float:
    """European put price."""
    S, K, T, r, sigma = _validate(S, K, T, r, sigma)
    if T == 0.0:
        return max(K - S, 0.0)
    if sigma == 0.0:
        return max(K * math.exp(-r * T) - S, 0.0)
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    return float(K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1))


def _degenerate_greeks(S, K, T, r, option_type):
    """Greeks when the option has no optionality left (T == 0 or sigma == 0)."""
    threshold = K * math.exp(-r * T) if T > 0.0 else K
    if S > threshold:
        call_delta = 1.0
    elif S < threshold:
        call_delta = 0.0
    else:
        call_delta = 0.5
    delta = call_delta if option_type == "call" else call_delta - 1.0
    return {"delta": delta, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}


def bs_call_greeks(S, K, T, r, sigma) -> dict:
    """Analytic call greeks (see module docstring for units)."""
    S, K, T, r, sigma = _validate(S, K, T, r, sigma)
    if T == 0.0 or sigma == 0.0:
        return _degenerate_greeks(S, K, T, r, "call")
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    sqrt_t = math.sqrt(T)
    pdf_d1 = norm.pdf(d1)
    disc = math.exp(-r * T)
    theta_annual = -S * pdf_d1 * sigma / (2.0 * sqrt_t) - r * K * disc * norm.cdf(d2)
    return {
        "delta": float(norm.cdf(d1)),
        "gamma": float(pdf_d1 / (S * sigma * sqrt_t)),
        "theta": float(theta_annual / DAYS_PER_YEAR),
        "vega": float(S * pdf_d1 * sqrt_t / 100.0),
        "rho": float(K * T * disc * norm.cdf(d2) / 100.0),
    }


def bs_put_greeks(S, K, T, r, sigma) -> dict:
    """Analytic put greeks (see module docstring for units)."""
    S, K, T, r, sigma = _validate(S, K, T, r, sigma)
    if T == 0.0 or sigma == 0.0:
        return _degenerate_greeks(S, K, T, r, "put")
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    sqrt_t = math.sqrt(T)
    pdf_d1 = norm.pdf(d1)
    disc = math.exp(-r * T)
    theta_annual = -S * pdf_d1 * sigma / (2.0 * sqrt_t) + r * K * disc * norm.cdf(-d2)
    return {
        "delta": float(norm.cdf(d1) - 1.0),
        "gamma": float(pdf_d1 / (S * sigma * sqrt_t)),
        "theta": float(theta_annual / DAYS_PER_YEAR),
        "vega": float(S * pdf_d1 * sqrt_t / 100.0),
        "rho": float(-K * T * disc * norm.cdf(-d2) / 100.0),
    }
