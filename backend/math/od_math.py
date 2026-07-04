"""Packaged entry point for the math side of Options Detective.

PyInstaller bundles this (onedir) as od-math.exe so end users need no
Python installation:

    od-math.exe engine              one-shot: JSON request on stdin
    od-math.exe engine --serve      persistent line-delimited JSON
    od-math.exe market_data         market data fetch: JSON on stdin

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
    json.dump({"ok": False,
               "error": "usage: od-math [engine [--serve] | market_data]"},
              sys.stdout)
    sys.stdout.write("\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
