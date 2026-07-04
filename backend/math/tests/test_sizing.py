"""Position sizing: floor behavior, hard caps, and rejection of undefined risk."""

import pytest

from sizing import position_summary, risk_based_size


class TestRiskBasedSize:
    def test_basic_sizing_floors_to_whole_contracts(self):
        # $10,000 * 2% = $200 budget; $45 max loss -> 4 contracts
        assert risk_based_size(45.0, 10_000.0, 0.02) == 4

    def test_exact_division(self):
        assert risk_based_size(50.0, 10_000.0, 0.02) == 4

    def test_returns_zero_when_one_contract_exceeds_budget(self):
        assert risk_based_size(250.0, 10_000.0, 0.02) == 0

    def test_hard_cap_overrides_percentage_budget(self):
        # 2% of 100k = 2000, but the hard cap is 500 -> 2 contracts at 200
        assert risk_based_size(200.0, 100_000.0, 0.02, max_loss_dollars=500.0) == 2

    def test_cap_larger_than_budget_is_inert(self):
        assert risk_based_size(45.0, 10_000.0, 0.02, max_loss_dollars=1_000_000.0) == 4

    def test_full_risk_pct_allowed(self):
        assert risk_based_size(100.0, 1_000.0, 1.0) == 10

    @pytest.mark.parametrize("kwargs", [
        dict(max_loss_per_contract=0.0, account_equity=10_000.0),
        dict(max_loss_per_contract=-50.0, account_equity=10_000.0),
        dict(max_loss_per_contract=float("inf"), account_equity=10_000.0),
        dict(max_loss_per_contract=float("nan"), account_equity=10_000.0),
        dict(max_loss_per_contract=50.0, account_equity=0.0),
        dict(max_loss_per_contract=50.0, account_equity=-5.0),
        dict(max_loss_per_contract=50.0, account_equity=10_000.0, risk_pct=0.0),
        dict(max_loss_per_contract=50.0, account_equity=10_000.0, risk_pct=1.5),
        dict(max_loss_per_contract=50.0, account_equity=10_000.0, risk_pct=-0.02),
        dict(max_loss_per_contract=50.0, account_equity=10_000.0, max_loss_dollars=0.0),
        dict(max_loss_per_contract=50.0, account_equity=10_000.0, max_loss_dollars=-100.0),
        dict(max_loss_per_contract="lots", account_equity=10_000.0),
    ])
    def test_invalid_inputs_raise(self, kwargs):
        with pytest.raises(ValueError):
            risk_based_size(**kwargs)


class TestPositionSummary:
    def test_debit_position(self):
        s = position_summary(3, 230.0, 10_000.0)
        assert s == {"contracts": 3, "total_cost": 690.0,
                     "pct_of_account": pytest.approx(0.069)}

    def test_credit_position_uses_absolute_utilization(self):
        s = position_summary(2, -150.0, 10_000.0)
        assert s["total_cost"] == -300.0
        assert s["pct_of_account"] == pytest.approx(0.03)

    def test_zero_contracts(self):
        s = position_summary(0, 230.0, 10_000.0)
        assert s["total_cost"] == 0.0
        assert s["pct_of_account"] == 0.0

    @pytest.mark.parametrize("args", [
        (-1, 230.0, 10_000.0),
        (2.5, 230.0, 10_000.0),
        (3, 230.0, 0.0),
        (3, float("nan"), 10_000.0),
    ])
    def test_invalid_inputs_raise(self, args):
        with pytest.raises(ValueError):
            position_summary(*args)
