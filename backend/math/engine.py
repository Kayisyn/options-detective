"""JSON dispatch entry point — the Node.js backend calls the math engine here.

Protocol
--------
stdin : one JSON object   {"fn": "<function>", "args": {...}}
stdout: one JSON object   {"ok": true,  "result": ...}
                        | {"ok": false, "error": "<message>"}

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


def handle(request_text: str) -> dict:
    try:
        req = json.loads(request_text)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"invalid JSON request: {exc}"}
    if not isinstance(req, dict) or "fn" not in req:
        return {"ok": False, "error": 'request must be {"fn": "...", "args": {...}}'}
    fn = DISPATCH.get(req["fn"])
    if fn is None:
        return {"ok": False,
                "error": f"unknown function {req['fn']!r}; "
                         f"available: {', '.join(sorted(DISPATCH))}"}
    args = req.get("args", {})
    if not isinstance(args, dict):
        return {"ok": False, "error": "args must be an object of keyword arguments"}
    try:
        result = fn(**args)
    except (ValueError, TypeError) as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "result": _jsonable(result)}


def main() -> int:
    response = handle(sys.stdin.read())
    json.dump(response, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
