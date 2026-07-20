"""Black-Scholes pricing and greeks: golden values, no-arbitrage properties,
and analytic greeks verified against finite differences."""

import math

import pytest

from black_scholes import (bs_call_greeks, bs_call_price, bs_put_greeks,
                           bs_put_price)

ATM = dict(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.20)

GRID = [
    (S, K, T, r, sigma)
    for S in (80.0, 100.0, 123.45)
    for K in (90.0, 100.0, 110.0)
    for T in (7 / 365, 0.25, 1.0, 2.0)
    for r in (0.0, 0.05)
    for sigma in (0.08, 0.25, 0.60)
]

FD_POINTS = [
    (100.0, 100.0, 1.0, 0.05, 0.20),
    (100.0, 90.0, 0.5, 0.02, 0.35),
    (50.0, 60.0, 0.25, 0.00, 0.45),
    (250.0, 240.0, 30 / 365, 0.04, 0.18),
    (100.0, 140.0, 1.5, 0.03, 0.60),
]


class TestGoldenValues:
    """Values published in Hull, 'Options, Futures, and Other Derivatives'."""

    def test_atm_call(self):
        assert bs_call_price(**ATM) == pytest.approx(10.4506, abs=1e-4)

    def test_atm_put(self):
        assert bs_put_price(**ATM) == pytest.approx(5.5735, abs=1e-4)

    def test_hull_example(self):
        # S=42, K=40, r=10%, sigma=20%, T=0.5 -> c=4.76, p=0.81
        assert bs_call_price(42, 40, 0.5, 0.10, 0.20) == pytest.approx(4.76, abs=5e-3)
        assert bs_put_price(42, 40, 0.5, 0.10, 0.20) == pytest.approx(0.81, abs=5e-3)

    def test_atm_call_greeks(self):
        g = bs_call_greeks(**ATM)
        assert g["delta"] == pytest.approx(0.6368, abs=1e-4)
        assert g["gamma"] == pytest.approx(0.018762, abs=1e-5)
        assert g["vega"] == pytest.approx(0.37524, abs=1e-4)   # per 1% IV
        assert g["theta"] == pytest.approx(-0.017573, abs=1e-5)  # per day
        assert g["rho"] == pytest.approx(0.53232, abs=1e-4)    # per 1% rate

    def test_atm_put_greeks(self):
        g = bs_put_greeks(**ATM)
        assert g["delta"] == pytest.approx(-0.3632, abs=1e-4)
        assert g["theta"] == pytest.approx(-0.004542, abs=1e-5)
        assert g["rho"] == pytest.approx(-0.41890, abs=1e-4)


class TestNoArbitrageProperties:
    @pytest.mark.parametrize("S,K,T,r,sigma", GRID)
    def test_put_call_parity(self, S, K, T, r, sigma):
        c = bs_call_price(S, K, T, r, sigma)
        p = bs_put_price(S, K, T, r, sigma)
        assert c - p == pytest.approx(S - K * math.exp(-r * T), abs=1e-9)

    @pytest.mark.parametrize("S,K,T,r,sigma", GRID)
    def test_call_within_bounds(self, S, K, T, r, sigma):
        c = bs_call_price(S, K, T, r, sigma)
        assert c >= max(S - K * math.exp(-r * T), 0.0) - 1e-12
        assert c <= S + 1e-12

    @pytest.mark.parametrize("S,K,T,r,sigma", GRID)
    def test_put_within_bounds(self, S, K, T, r, sigma):
        p = bs_put_price(S, K, T, r, sigma)
        assert p >= max(K * math.exp(-r * T) - S, 0.0) - 1e-12
        assert p <= K * math.exp(-r * T) + 1e-12

    def test_call_decreasing_in_strike(self):
        prices = [bs_call_price(100, k, 0.5, 0.03, 0.30) for k in range(60, 141, 5)]
        assert all(a > b for a, b in zip(prices, prices[1:]))

    def test_put_increasing_in_strike(self):
        prices = [bs_put_price(100, k, 0.5, 0.03, 0.30) for k in range(60, 141, 5)]
        assert all(a < b for a, b in zip(prices, prices[1:]))

    def test_prices_increasing_in_vol(self):
        vols = [0.05, 0.10, 0.20, 0.40, 0.80, 1.60]
        calls = [bs_call_price(100, 110, 0.5, 0.03, v) for v in vols]
        puts = [bs_put_price(100, 90, 0.5, 0.03, v) for v in vols]
        assert all(a < b for a, b in zip(calls, calls[1:]))
        assert all(a < b for a, b in zip(puts, puts[1:]))

    def test_call_increasing_in_expiry_when_r_nonnegative(self):
        expiries = [7 / 365, 0.1, 0.25, 0.5, 1.0, 2.0]
        calls = [bs_call_price(100, 100, t, 0.05, 0.25) for t in expiries]
        assert all(a < b for a, b in zip(calls, calls[1:]))


