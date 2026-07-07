"""yfinance adapter -> normalized market data JSON.

CLI: reads {"symbol": "AAPL", "max_expirations": 6} on stdin, writes
{"ok": true, "result": <normalized schema>} on stdout. Mirrors engine.py:
always exits 0 after emitting a JSON response; {"ok": false} is a domain or
upstream error, a non-zero exit is a crash.

Normalized schema: docs/api-schema.md. Everything is timestamped — contracts
carry their last-trade time, the payload carries fetchedAt; the Node data
layer computes dataAgeSeconds at serve time and flags staleness.

IV RANK CAVEAT: true IV rank needs a year of *implied* vol history, which
yfinance does not provide. We use the standard free-data fallback: rank
today's ATM IV within the past year's range of 21-day realized volatility.
Deterministic and good enough to bucket high (>=70) / mid / low (<=30), but
it is a proxy — ivRankMethod says so in every payload.

yfinance is imported lazily inside fetch() so the pure normalization/ranking
functions are unit-testable without network or the dependency installed.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone

TRADING_DAYS = 252
REALIZED_VOL_WINDOW = 21  # trading days (~1 calendar month)


def _clean_number(value):
    """float(value) or None for missing/NaN/inf junk out of pandas."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def normalize_contracts(rows) -> list:
    """Raw yfinance chain rows (dicts) -> normalized, strike-sorted contracts.

    mid falls back to lastPrice when the book is empty/crossed; spreadPct is
    None when no two-sided book exists (the liquidity gate treats that as
    illiquid rather than guessing).
    """
    out = []
    for row in rows:
        strike = _clean_number(row.get("strike"))
        if strike is None or strike <= 0.0:
            continue
        bid = _clean_number(row.get("bid")) or 0.0
        ask = _clean_number(row.get("ask")) or 0.0
        last = _clean_number(row.get("lastPrice")) or 0.0

        if bid > 0.0 and ask >= bid:
            mid = round((bid + ask) / 2.0, 4)
            spread_pct = round((ask - bid) / mid, 4) if mid > 0 else None
        else:
            mid = round(last, 4) if last > 0.0 else None
            spread_pct = None

        iv = _clean_number(row.get("impliedVolatility"))
        if iv is not None and iv <= 0.0:
            iv = None
        ts = row.get("lastTradeDate")
        if ts is None:
            timestamp = None
        elif hasattr(ts, "isoformat"):
            timestamp = ts.isoformat()  # pandas Timestamp -> proper ISO 8601
        else:
            timestamp = str(ts)

        out.append({
            "strike": strike,
            "bid": bid,
            "ask": ask,
            "mid": mid,
            "volume": int(_clean_number(row.get("volume")) or 0),
            "openInterest": int(_clean_number(row.get("openInterest")) or 0),
            "impliedVolatility": iv,
            "spreadPct": spread_pct,
            "timestamp": timestamp,
        })
    out.sort(key=lambda c: c["strike"])
    return out


def atm_iv(chain: dict, spot: float):
    """Average call/put IV at the strike nearest spot; None if no IVs exist."""
    found = []
    for side in ("calls", "puts"):
        contracts = [c for c in chain.get(side, []) if c.get("impliedVolatility")]
        if contracts:
            nearest = min(contracts, key=lambda c: abs(c["strike"] - spot))
            found.append(nearest["impliedVolatility"])
    if not found:
        return None
    return sum(found) / len(found)


def realized_vol_series(closes, window=REALIZED_VOL_WINDOW) -> list:
    """Rolling annualized close-to-close volatility over `window` trading days."""
    rets = [math.log(b / a) for a, b in zip(closes, closes[1:])
            if a and b and a > 0.0 and b > 0.0]
    vols = []
    for i in range(window, len(rets) + 1):
        chunk = rets[i - window:i]
        mean = sum(chunk) / window
        var = sum((x - mean) ** 2 for x in chunk) / (window - 1)
        vols.append(math.sqrt(var * TRADING_DAYS))
    return vols


