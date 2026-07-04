"""IV solver: round-trips price -> sigma -> price across a wide grid,
plus every rejection path."""

import math

import pytest

from black_scholes import bs_call_price, bs_put_price
from iv_solver import implied_volatility

RT_GRID = [
    (S, K, T, r, sigma)
    for S in (100.0,)
    for K in (60.0, 85.0, 100.0, 115.0, 160.0)
    for T in (1 / 365, 7 / 365, 0.25, 1.0, 2.0)
    for r in (0.0, 0.05)
    for sigma in (0.05, 0.20, 0.60, 1.50, 3.00)
]

# Below this much time value the price carries no recoverable vol information
# at double precision, so we only require the price round-trip, not sigma.
INFORMATIVE = 1e-3


@pytest.mark.parametrize("S,K,T,r,sigma", RT_GRID)
def test_call_round_trip(S, K, T, r, sigma):
    price = bs_call_price(S, K, T, r, sigma)
    floor = max(S - K * math.exp(-r * T), 0.0)
    iv = implied_volatility(price, S, K, T, r, "call")
    # the solver's core promise: reproduce the input price
    assert bs_call_price(S, K, T, r, iv) == pytest.approx(price, abs=1e-7)
    # and recover the vol wherever the price actually contains it
    if price - floor > INFORMATIVE and S - price > INFORMATIVE:
        assert iv == pytest.approx(sigma, rel=1e-4, abs=1e-5)


@pytest.mark.parametrize("S,K,T,r,sigma", RT_GRID)
def test_put_round_trip(S, K, T, r, sigma):
    price = bs_put_price(S, K, T, r, sigma)
    disc_k = K * math.exp(-r * T)
    floor = max(disc_k - S, 0.0)
    iv = implied_volatility(price, S, K, T, r, "put")
    assert bs_put_price(S, K, T, r, iv) == pytest.approx(price, abs=1e-7)
    if price - floor > INFORMATIVE and disc_k - price > INFORMATIVE:
        assert iv == pytest.approx(sigma, rel=1e-4, abs=1e-5)


def test_one_day_atm_option():
    sigma = 0.35
    price = bs_call_price(500.0, 500.0, 1 / 365, 0.04, sigma)
    iv = implied_volatility(price, 500.0, 500.0, 1 / 365, 0.04, "call")
    assert iv == pytest.approx(sigma, abs=1e-8)


def test_very_high_vol_expands_bracket():
    sigma = 6.0  # beyond the 5.0 starting bracket
    price = bs_call_price(100.0, 100.0, 1.0, 0.0, sigma)
    iv = implied_volatility(price, 100.0, 100.0, 1.0, 0.0, "call")
    assert iv == pytest.approx(sigma, rel=1e-6)


def test_price_at_intrinsic_floor_returns_zero_vol():
    # deep ITM call priced exactly at discounted intrinsic
    S, K, T, r = 150.0, 100.0, 0.5, 0.05
    floor = S - K * math.exp(-r * T)
    assert implied_volatility(floor, S, K, T, r, "call") == 0.0


def test_price_below_intrinsic_raises():
    S, K, T, r = 150.0, 100.0, 0.5, 0.05  # floor ~= 52.47
    with pytest.raises(ValueError, match="below intrinsic"):
        implied_volatility(40.0, S, K, T, r, "call")


def test_price_above_upper_bound_raises():
    with pytest.raises(ValueError, match="exceeds upper no-arbitrage bound"):
        implied_volatility(101.0, 100.0, 100.0, 1.0, 0.05, "call")
    with pytest.raises(ValueError, match="exceeds upper no-arbitrage bound"):
        implied_volatility(120.0, 100.0, 100.0, 1.0, 0.05, "put")


def test_expired_option_raises():
    with pytest.raises(ValueError, match="expired"):
        implied_volatility(5.0, 100.0, 100.0, 0.0, 0.05, "call")


def test_negative_price_raises():
    with pytest.raises(ValueError):
        implied_volatility(-1.0, 100.0, 100.0, 1.0, 0.05, "call")


def test_bad_option_type_raises():
    with pytest.raises(ValueError, match="option_type"):
        implied_volatility(5.0, 100.0, 100.0, 1.0, 0.05, "swaption")


def test_non_numeric_price_raises():
    with pytest.raises(ValueError):
        implied_volatility("expensive", 100.0, 100.0, 1.0, 0.05, "call")
