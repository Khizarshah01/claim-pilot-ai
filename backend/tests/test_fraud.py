from datetime import date

from app.agent.fraud import assess_fraud, count_recent_claims, is_vague, score_level
from app.agent.policies import get_policy
from app.models import Claim

DETAILED = "Rear-ended while stopped at a red light, rear bumper and trunk lid damaged by the other driver"


def claim(**kw):
    base = dict(policy_number="CP-1001", claimant_name="T", date_of_loss=date(2026, 11, 18),
                reported_date=date(2026, 11, 19), loss_description=DETAILED, claimed_amount=4000,
                police_report=True)
    base.update(kw)
    return Claim(**base)


def codes(fa):
    return {f.code for f in fa.flags}


def test_clean_claim_scores_zero():
    fa = assess_fraud(claim(), get_policy("CP-1001"))
    assert fa.score == 0 and fa.level == "low"


def test_early_claim_flag():
    fa = assess_fraud(claim(policy_number="CP-1003", date_of_loss=date(2026, 11, 2), reported_date=date(2026, 11, 3)),
                      get_policy("CP-1003"))
    assert "EARLY_CLAIM" in codes(fa)


def test_inflated_cost_flag():
    fa = assess_fraud(claim(claimed_amount=20000), get_policy("CP-1001"))
    assert "COST_INFLATED" in codes(fa)


def test_repeat_claims_counts_policy_history_and_store():
    fa = assess_fraud(claim(policy_number="CP-1008"), get_policy("CP-1008"))
    assert any(f.code == "REPEAT_CLAIMS" and f.weight == 20 for f in fa.flags)
    fa2 = assess_fraud(claim(), get_policy("CP-1001"), [date(2026, 6, 1)])
    assert any(f.code == "REPEAT_CLAIMS" and f.weight == 8 for f in fa2.flags)


def test_vague_description():
    assert is_vague("Car got damaged.")
    assert not is_vague(DETAILED)


def test_combined_signals_route_high_and_cap_at_100():
    fa = assess_fraud(
        claim(policy_number="CP-1003", date_of_loss=date(2026, 10, 25), reported_date=date(2026, 11, 20),
              loss_description="Car was stolen.", claimed_amount=90000, police_report=False),
        get_policy("CP-1003"), [date(2026, 10, 22), date(2026, 10, 23)],
    )
    assert fa.score > 60 and fa.level == "high" and fa.score <= 100


def test_recent_claim_window_and_levels():
    assert count_recent_claims(date(2026, 11, 1), [date(2025, 10, 1), date(2026, 5, 1)]) == 1
    assert score_level(29) == "low" and score_level(30) == "medium" and score_level(61) == "high"
