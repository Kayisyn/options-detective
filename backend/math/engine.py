"""JSON dispatch entry point — the Node.js backend calls the math engine here.

Protocols
---------
One-shot (default):
    stdin : one JSON object   {"fn": "<function>", "args": {...}}
    stdout: one JSON object   {"ok": true,  "result": ...}
                            | {"ok": false, "error": "<message>"}

Persistent (--serve): one JSON request per line, one JSON response per line.
Requests may carry an "id" which is echoed back on the response, so the Node
bridge can pipeline concurrent calls over a single warm interpreter (scipy
import costs ~0.5s; screening hundreds of candidates cannot pay that per call).

The special fn "batch" runs {"args": {"requests": [{fn, args}, ...]}} and
returns a list of per-item {ok, result|error} envelopes — one engine call for
an entire Detector screen.

The process always exits 0 when it managed to emit a JSON response; a
non-zero exit means the protocol itself broke (crash), not a domain error.

Non-finite floats are serialized as null: a null max_profit or max_loss
means "unbounded" (see docs/api-schema.md).

Example:
    echo {"fn":"bs_call_price","args":{"S":100,"K":100,"T":1,"r":0.05,"sigma":0.2}} | python engine.py
"""

from __future__ import annotations

import json
import math
import sys

import numpy as np

import black_scholes
import iv_solver
import payoff
import probability
import sizing

DISPATCH = {
    "bs_call_price": black_scholes.bs_call_price,
    "bs_put_price": black_scholes.bs_put_price,
    "bs_call_greeks": black_scholes.bs_call_greeks,
    "bs_put_greeks": black_scholes.bs_put_greeks,
    "implied_volatility": iv_solver.implied_volatility,
    "multi_leg_payoff": payoff.multi_leg_payoff,
    "payoff_summary": payoff.payoff_summary,
    "payoff_curve": payoff.payoff_curve,
    "prob_itm": probability.prob_itm,
    "prob_of_profit": probability.prob_of_profit,
    "prob_max_profit": probability.prob_max_profit,
    "risk_based_size": sizing.risk_based_size,
    "position_summary": sizing.position_summary,
}


def _jsonable(obj):
    if isinstance(obj, dict):
        return {k: _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return [_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, (np.floating, np.integer)):
        obj = obj.item()
    if isinstance(obj, float) and not math.isfinite(obj):
        return None  # unbounded/undefined -> null, see docs/api-schema.md
    return obj


def _dispatch(fn_name, args) -> dict:
    fn = DISPATCH.get(fn_name)
    if fn is None:
        return {"ok": False,
                "error": f"unknown function {fn_name!r}; "
                         f"available: {', '.join(sorted(DISPATCH))}"}
    if not isinstance(args, dict):
        return {"ok": False, "error": "args must be an object of keyword arguments"}
    try:
        result = fn(**args)
    except (ValueError, TypeError) as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "result": _jsonable(result)}


def _handle_batch(args) -> dict:
    requests = args.get("requests") if isinstance(args, dict) else None
    if not isinstance(requests, list):
        return {"ok": False,
                "error": 'batch args must be {"requests": [{"fn": ..., "args": ...}, ...]}'}
    results = []
    for item in requests:
        if not isinstance(item, dict) or "fn" not in item:
            results.append({"ok": False, "error": "each batch item must be {fn, args}"})
        elif item["fn"] == "batch":
            results.append({"ok": False, "error": "nested batch is not allowed"})
        else:
            results.append(_dispatch(item["fn"], item.get("args", {})))
    return {"ok": True, "result": results}


def handle(request_text: str) -> dict:
    try:
        req = json.loads(request_text)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"invalid JSON request: {exc}"}
    if not isinstance(req, dict) or "fn" not in req:
        return {"ok": False, "error": 'request must be {"fn": "...", "args": {...}}'}
    if req["fn"] == "batch":
        response = _handle_batch(req.get("args", {}))
    else:
        response = _dispatch(req["fn"], req.get("args", {}))
    if "id" in req:
        response["id"] = req["id"]
    return response


def serve() -> int:
    """--serve: line-delimited JSON loop for the persistent Node bridge."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        json.dump(handle(line), sys.stdout)
        sys.stdout.write("\n")
        sys.stdout.flush()
    return 0


def main(argv) -> int:
    if "--serve" in argv:
        return serve()
    response = handle(sys.stdin.read())
    json.dump(response, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
