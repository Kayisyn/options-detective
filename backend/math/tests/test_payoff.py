"""Payoff engine: exact P&L, breakevens, max profit/loss for every strategy
family the Detector screens (long/short singles, verticals, iron condors,
straddles/strangles, covered calls, butterflies)."""

import math

import numpy as np
import pytest

from payoff import (multi_leg_payoff, payoff_at, payoff_curve, payoff_summary)

LONG_CALL = [{"type": "long_call", "strike": 100.0, "price": 5.0, "qty": 1}]
SHORT_CALL = [{"type": "short_call", "strike": 100.0, "price": 5.0, "qty": 1}]
LONG_PUT = [{"type": "long_put", "strike": 100.0, "price": 4.0, "qty": 1}]
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
SHORT_STRANGLE = [
    {"type": "short_put", "strike": 95.0, "price": 2.0, "qty": 1},
    {"type": "short_call", "strike": 105.0, "price": 2.0, "qty": 1},
]
COVERED_CALL = [
    {"type": "long_stock", "price": 100.0, "qty": 100},
    {"type": "short_call", "strike": 105.0, "price": 2.0, "qty": 1},
]
BUTTERFLY = [
    {"type": "long_call", "strike": 95.0, "price": 6.0, "qty": 1},
    {"type": "short_call", "strike": 100.0, "price": 3.0, "qty": 2},
    {"type": "long_call", "strike": 105.0, "price": 1.0, "qty": 1},
]


class TestMultiLegPayoff:
    def test_long_call_values(self):
        result = multi_leg_payoff(LONG_CALL, [80.0, 100.0, 105.0, 120.0])
        assert result == pytest.approx([-500.0, -500.0, 0.0, 1500.0])

    def test_returns_numpy_array_matching_input_length(self):
        prices = np.linspace(50, 150, 41)
        result = multi_leg_payoff(LONG_CALL, prices)
        assert isinstance(result, np.ndarray)
        assert result.shape == prices.shape

    def test_scalar_input(self):
        assert payoff_at(LONG_CALL, 110.0) == pytest.approx(500.0)

    def test_qty_scales_linearly(self):
        doubled = [{**LONG_CALL[0], "qty": 2}]
        assert payoff_at(doubled, 120.0) == pytest.approx(2 * payoff_at(LONG_CALL, 120.0))

    def test_multiplier_override(self):
        assert payoff_at(LONG_CALL, 120.0, multiplier=1) == pytest.approx(15.0)

    def test_side_kind_format_equivalent_to_compound_type(self):
        compound = payoff_at(BULL_CALL_SPREAD, 103.0)
        split = payoff_at([
            {"type": "call", "side": "long", "strike": 100.0, "premium": 6.5, "qty": 1},
            {"type": "call", "side": "short", "strike": 105.0, "premium": 4.5, "qty": 1},
        ], 103.0)
        assert compound == pytest.approx(split)

    def test_short_side_is_mirror_of_long(self):
        prices = [80.0, 100.0, 105.0, 120.0]
        long_pnl = multi_leg_payoff(LONG_CALL, prices)
        short_pnl = multi_leg_payoff(SHORT_CALL, prices)
        assert long_pnl == pytest.approx(-short_pnl)