class TestGreeksAgainstFiniteDifferences:
    """The analytic greeks must match bump-and-reprice to high precision."""

    @pytest.mark.parametrize("S,K,T,r,sigma", FD_POINTS)
    @pytest.mark.parametrize("kind", ["call", "put"])
    def test_greeks_match_numerical(self, S, K, T, r, sigma, kind):
        price = bs_call_price if kind == "call" else bs_put_price
        greeks = (bs_call_greeks if kind == "call" else bs_put_greeks)(S, K, T, r, sigma)

        h_s = S * 1e-4
        delta_fd = (price(S + h_s, K, T, r, sigma)
                    - price(S - h_s, K, T, r, sigma)) / (2 * h_s)
        gamma_fd = (price(S + h_s, K, T, r, sigma)
                    - 2 * price(S, K, T, r, sigma)
                    + price(S - h_s, K, T, r, sigma)) / (h_s * h_s)
        h_v = 1e-5
        vega_fd = (price(S, K, T, r, sigma + h_v)
                   - price(S, K, T, r, sigma - h_v)) / (2 * h_v) / 100.0
        h_r = 1e-6
        rho_fd = (price(S, K, T, r + h_r, sigma)
                  - price(S, K, T, r - h_r, sigma)) / (2 * h_r) / 100.0
        h_t = 1e-6
        theta_fd = -(price(S, K, T + h_t, r, sigma)
                     - price(S, K, T - h_t, r, sigma)) / (2 * h_t) / 365.0

        assert greeks["delta"] == pytest.approx(delta_fd, rel=1e-4, abs=1e-7)
        assert greeks["gamma"] == pytest.approx(gamma_fd, rel=1e-3, abs=1e-7)
        assert greeks["vega"] == pytest.approx(vega_fd, rel=1e-4, abs=1e-9)
        assert greeks["rho"] == pytest.approx(rho_fd, rel=1e-4, abs=1e-9)
        assert greeks["theta"] == pytest.approx(theta_fd, rel=1e-4, abs=1e-9)

    @pytest.mark.parametrize("S,K,T,r,sigma", FD_POINTS)
    def test_call_put_greek_relationships(self, S, K, T, r, sigma):
        c = bs_call_greeks(S, K, T, r, sigma)
        p = bs_put_greeks(S, K, T, r, sigma)
        assert c["delta"] - p["delta"] == pytest.approx(1.0, abs=1e-12)
        assert c["gamma"] == pytest.approx(p["gamma"], abs=1e-12)
        assert c["vega"] == pytest.approx(p["vega"], abs=1e-12)


class TestEdgeCases:
    def test_expired_options_are_intrinsic(self):
        assert bs_call_price(105, 100, 0.0, 0.05, 0.2) == 5.0
        assert bs_call_price(95, 100, 0.0, 0.05, 0.2) == 0.0
        assert bs_put_price(95, 100, 0.0, 0.05, 0.2) == 5.0
        assert bs_put_price(105, 100, 0.0, 0.05, 0.2) == 0.0

    def test_negative_expiry_treated_as_expired(self):
        assert bs_call_price(105, 100, -0.3, 0.05, 0.2) == 5.0

    def test_zero_vol_is_discounted_intrinsic(self):
        expected = 100.0 - 100.0 * math.exp(-0.05)
        assert bs_call_price(100, 100, 1.0, 0.05, 0.0) == pytest.approx(expected, abs=1e-12)
        assert bs_put_price(100, 100, 1.0, 0.05, 0.0) == 0.0

    def test_expired_greeks_are_degenerate(self):
        g = bs_call_greeks(105, 100, 0.0, 0.05, 0.2)
        assert g == {"delta": 1.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
        g = bs_put_greeks(105, 100, 0.0, 0.05, 0.2)
        assert g["delta"] == 0.0

    def test_zero_vol_greeks_use_forward_moneyness(self):
        # S=100 vs discounted strike 95.12: forward ITM call
        g = bs_call_greeks(100, 100, 1.0, 0.05, 0.0)
        assert g["delta"] == 1.0
        g = bs_put_greeks(100, 100, 1.0, 0.05, 0.0)
        assert g["delta"] == 0.0

    @pytest.mark.parametrize("bad", [
        {"S": -1.0}, {"S": 0.0}, {"K": 0.0}, {"K": -10.0}, {"sigma": -0.2},
        {"S": float("nan")}, {"T": float("inf")}, {"K": None}, {"r": "abc"},
    ])
    def test_invalid_inputs_raise(self, bad):
        kwargs = {**ATM, **bad}
        with pytest.raises(ValueError):
            bs_call_price(**kwargs)
        with pytest.raises(ValueError):
            bs_put_price(**kwargs)
        with pytest.raises(ValueError):
            bs_call_greeks(**kwargs)
        with pytest.raises(ValueError):
            bs_put_greeks(**kwargs)
