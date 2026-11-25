"""Settlement math: payout = approved cost - deductible, floored at 0 and capped at the limit."""

from __future__ import annotations

from app.models import Settlement


def compute_settlement(approved_cost: float, deductible: float, limit: float) -> Settlement:
    if approved_cost < 0 or deductible < 0 or limit < 0:
        raise ValueError("Amounts must be non-negative")
    net = max(approved_cost - deductible, 0.0)
    payout = min(net, limit)
    return Settlement(
        approved_cost=round(approved_cost, 2),
        deductible=round(deductible, 2),
        limit=round(limit, 2),
        payout=round(payout, 2),
        capped=net > limit,
    )
