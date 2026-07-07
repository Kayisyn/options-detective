"""Lean per-ticker metric fetch for the ETF screener (v2.0 §2.3/§2.10).

CLI: reads {"tickers": ["VOO", ...], "target_dte": 30} on stdin, writes
{"ok": true, "result": {ticker: metrics | {"error": ...}}}. Each ticker is
isolated so one bad symbol never fails the batch.

Reuses the tested market_data helpers (realized_vol_series, iv_rank,
atm_iv, normalize_contracts). Much lighter than a full chain fetch: 1y
history + ONE ~30-DTE expiration per ticker.

Metrics per ticker:
  price                       latest close
  ytdReturn                   % return since the first close of this year
  atmIv                       ATM implied vol at the chosen expiration
  ivRank                      today's ATM IV vs the 1y realized-vol range
                              (documented proxy, same as the rest of the app)
  annualizedCallPremiumPct    ~5% OTM call mid / price, annualized by DTE
  callVolume                  total call volume at the expiration (liquidity)
  dte                         days to the chosen expiration
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone

from market_data import (atm_iv, iv_rank, normalize_contracts,
                         realized_vol_series)

OTM_TARGET = 0.05  # ~5% out-of-the-money call for the premium estimate


def _ytd_return(hist):
    closes = [float(x) for x in hist["Close"].tolist()]
    if len(closes) < 2:
        return None
    year = datetime.now(timezone.utc).year
    first_of_year = None
    for ts, close in zip(hist.index, closes):
        if ts.year == year:
            first_of_year = close
            break
    base = first_of_year if first_of_year is not None else closes[0]
    if not base:
        return None
    return round((closes[-1] / base - 1.0) * 100.0, 2)


def _pick_expiration(ticker, target_dte):
    """Nearest listed expiration to target_dte with at least ~20 days."""
    today = datetime.now(timezone.utc).date()
    best = None
    best_dist = None
    for exp in (ticker.options or []):
        try:
            exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        dte = (exp_date - today).days
        if dte < 15:
            continue
        dist = abs(dte - target_dte)
        if best_dist is None or dist < best_dist:
            best, best_dist = (exp, dte), dist
    return best  # (expiration, dte) or None


def _annualized_call_premium(calls, price, dte):
    """Mid of the call nearest ~5% OTM, annualized as a % of price."""
    otm = [c for c in calls if c["strike"] >= price and c["mid"]]
    if not otm:
        return None, None
    target = price * (1 + OTM_TARGET)
    pick = min(otm, key=lambda c: abs(c["strike"] - target))
    if not pick["mid"] or price <= 0 or dte <= 0:
        return None, pick["strike"]
    annualized = (pick["mid"] / price) * (365.0 / dte) * 100.0
    return round(annualized, 2), pick["strike"]


def fetch_one(symbol, target_dte):
    import yfinance as yf

    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="1y", auto_adjust=True)
    if hist is None or len(hist) == 0:
        raise ValueError("no price history")
    closes = [float(x) for x in hist["Close"].tolist()]
    price = closes[-1]

    picked = _pick_expiration(ticker, target_dte)
    atm = None
    rank = None
    premium = None
    otm_strike = None
    call_volume = 0
    dte = None
    if picked is not None:
        expiration, dte = picked
        chain = ticker.option_chain(expiration)
        calls = normalize_contracts(chain.calls.to_dict("records"))
        puts = normalize_contracts(chain.puts.to_dict("records"))
        atm = atm_iv({"calls": calls, "puts": puts}, price)
        rank = iv_rank(atm, realized_vol_series(closes))
        premium, otm_strike = _annualized_call_premium(calls, price, dte)
        call_volume = sum(c["volume"] for c in calls)

    return {
        "price": round(price, 2),
        "ytdReturn": _ytd_return(hist),
        "atmIv": round(atm, 4) if atm is not None else None,
        "ivRank": rank,
        "annualizedCallPremiumPct": premium,
        "otmCallStrike": otm_strike,
        "callVolume": int(call_volume),
        "dte": dte,
        "asOf": datetime.now(timezone.utc).isoformat(),
    }


def main() -> int:
    try:
        req = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        json.dump({"ok": False, "error": f"invalid JSON request: {exc}"}, sys.stdout)
        sys.stdout.write("\n")
        return 0
    tickers = req.get("tickers") if isinstance(req, dict) else None
    if not isinstance(tickers, list) or not tickers:
        json.dump({"ok": False, "error": 'request must be {"tickers": [...]}'}, sys.stdout)
        sys.stdout.write("\n")
        return 0
    target_dte = int(req.get("target_dte", 30))
    result = {}
    for raw in tickers:
        symbol = str(raw).strip().upper()
        try:
            result[symbol] = fetch_one(symbol, target_dte)
        except Exception as exc:  # one bad ticker must not kill the batch
            result[symbol] = {"error": f"{type(exc).__name__}: {exc}"}
    json.dump({"ok": True, "result": result}, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
