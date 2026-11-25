from datetime import date

from app.agent.policies import get_policy
from app.agent.policy_check import check_policy
from app.models import Claim


def make_claim(policy="CP-1001", loss=date(2026, 11, 18)):
    return Claim(policy_number=policy, claimant_name="T", date_of_loss=loss, reported_date=loss,
                 loss_description="Rear-ended at a light, rear bumper damaged", claimed_amount=1000)


def test_valid_policy_passes():
    r = check_policy(make_claim(), get_policy("CP-1001"))
    assert r.passed and all(c["passed"] for c in r.checks)


def test_missing_policy_fails():
    r = check_policy(make_claim("CP-9999"), get_policy("CP-9999"))
    assert not r.passed and "not found" in r.reason


def test_unpaid_premium_fails():
    r = check_policy(make_claim("CP-1006", date(2026, 11, 1)), get_policy("CP-1006"))
    assert not r.passed and "past due" in r.reason


def test_loss_outside_period_fails():
    r = check_policy(make_claim("CP-1007", date(2026, 10, 3)), get_policy("CP-1007"))
    assert not r.passed and "period" in r.reason


def test_boundary_dates_are_inclusive():
    p = get_policy("CP-1001")
    assert check_policy(make_claim(loss=p.start_date), p).passed
    assert check_policy(make_claim(loss=p.end_date), p).passed
