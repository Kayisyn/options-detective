"""Offline tests for the yfinance adapter's pure normalization and IV-rank
logic. Live-network fetch is covered by an opt-in smoke test
(set OD_LIVE_TESTS=1)."""

import json
import math
import os
import subprocess
import sys
from pathlib import Path

import pytest

from market_data import (atm_iv, iv_rank, normalize_contracts,
                         realized_vol_series)

NAN = float("nan")


class TestNormalizeContracts:
    def test_two_sided_book_uses_midpoint_and_spread(self):
        [c] = normalize_contracts([{
            "strike": 100.0, "bid": 4.90, "ask": 5.10, "lastPrice": 4.85,
            "volume": 320, "openInterest": 1500, "impliedVolatility": 0.22,
            "lastTradeDate": "2026-07-02 19:59:00+00:00",
        }])
        assert c["mid"] == pytest.approx(5.00)
        assert c["spreadPct"] == pytest.approx(0.04)
        assert c["volume"] == 320 and c["openInterest"] == 1500
        assert c["timestamp"].startswith("2026-07-02")

    def test_empty_book_falls_back_to_last_price_without_spread(self):
        [c] = normalize_contracts([{
            "strike": 100.0, "bid": 0.0, "ask": 0.0, "lastPrice": 3.20,
            "volume": 10, "openInterest": 50, "impliedVolatility": 0.30,
        }])
        assert c["mid"] == pytest.approx(3.20)
        assert c["spreadPct"] is None  # no two-sided book -> liquidity gate decides

    def test_no_price_information_gives_null_mid(self):
        [c] = normalize_contracts([{"strike": 100.0, "bid": 0, "ask": 0, "lastPrice": 0}])
        assert c["mid"] is None

    def test_nan_junk_from_pandas_is_cleaned(self):
        [c] = normalize_contracts([{
            "strike": 95.0, "bid": NAN, "ask": NAN, "lastPrice": 2.5,
            "volume": NAN, "openInterest": NAN, "impliedVolatility": NAN,
        }])
        assert c["bid"] == 0.0 and c["ask"] == 0.0
        assert c["volume"] == 0 and c["openInterest"] == 0
        assert c["impliedVolatility"] is None

    def test_bad_strikes_dropped_and_output_sorted(self):
        rows = [{"strike": s, "bid": 1.0, "ask": 1.2, "lastPrice": 1.1}
                for s in (110.0, NAN, 90.0, -5.0, 100.0)]
        strikes = [c["strike"] for c in normalize_contracts(rows)]
        assert strikes == [90.0, 100.0, 110.0]

    def test_crossed_book_treated_as_no_book(self):
        [c] = normalize_contracts([{"strike": 100.0, "bid": 5.0, "ask": 4.0, "lastPrice": 4.5}])
        assert c["mid"] == pytest.approx(4.5)  # falls back to last
        assert c["spreadPct"] is None

    def test_nonpositive_iv_is_nulled(self):
        [c] = normalize_contracts([{"strike": 100.0, "bid": 1, "ask": 1.1,
                                    "lastPrice": 1, "impliedVolatility": 0.0}])
        assert c["impliedVolatility"] is None

    def test_timestamp_objects_serialize_as_iso8601(self):
        from datetime import datetime, timezone
        ts = datetime(2026, 7, 2, 19, 59, tzinfo=timezone.utc)  # pandas
        # Timestamps also expose .isoformat(), which is the path under test
        [c] = normalize_contracts([{"strike": 100.0, "bid": 1, "ask": 1.1,
                                    "lastPrice": 1, "lastTradeDate": ts}])
        assert c["timestamp"] == "2026-07-02T19:59:00+00:00"


