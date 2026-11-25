import pytest

from app.agent.settlement import compute_settlement


def test_payout_is_cost_minus_deductible():
    s = compute_settlement(4280, 500, 40000)
    assert s.payout == 3780 and not s.capped


def test_payout_capped_at_limit():
    s = compute_settlement(42000, 500, 35000)
    assert s.payout == 35000 and s.capped


def test_cost_below_deductible_pays_zero():
    assert compute_settlement(300, 500, 10000).payout == 0


def test_deductible_applied_before_cap():
    # 36000 - 1000 = 35000, exactly at the limit: not capped
    s = compute_settlement(36000, 1000, 35000)
    assert s.payout == 35000 and not s.capped


def test_negative_amounts_rejected():
    with pytest.raises(ValueError):
        compute_settlement(-1, 0, 100)
