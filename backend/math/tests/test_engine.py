"""The JSON subprocess protocol the Node.js backend depends on."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ENGINE = Path(__file__).resolve().parents[1] / "engine.py"


def run_engine(payload) -> dict:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    proc = subprocess.run(
        [sys.executable, str(ENGINE)],
        input=text, capture_output=True, text=True, timeout=120,
    )
    assert proc.returncode == 0, f"engine crashed: {proc.stderr}"
    return json.loads(proc.stdout)


def test_price_call():
    resp = run_engine({"fn": "bs_call_price",
                       "args": {"S": 100, "K": 100, "T": 1, "r": 0.05, "sigma": 0.2}})
    assert resp["ok"] is True
    assert resp["result"] == pytest.approx(10.4506, abs=1e-4)


def test_greeks_have_all_five_keys():
    resp = run_engine({"fn": "bs_put_greeks",
                       "args": {"S": 100, "K": 100, "T": 1, "r": 0.05, "sigma": 0.2}})
    assert resp["ok"] is True
    assert set(resp["result"]) == {"delta", "gamma", "theta", "vega", "rho"}


def test_unbounded_max_profit_serializes_as_null():
    resp = run_engine({"fn": "payoff_summary", "args": {
        "legs": [{"type": "long_call", "strike": 100, "price": 5, "qty": 1}]}})
    assert resp["ok"] is True
    assert resp["result"]["max_profit"] is None      # null == unbounded
    assert resp["result"]["max_loss"] == pytest.approx(500.0)
    assert resp["result"]["breakevens"] == [pytest.approx(105.0)]


def test_implied_vol_round_trip():
    priced = run_engine({"fn": "bs_call_price",
                         "args": {"S": 100, "K": 110, "T": 0.5, "r": 0.03, "sigma": 0.4}})
    solved = run_engine({"fn": "implied_volatility",
                         "args": {"market_price": priced["result"], "S": 100,
                                  "K": 110, "T": 0.5, "r": 0.03,
                                  "option_type": "call"}})
    assert solved["ok"] is True
    assert solved["result"] == pytest.approx(0.4, abs=1e-6)


def test_domain_error_returns_ok_false_not_crash():
    resp = run_engine({"fn": "bs_call_price",
                       "args": {"S": -5, "K": 100, "T": 1, "r": 0.05, "sigma": 0.2}})
    assert resp["ok"] is False
    assert "S" in resp["error"]


def test_unknown_function():
    resp = run_engine({"fn": "monte_carlo_magic", "args": {}})
    assert resp["ok"] is False
    assert "unknown function" in resp["error"]


def test_malformed_json():
    resp = run_engine("this is not json {")
    assert resp["ok"] is False
    assert "invalid JSON" in resp["error"]


def test_missing_fn_key():
    resp = run_engine({"args": {}})
    assert resp["ok"] is False


def test_numpy_array_result_serializes_as_list():
    resp = run_engine({"fn": "multi_leg_payoff", "args": {
        "legs": [{"type": "long_call", "strike": 100, "price": 5, "qty": 1}],
        "underlying_prices": [90, 105, 120]}})
    assert resp["ok"] is True
    assert resp["result"] == [pytest.approx(-500.0), pytest.approx(0.0),
                              pytest.approx(1500.0)]
