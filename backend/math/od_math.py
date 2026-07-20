"""Packaged entry point for the math side of Options Detective.

PyInstaller bundles this (onedir) as od-math.exe so end users need no
Python installation:

    od-math.exe engine              one-shot: JSON request on stdin
    od-math.exe engine --serve      persistent line-delimited JSON
    od-math.exe market_data         market data fetch: JSON on stdin
    od-math.exe etf_metrics         ETF screener metrics: JSON on stdin
    od-math.exe etf_holdings        ETF top-holdings fetch: JSON on stdin
    od-math.exe market_pulse        sidebar quotes + news: JSON on stdin

One executable for all entry points keeps a single copy of numpy/scipy in
the bundle. Exit codes mirror the dev-mode scripts: 0 whenever a JSON
response was emitted; 2 for unusable command lines.
"""

import json
import sys


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else None
    if command == "engine":
        import engine
        return engine.main(sys.argv[2:])
    if command == "market_data":
        import market_data
        return market_data.main()
    if command == "etf_metrics":
        import etf_metrics
        return etf_metrics.main()
    if command == "etf_holdings":
        import etf_holdings
        return etf_holdings.main()
    if command == "market_pulse":
        import market_pulse
        return market_pulse.main()
    json.dump({"ok": False,
               "error": "usage: od-math [engine [--serve] | market_data | etf_metrics | etf_holdings | market_pulse]"},
              sys.stdout)
    sys.stdout.write("\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