class TestAtmIv:
    CHAIN = {
        "calls": [{"strike": 95.0, "impliedVolatility": 0.30},
                  {"strike": 100.0, "impliedVolatility": 0.25},
                  {"strike": 105.0, "impliedVolatility": 0.28}],
        "puts": [{"strike": 100.0, "impliedVolatility": 0.27},
                 {"strike": 105.0, "impliedVolatility": None}],
    }

    def test_averages_nearest_call_and_put(self):
        assert atm_iv(self.CHAIN, 101.0) == pytest.approx((0.25 + 0.27) / 2)

    def test_ignores_contracts_without_iv(self):
        chain = {"calls": [{"strike": 100.0, "impliedVolatility": 0.25}],
                 "puts": [{"strike": 100.0, "impliedVolatility": None}]}
        assert atm_iv(chain, 100.0) == pytest.approx(0.25)

    def test_none_when_no_ivs_anywhere(self):
        assert atm_iv({"calls": [], "puts": []}, 100.0) is None


class TestIvRank:
    def test_rolling_window_length(self):
        closes = [100.0 * (1.001 ** i) for i in range(60)]
        vols = realized_vol_series(closes, window=21)
        assert len(vols) == 59 - 21 + 1  # 59 returns, rolling 21

    def test_constant_growth_has_zero_vol(self):
        closes = [100.0 * (1.001 ** i) for i in range(60)]
        vols = realized_vol_series(closes, window=21)
        assert all(v == pytest.approx(0.0, abs=1e-12) for v in vols)

    def test_rank_positions_within_range(self):
        vols = [0.10, 0.20, 0.30, 0.40, 0.50] * 5  # lo=0.1, hi=0.5
        assert iv_rank(0.30, vols) == pytest.approx(50.0)
        assert iv_rank(0.10, vols) == 0.0
        assert iv_rank(0.50, vols) == 100.0

    def test_rank_clips_outside_range(self):
        vols = [0.10, 0.50] * 12
        assert iv_rank(0.05, vols) == 0.0
        assert iv_rank(0.90, vols) == 100.0

    def test_flat_history_returns_midpoint(self):
        assert iv_rank(0.25, [0.2] * 30) == 50.0

    def test_insufficient_history_returns_none(self):
        assert iv_rank(0.25, [0.2] * 5) is None
        assert iv_rank(None, [0.2] * 30) is None

    def test_realized_vol_magnitude_is_sane(self):
        # alternating +1%/-1% daily moves -> ~16% annualized (0.01 * sqrt(252))
        closes, price = [], 100.0
        for i in range(60):
            price *= 1.01 if i % 2 == 0 else 1 / 1.01
            closes.append(price)
        vols = realized_vol_series(closes)
        assert vols[-1] == pytest.approx(0.01 * math.sqrt(252), rel=0.05)


class TestCliProtocol:
    SCRIPT = Path(__file__).resolve().parents[1] / "market_data.py"

    def run_cli(self, payload):
        text = payload if isinstance(payload, str) else json.dumps(payload)
        proc = subprocess.run([sys.executable, str(self.SCRIPT)], input=text,
                              capture_output=True, text=True, timeout=120)
        assert proc.returncode == 0, f"adapter crashed: {proc.stderr}"
        return json.loads(proc.stdout)

    def test_missing_symbol_is_domain_error(self):
        resp = self.run_cli({"max_expirations": 4})
        assert resp["ok"] is False and "symbol" in resp["error"]

    def test_malformed_json_is_domain_error(self):
        resp = self.run_cli("{nope")
        assert resp["ok"] is False and "invalid JSON" in resp["error"]

    @pytest.mark.skipif(os.environ.get("OD_LIVE_TESTS") != "1",
                        reason="set OD_LIVE_TESTS=1 to hit Yahoo Finance")
    def test_live_fetch_aapl(self):
        resp = self.run_cli({"symbol": "AAPL", "max_expirations": 2})
        assert resp["ok"] is True, resp.get("error")
        data = resp["result"]
        assert data["price"] > 0
        assert len(data["expirations"]) == 2
        first = data["chains"][data["expirations"][0]]
        assert len(first["calls"]) > 10 and len(first["puts"]) > 10
