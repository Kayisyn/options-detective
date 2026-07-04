"""Risk-based position sizing."""

from __future__ import annotations

import math


def risk_based_size(max_loss_per_contract, account_equity, risk_pct=0.02,
                    max_loss_dollars=None) -> int:
    """Contracts such that worst-case loss stays inside the risk budget.

    Budget = account_equity * risk_pct, further capped by max_loss_dollars
    (the user's hard cap) when provided. Floors to whole contracts; returns 0
    when even one contract exceeds the budget.

    Raises ValueError for undefined risk (max_loss_per_contract <= 0 or
    non-finite): an unlimited-risk position cannot be sized off max loss.
    """
    try:
        ml = float(max_loss_per_contract)
        eq = float(account_equity)
        rp = float(risk_pct)
    except (TypeError, ValueError):
        raise ValueError("max_loss_per_contract, account_equity and risk_pct "
                         "must be numbers") from None
    if not math.isfinite(ml) or ml <= 0.0:
        raise ValueError(f"max_loss_per_contract must be a positive finite "
                         f"dollar amount, got {max_loss_per_contract!r}")
    if not math.isfinite(eq) or eq <= 0.0:
        raise ValueError(f"account_equity must be > 0, got {account_equity!r}")
    if not (0.0 < rp <= 1.0):
        raise ValueError(f"risk_pct must be in (0, 1], got {risk_pct!r}")

    budget = eq * rp
    if max_loss_dollars is not None:
        try:
            cap = float(max_loss_dollars)
        except (TypeError, ValueError):
            raise ValueError(f"max_loss_dollars must be a number, "
                             f"got {max_loss_dollars!r}") from None
        if not math.isfinite(cap) or cap <= 0.0:
            raise ValueError(f"max_loss_dollars must be > 0 when provided, "
                             f"got {max_loss_dollars!r}")
        budget = min(budget, cap)

    return int(budget // ml)


def position_summary(contracts, cost_per_contract, account_equity) -> dict:
    """Total debit/credit and account utilization for a sized position.

    cost_per_contract is dollars per contract: positive for debits,
    negative for credits.
    """
    try:
        c = int(contracts)
        cost = float(cost_per_contract)
        eq = float(account_equity)
    except (TypeError, ValueError):
        raise ValueError("contracts, cost_per_contract and account_equity "
                         "must be numbers") from None
    if c != contracts or c < 0:
        raise ValueError(f"contracts must be a non-negative integer, got {contracts!r}")
    if not math.isfinite(eq) or eq <= 0.0:
        raise ValueError(f"account_equity must be > 0, got {account_equity!r}")
    if not math.isfinite(cost):
        raise ValueError(f"cost_per_contract must be finite, got {cost_per_contract!r}")

    total = c * cost
    return {
        "contracts": c,
        "total_cost": total,
        "pct_of_account": abs(total) / eq,
    }