def iv_rank(current_iv, vol_series):
    """Position of current IV within the historical vol range, 0-100."""
    if current_iv is None or len(vol_series) < 20:
        return None
    lo, hi = min(vol_series), max(vol_series)
    if hi - lo < 1e-9:
        return 50.0
    return round(min(100.0, max(0.0, 100.0 * (current_iv - lo) / (hi - lo))), 1)


def select_expirations(expirations, max_n=6, min_dte=1, max_dte=120, today=None):
    """Pick up to max_n expirations spread across the DTE window.

    yfinance lists expirations nearest-first; taking the first N on a
    daily-expiration product (SPY, QQQ) screens barely a week out. Instead:
    filter to the window, then keep the nearest and furthest and space the
    rest evenly. Falls back to the first max_n listed when nothing falls in
    the window (the caller's DTE filters will report honestly downstream).
    """
    if today is None:
        today = datetime.now(timezone.utc).date()
    in_window = []
    for exp in expirations:
        try:
            exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        if min_dte <= (exp_date - today).days <= max_dte:
            in_window.append(exp)
    if not in_window:
        return list(expirations)[:max_n]
    if len(in_window) <= max_n or max_n <= 1:
        return in_window[:max_n]
    step = (len(in_window) - 1) / (max_n - 1)
    picked_idx = sorted({round(i * step) for i in range(max_n)})
    return [in_window[i] for i in picked_idx]


def fetch(symbol: str, max_expirations: int = 6, min_dte: int = 1,
          max_dte: int = 120) -> dict:
    import yfinance as yf  # lazy: keeps pure functions testable offline

    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="1y", auto_adjust=True)
    if hist is None or len(hist) == 0:
        raise ValueError(f"no price history for {symbol!r} — unknown symbol?")
    closes = [float(x) for x in hist["Close"].tolist()]
    price = closes[-1]

    all_expirations = list(ticker.options or [])
    if not all_expirations:
        raise ValueError(f"{symbol!r} has no listed options")
    expirations = select_expirations(all_expirations, max_expirations,
                                     min_dte, max_dte)

    chains = {}
    for exp in expirations:
        oc = ticker.option_chain(exp)
        chains[exp] = {
            "calls": normalize_contracts(oc.calls.to_dict("records")),
            "puts": normalize_contracts(oc.puts.to_dict("records")),
        }

    current_iv = atm_iv(chains[expirations[0]], price)

    # Most recent trade anywhere in the chain: the honest "how live is this
    # market" signal. Fetch time alone lies on weekends/holidays — you can
    # fetch a two-day-old closing book "fresh".
    last_trades = [c["timestamp"]
                   for chain in chains.values()
                   for side in ("calls", "puts")
                   for c in chain[side] if c["timestamp"]]

    return {
        "symbol": symbol.upper(),
        "price": price,
        "atmIv": current_iv,
        "ivRank": iv_rank(current_iv, realized_vol_series(closes)),
        "ivRankMethod": "ATM IV ranked against 1y realized-vol range (proxy; see market_data.py)",
        "expirations": expirations,
        "chains": chains,
        "lastTradeAt": max(last_trades) if last_trades else None,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


def main() -> int:
    try:
        req = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        response = {"ok": False, "error": f"invalid JSON request: {exc}"}
    else:
        symbol = req.get("symbol") if isinstance(req, dict) else None
        if not symbol or not isinstance(symbol, str):
            response = {"ok": False, "error": 'request must be {"symbol": "...", "max_expirations"?: n}'}
        else:
            try:
                result = fetch(symbol.strip(),
                               int(req.get("max_expirations", 6)),
                               int(req.get("min_dte", 1)),
                               int(req.get("max_dte", 120)))
                response = {"ok": True, "result": result}
            except ValueError as exc:
                response = {"ok": False, "error": str(exc)}
            except Exception as exc:  # network/upstream failures must not crash the protocol
                response = {"ok": False, "error": f"fetch failed: {type(exc).__name__}: {exc}"}
    json.dump(response, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
