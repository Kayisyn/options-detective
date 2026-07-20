"""Probability metrics: closed-form agreement for single legs, exact interval
math for spreads, and distribution sanity properties."""

import math

import pytest

from probability import prob_below, prob_itm, prob_max_profit, prob_of_profit

# Shared market context: S=100, six months, 25% vol, 3% rate
S, T, SIGMA, R = 100.0, 0.5, 0.25, 0.03

LONG_CALL = [{"type": "long_call", "strike": 100.0, "price": 5.0, "qty": 1}]
SHORT_PUT = [{"type": "short_put", "strike": 100.0, "price": 3.0, "qty": 1}]
BULL_CALL_SPREAD = [
    {"type": "long_call", "strike": 100.0, "price": 6.5, "qty": 1},
    {"type": "short_call", "strike": 105.0, "price": 4.5, "qty": 1},
]
IRON_CONDOR = [
    {"type": "long_put", "strike": 90.0, "price": 0.5, "qty": 1},
    {"type": "short_put", "strike": 95.0, "price": 1.2, "qty": 1},
    {"type": "short_call", "strike": 105.0, "price": 1.5, "qty": 1},
    {"type": "long_call", "strike": 110.0, "price": 0.7, "qty": 1},
]
LONG_STRADDLE = [
    {"type": "long_call", "strike": 100.0, "price": 4.5, "qty": 1},
    {"type": "long_put", "strike": 100.0, "price": 3.5, "qty": 1},
]
BUTTERFLY = [
    {"type": "long_call", "strike": 95.0, "price": 6.0, "qty": 1},
    {"type": "short_call", "strike": 100.0, "price": 3.0, "qty": 2},
    {"type": "long_call", "strike": 105.0, "price": 1.0, "qty": 1},
]
COVERED_CALL = [
    {"type": "long_stock", "price": 100.0, "qty": 100},
    {"type": "short_call", "strike": 105.0, "price": 2.0, "qty": 1},
]


class TestDistribution:
    def test_itm_probabilities_are_complementary(self):
        p_call = prob_itm(S, 105.0, T, SIGMA, R, "call")
        p_put = prob_itm(S, 105.0, T, SIGMA, R, "put")
        assert p_call + p_put == pytest.approx(1.0, abs=1e-12)

    def test_extreme_strikes(self):
        assert prob_itm(S, 1.0, T, SIGMA, R, "call") == pytest.approx(1.0, abs=1e-9)
        assert prob_itm(S, 10_000.0, T, SIGMA, R, "call") == pytest.approx(0.0, abs=1e-9)

    def test_prob_itm_call_decreasing_in_strike(self):
        probs = [prob_itm(S, k, T, SIGMA, R, "call") for k in range(70, 131, 5)]
        assert all(a > b for a, b in zip(probs, probs[1:]))

    def test_median_of_lognormal(self):
        median = S * math.exp((R - 0.5 * SIGMA * SIGMA) * T)
        assert prob_below(S, median, T, SIGMA, R) == pytest.approx(0.5, abs=1e-12)

    def test_deterministic_when_vol_is_zero(self):
        forward = S * math.exp(R * T)  # 101.51
        assert prob_itm(S, 101.0, T, 0.0, R, "call") == 1.0
        assert prob_itm(S, 102.0, T, 0.0, R, "call") == 0.0
        assert forward == pytest.approx(101.5113, abs=1e-4)

    def test_deterministic_at_expiry(self):
        assert prob_itm(100.0, 99.0, 0.0, 0.25, 0.0, "call") == 1.0
        assert prob_itm(100.0, 101.0, 0.0, 0.25, 0.0, "put") == 1.0

    def test_bad_option_type_raises(self):
        with pytest.raises(ValueError, match="option_type"):
            prob_itm(S, 100.0, T, SIGMA, R, "future")


class TestProbOfProfit:
    """POP must equal the closed-form lognormal probability of the
    profitable region derived from exact breakevens."""

    def test_long_call_pop(self):
        expected = 1.0 - prob_below(S, 105.0, T, SIGMA, R)  # above K + premium
        assert prob_of_profit(LONG_CALL, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_short_put_pop(self):
        expected = 1.0 - prob_below(S, 97.0, T, SIGMA, R)  # above K - credit
        assert prob_of_profit(SHORT_PUT, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_bull_call_spread_pop(self):
        expected = 1.0 - prob_below(S, 102.0, T, SIGMA, R)  # above K_long + debit
        assert prob_of_profit(BULL_CALL_SPREAD, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_iron_condor_pop(self):
        expected = prob_below(S, 106.5, T, SIGMA, R) - prob_below(S, 93.5, T, SIGMA, R)
        assert prob_of_profit(IRON_CONDOR, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_long_straddle_pop(self):
        expected = (prob_below(S, 92.0, T, SIGMA, R)
                    + 1.0 - prob_below(S, 108.0, T, SIGMA, R))
        assert prob_of_profit(LONG_STRADDLE, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_always_profitable_position(self):
        arb = [
            {"type": "long_call", "strike": 100.0, "price": 3.0, "qty": 1},
            {"type": "short_call", "strike": 100.0, "price": 5.0, "qty": 1},
        ]
        assert prob_of_profit(arb, S, T, SIGMA, R) == 1.0

    def test_never_profitable_position(self):
        arb = [
            {"type": "long_call", "strike": 100.0, "price": 5.0, "qty": 1},
            {"type": "short_call", "strike": 100.0, "price": 3.0, "qty": 1},
        ]
        assert prob_of_profit(arb, S, T, SIGMA, R) == 0.0

    @pytest.mark.parametrize("legs", [
        LONG_CALL, SHORT_PUT, BULL_CALL_SPREAD, IRON_CONDOR,
        LONG_STRADDLE, BUTTERFLY, COVERED_CALL,
    ])
    def test_pop_within_unit_interval(self, legs):
        pop = prob_of_profit(legs, S, T, SIGMA, R)
        assert 0.0 <= pop <= 1.0


class TestProbMaxProfit:
    def test_unbounded_max_profit_gives_zero(self):
        assert prob_max_profit(LONG_CALL, S, T, SIGMA, R) == 0.0

    def test_bull_call_spread(self):
        expected = 1.0 - prob_below(S, 105.0, T, SIGMA, R)  # at or above short strike
        assert prob_max_profit(BULL_CALL_SPREAD, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_short_put(self):
        expected = 1.0 - prob_below(S, 100.0, T, SIGMA, R)
        assert prob_max_profit(SHORT_PUT, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_iron_condor(self):
        expected = prob_below(S, 105.0, T, SIGMA, R) - prob_below(S, 95.0, T, SIGMA, R)
        assert prob_max_profit(IRON_CONDOR, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_covered_call(self):
        expected = 1.0 - prob_below(S, 105.0, T, SIGMA, R)
        assert prob_max_profit(COVERED_CALL, S, T, SIGMA, R) == pytest.approx(expected, abs=1e-12)

    def test_butterfly_peak_is_measure_zero(self):
        assert prob_max_profit(BUTTERFLY, S, T, SIGMA, R) == 0.0

    def test_prob_max_profit_never_exceeds_pop_for_credit_structures(self):
        # finishing at max profit implies finishing profitable for these
        for legs in (BULL_CALL_SPREAD, IRON_CONDOR, SHORT_PUT):
            pmp = prob_max_profit(legs, S, T, SIGMA, R)
            pop = prob_of_profit(legs, S, T, SIGMA, R)
            assert pmp <= pop + 1e-12
