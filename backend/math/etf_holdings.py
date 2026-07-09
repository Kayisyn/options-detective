"""ETF holdings fallback fetch for the Index Component Screener (v1.3.0).

CLI: reads {"tickers": ["VNQ", ...]} on stdin, writes
{"ok": true, "result": {ticker: {"holdings": [...]} | {"error": ...}}}.

yfinance funds_data exposes only the TOP 10 holdings (verified against
yfinance 1.5.1) — full constituent lists are not available from free data.
This fetcher is therefore the FALLBACK for universe ETFs without a curated
static set (see backend/services/etfHoldings.js); the UI discloses the
"top 10 via Yahoo Finance" coverage. Sectors are not provided by the API,
so they come back null. Each ticker is isolated so one bad symbol never
fails the batch.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone


def fetch_one(symbol):
    import yfinance as yf

    ticker = yf.Ticker(symbol)
    fd = ticker.funds_data
    th = fd.top_holdings
    holdings = []
    if th is not None:
        for sym, row in th.iterrows():
            try:
                weight = float(row["Holding Percent"])
            except (KeyError, TypeError, ValueError):
                continue
            holdings.append({
                "symbol": str(sym).strip().upper(),
                "weight": round(weight, 6),
                "sector": None,
            })
    if not holdings:
        raise ValueError("no holdings data available")
    holdings.sort(key=lambda h: -h["weight"])
    for i, h in enumerate(holdings):
        h["rank"] = i + 1
    return {
        "holdings": holdings,
        "asOf": datetime.now(timezone.utc).date().isoformat(),
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
    result = {}
    for raw in tickers:
        symbol = str(raw).strip().upper()
        try:
            result[symbol] = fetch_one(symbol)
        except Exception as exc:  # one bad ticker must not kill the batch
            result[symbol] = {"error": f"{type(exc).__name__}: {exc}"}
    json.dump({"ok": True, "result": result}, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