class TestPayoffSummary:
    def test_long_call(self):
        s = payoff_summary(LONG_CALL)
        assert s["breakevens"] == pytest.approx([105.0])
        assert s["max_profit"] == math.inf
        assert s["max_loss"] == pytest.approx(500.0)

    def test_short_call_has_unbounded_loss(self):
        s = payoff_summary(SHORT_CALL)
        assert s["breakevens"] == pytest.approx([105.0])
        assert s["max_profit"] == pytest.approx(500.0)
        assert s["max_loss"] == math.inf

    def test_long_put(self):
        s = payoff_summary(LONG_PUT)
        assert s["breakevens"] == pytest.approx([96.0])
        assert s["max_profit"] == pytest.approx(9600.0)  # stock to zero
        assert s["max_loss"] == pytest.approx(400.0)

    def test_short_put(self):
        s = payoff_summary(SHORT_PUT)
        assert s["breakevens"] == pytest.approx([97.0])
        assert s["max_profit"] == pytest.approx(300.0)
        assert s["max_loss"] == pytest.approx(9700.0)

    def test_bull_call_spread(self):
        s = payoff_summary(BULL_CALL_SPREAD)  # net debit 2.00
        assert s["breakevens"] == pytest.approx([102.0])
        assert s["max_profit"] == pytest.approx(300.0)   # width 5 - debit 2
        assert s["max_loss"] == pytest.approx(200.0)

    def test_iron_condor(self):
        s = payoff_summary(IRON_CONDOR)  # net credit 1.50
        assert s["breakevens"] == pytest.approx([93.5, 106.5])
        assert s["max_profit"] == pytest.approx(150.0)
        assert s["max_loss"] == pytest.approx(350.0)     # width 5 - credit 1.5

    def test_long_straddle(self):
        s = payoff_summary(LONG_STRADDLE)  # total debit 8.00
        assert s["breakevens"] == pytest.approx([92.0, 108.0])
        assert s["max_profit"] == math.inf
        assert s["max_loss"] == pytest.approx(800.0)

    def test_short_strangle(self):
        s = payoff_summary(SHORT_STRANGLE)  # total credit 4.00
        assert s["breakevens"] == pytest.approx([91.0, 109.0])
        assert s["max_profit"] == pytest.approx(400.0)
        assert s["max_loss"] == math.inf

    def test_covered_call(self):
        s = payoff_summary(COVERED_CALL)
        assert s["breakevens"] == pytest.approx([98.0])
        assert s["max_profit"] == pytest.approx(700.0)   # 5 upside + 2 premium
        assert s["max_loss"] == pytest.approx(9800.0)    # stock to zero less premium

    def test_butterfly(self):
        s = payoff_summary(BUTTERFLY)  # net debit 1.00
        assert s["breakevens"] == pytest.approx([96.0, 104.0])
        assert s["max_profit"] == pytest.approx(400.0)   # at the middle strike
        assert s["max_loss"] == pytest.approx(100.0)

    def test_touching_zero_counts_as_breakeven(self):
        free_call = [{"type": "long_call", "strike": 100.0, "price": 0.0, "qty": 1}]
        s = payoff_summary(free_call)
        assert s["breakevens"] == pytest.approx([100.0])
        assert s["max_loss"] == 0.0

    def test_constant_positive_position_has_no_breakevens(self):
        arb = [
            {"type": "long_call", "strike": 100.0, "price": 3.0, "qty": 1},
            {"type": "short_call", "strike": 100.0, "price": 5.0, "qty": 1},
        ]
        s = payoff_summary(arb)
        assert s["breakevens"] == []
        assert s["max_profit"] == pytest.approx(200.0)
        assert s["max_loss"] == 0.0


class TestPayoffCurve:
    def test_curve_covers_strikes_and_has_requested_points(self):
        curve = payoff_curve(BULL_CALL_SPREAD, current_price=102.0, num_points=51)
        assert len(curve) == 51
        prices = [pt["underlyingPrice"] for pt in curve]
        assert min(prices) <= 90.0 * 1.0 + 0.5   # below lowest strike * 0.9 margin
        assert max(prices) >= 105.0 * 1.10 - 1e-9
        assert all(set(pt) == {"underlyingPrice", "profit"} for pt in curve)

    def test_curve_profits_match_payoff_at(self):
        curve = payoff_curve(IRON_CONDOR, current_price=100.0, num_points=21)
        for pt in curve:
            assert pt["profit"] == pytest.approx(
                payoff_at(IRON_CONDOR, pt["underlyingPrice"]))

    def test_stock_only_requires_current_price(self):
        with pytest.raises(ValueError, match="current_price"):
            payoff_curve([{"type": "long_stock", "price": 100.0, "qty": 100}])


class TestValidation:
    def test_empty_legs_raises(self):
        with pytest.raises(ValueError, match="at least one leg"):
            multi_leg_payoff([], [100.0])

    @pytest.mark.parametrize("bad_leg", [
        {"type": "long_call", "price": 5.0},                       # missing strike
        {"type": "long_call", "strike": -5.0, "price": 5.0},       # bad strike
        {"type": "long_call", "strike": 100.0, "price": -1.0},     # negative price
        {"type": "long_call", "strike": 100.0, "price": 5.0, "qty": 0},
        {"type": "long_call", "strike": 100.0, "price": 5.0, "qty": -2},
        {"type": "long_call", "strike": 100.0, "price": 5.0, "qty": 1.5},
        {"type": "long_swap", "strike": 100.0, "price": 5.0},      # unknown kind
        {"type": "sideways_call", "strike": 100.0, "price": 5.0},  # unknown side
        "not a dict",
    ])
    def test_bad_legs_raise(self, bad_leg):
        with pytest.raises(ValueError):
            multi_leg_payoff([bad_leg], [100.0])

    def test_negative_underlying_price_raises(self):
        with pytest.raises(ValueError, match="finite and >= 0"):
            multi_leg_payoff(LONG_CALL, [-10.0])
