"""Deterministic policy validation. No LLM involved."""

from __future__ import annotations

from app.models import Claim, Policy, PolicyCheck


def check_policy(claim: Claim, policy: Policy | None) -> PolicyCheck:
    checks: list[dict] = []

    exists = policy is not None
    checks.append(
        {
            "name": "Policy exists",
            "passed": exists,
            "detail": f"{claim.policy_number} found in policy records"
            if exists
            else f"{claim.policy_number} not found in policy records",
        }
    )
    if not exists:
        return PolicyCheck(passed=False, checks=checks, reason=checks[-1]["detail"])

    assert policy is not None
    checks.append(
        {
            "name": "Premium paid",
            "passed": policy.premium_paid,
            "detail": "Premium is current" if policy.premium_paid else "Premium is past due",
        }
    )
    in_period = policy.start_date <= claim.date_of_loss <= policy.end_date
    checks.append(
        {
            "name": "Loss in coverage period",
            "passed": in_period,
            "detail": f"Loss {claim.date_of_loss} vs period {policy.start_date} to {policy.end_date}",
        }
    )
    failed = [c for c in checks if not c["passed"]]
    if failed:
        reason = "; ".join(c["detail"] for c in failed)
        return PolicyCheck(passed=False, checks=checks, reason=reason)
    return PolicyCheck(passed=True, checks=checks, reason="All policy checks passed")
