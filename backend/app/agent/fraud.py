"""Rule-based fraud signals producing a 0-100 risk score with reasons."""

from __future__ import annotations

import re
from datetime import date, timedelta

from app.models import Claim, FraudAssessment, FraudFlag, Policy

# (keywords, benchmark repair cost, label). First match wins, so most specific first.
_BENCHMARKS: list[tuple[tuple[str, ...], float, str]] = [
    (("stolen", "theft", "total loss", "rollover", "flood", "fire"), 25000, "theft / total loss"),
    (("hail",), 4000, "hail damage"),
    (("tree", "branch", "falling"), 3500, "falling object damage"),
    (("deer", "animal"), 5500, "animal strike"),
    (("windshield", "glass"), 1100, "glass replacement"),
    (("engine", "transmission"), 7500, "powertrain repair"),
    (("rear-end", "rear-ended", "side-swipe", "intersection", "barrier", "hit-and-run", "struck"), 5500, "moderate collision"),
    (("parking lot", "pole", "fender bender", "scratch", "dent", "minor", "bumper"), 2500, "minor body damage"),
]
_DEFAULT_BENCHMARK = (6000.0, "general physical damage")

_SPECIFIC_TERMS = re.compile(
    r"bumper|door|hood|trunk|fender|windshield|mirror|headlight|tail ?light|grille|roof|panel|"
    r"radiator|tailgate|wheel|tire|glass|engine|liftgate|quarter",
    re.I,
)


def repair_benchmark(description: str) -> tuple[float, str]:
    d = description.lower()
    for keys, amount, label in _BENCHMARKS:
        if any(k in d for k in keys):
            return amount, label
    return _DEFAULT_BENCHMARK


def is_vague(description: str) -> bool:
    words = len(description.split())
    return words < 12 or not _SPECIFIC_TERMS.search(description)


def count_recent_claims(loss: date, prior: list[date], window_days: int = 365) -> int:
    start = loss - timedelta(days=window_days)
    return sum(1 for d in prior if start <= d < loss)


def score_level(score: int) -> str:
    if score > 60:
        return "high"
    if score >= 30:
        return "medium"
    return "low"


def assess_fraud(claim: Claim, policy: Policy | None, other_claim_dates: list[date] | None = None) -> FraudAssessment:
    flags: list[FraudFlag] = []

    if policy is not None:
        days_in = (claim.date_of_loss - policy.start_date).days
        if 0 <= days_in <= 30:
            flags.append(FraudFlag(code="EARLY_CLAIM", label="Early claim", weight=25,
                                   detail=f"Loss occurred {days_in} days after policy inception"))
        elif 30 < days_in <= 60:
            flags.append(FraudFlag(code="EARLY_CLAIM", label="Early claim", weight=12,
                                   detail=f"Loss occurred {days_in} days after policy inception"))

    benchmark, basis = repair_benchmark(claim.loss_description)
    ratio = claim.claimed_amount / benchmark if benchmark else 0
    if ratio >= 2.0:
        flags.append(FraudFlag(code="COST_INFLATED", label="Cost far above estimate", weight=30,
                               detail=f"${claim.claimed_amount:,.0f} is {ratio:.1f}x the ${benchmark:,.0f} benchmark for {basis}"))
    elif ratio >= 1.5:
        flags.append(FraudFlag(code="COST_INFLATED", label="Cost above estimate", weight=18,
                               detail=f"${claim.claimed_amount:,.0f} is {ratio:.1f}x the ${benchmark:,.0f} benchmark for {basis}"))

    prior = list(policy.prior_claims if policy else []) + list(other_claim_dates or [])
    recent = count_recent_claims(claim.date_of_loss, prior)
    if recent >= 2:
        flags.append(FraudFlag(code="REPEAT_CLAIMS", label="Repeat claims", weight=20,
                               detail=f"{recent} prior claims on this policy in the last 12 months"))
    elif recent == 1:
        flags.append(FraudFlag(code="REPEAT_CLAIMS", label="Prior claim", weight=8,
                               detail="1 prior claim on this policy in the last 12 months"))

    if is_vague(claim.loss_description):
        flags.append(FraudFlag(code="VAGUE_DESCRIPTION", label="Vague description", weight=15,
                               detail=f"Narrative has {len(claim.loss_description.split())} words and no specific damaged parts"))

    lag = (claim.reported_date - claim.date_of_loss).days
    if lag > 14:
        flags.append(FraudFlag(code="LATE_REPORT", label="Late report", weight=10,
                               detail=f"Reported {lag} days after the loss"))

    needs_report = "stolen" in claim.loss_description.lower() or "theft" in claim.loss_description.lower() or claim.claimed_amount > 10000
    if needs_report and not claim.police_report:
        flags.append(FraudFlag(code="NO_POLICE_REPORT", label="No police report", weight=10,
                               detail="Theft or high-value loss without a police report (Condition C.3)"))

    score = min(100, sum(f.weight for f in flags))
    return FraudAssessment(score=score, level=score_level(score), flags=flags)  # type: ignore[arg-type]
