"""Lightweight batch quote + news fetch for the sidebars (v1.5.0 Part 3).

CLI: reads {"symbols": [...], "news_symbol": "SPY", "news_count": 5} on
stdin, writes {"ok": true, "result": {"quotes": {...}, "news": [...]}}.

Quotes come from ONE batched yf.download of the last 5 daily bars per
symbol (during market hours the final bar is today's running price), so a
25-symbol basket is a single HTTP round-trip, not 25. News comes from the
news_symbol's Yahoo feed. Each part is isolated: a quote failure never
kills the news and vice versa.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

MAX_SYMBOLS = 60
MAX_NEWS = 10


def fetch_quotes(symbols):
    import yfinance as yf

    quotes = {}
    if not symbols:
        return quotes
    data = yf.download(
        tickers=" ".join(symbols),
        period="5d",
        interval="1d",
        auto_adjust=True,
        progress=False,
        group_by="ticker",
        threads=True,
    )
    if data is None or len(data) == 0:
        return quotes
    for sym in symbols:
        try:
            # group_by="ticker" gives MultiIndex columns even for a SINGLE
            # symbol (v1.9.0 fix — the old len()>1 check dropped solo
            # fetches like the CAD=X exchange rate)
            try:
                frame = data[sym]
            except (KeyError, TypeError):
                frame = data  # flat columns (older yfinance single-ticker)
            closes = [float(x) for x in frame["Close"].dropna().tolist()]
            if len(closes) < 2:
                continue
            price, prev = closes[-1], closes[-2]
            if prev <= 0:
                continue
            # 4dp: FX rates need the precision; equity displays re-round
            quotes[sym] = {
                "price": round(price, 4),
                "prevClose": round(prev, 4),
                "changePct": round((price / prev - 1.0) * 100.0, 2),
            }
        except Exception:  # one bad symbol must not kill the batch
            continue
    return quotes


def _news_item(raw):
    """Normalize across yfinance news schema versions (flat vs 'content')."""
    content = raw.get("content") if isinstance(raw.get("content"), dict) else raw
    title = content.get("title")
    if not title:
        return None
    url = None
    click = content.get("clickThroughUrl") or content.get("canonicalUrl")
    if isinstance(click, dict):
        url = click.get("url")
    url = url or raw.get("link")
    provider = content.get("provider")
    publisher = (provider or {}).get("displayName") if isinstance(provider, dict) \
        else raw.get("publisher")
    published = content.get("pubDate")
    if not published and raw.get("providerPublishTime"):
        published = datetime.fromtimestamp(
            int(raw["providerPublishTime"]), tz=timezone.utc).isoformat()
    return {
        "title": str(title),
        "url": url,
        "publisher": publisher,
        "publishedAt": published,
    }


def fetch_news(symbol, count):
    import yfinance as yf

    items = []
    for raw in (yf.Ticker(symbol).news or [])[: count * 2]:
        try:
            item = _news_item(raw)
        except Exception:
            continue
        if item is not None:
            items.append(item)
        if len(items) >= count:
            break
    return items


def main() -> int:
    try:
        req = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        json.dump({"ok": False, "error": f"invalid JSON request: {exc}"}, sys.stdout)
        sys.stdout.write("\n")
        return 0
    if not isinstance(req, dict):
        json.dump({"ok": False, "error": "request must be an object"}, sys.stdout)
        sys.stdout.write("\n")
        return 0

    symbols = []
    seen = set()
    for raw in (req.get("symbols") or [])[:MAX_SYMBOLS]:
        sym = str(raw).strip().upper()
        if sym and sym not in seen:
            seen.add(sym)
            symbols.append(sym)

    result = {"quotes": {}, "news": [], "errors": {}}
    try:
        result["quotes"] = fetch_quotes(symbols)
    except Exception as exc:
        result["errors"]["quotes"] = f"{type(exc).__name__}: {exc}"
    news_symbol = str(req.get("news_symbol") or "SPY").strip().upper()
    news_count = min(int(req.get("news_count") or 5), MAX_NEWS)
    try:
        result["news"] = fetch_news(news_symbol, news_count)
    except Exception as exc:
        result["errors"]["news"] = f"{type(exc).__name__}: {exc}"
    result["asOf"] = datetime.now(timezone.utc).isoformat()

    json.dump({"ok": True, "result": result}, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
