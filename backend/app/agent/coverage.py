"""Coverage decision: reasons over the retrieved clauses only.

Live mode asks Claude with the clauses as the sole source of truth. Demo mode uses a canned
reasoner that applies the same rules over the same retrieved clauses, so it is deterministic.
"""

from __future__ import annotations

import re

from app.models import Citation, Claim, CoverageDecision, CoverageType, Policy

from . import llm
from .fraud import is_vague

GRANT = {"collision": "A.1", "comprehensive": "A.2"}

EXCLUSION_TRIGGERS: dict[str, re.Pattern[str]] = {
    "B.1": re.compile(r"wear and tear|mechanical|engine fail|engine seized|transmission|rust|corrosion", re.I),
    "B.2": re.compile(r"\bracing\b|race ?track|raceway|track day|speed contest|drag race|timed (lap|event)", re.I),
    "B.3": re.compile(r"\buber\b|\blyft\b|doordash|instacart|rideshare|delivering|delivery (order|driver)", re.I),
    "B.4": re.compile(r"intoxicated|\bdrunk\b|\bdui\b|under the influence|been drinking", re.I),
    "B.5": re.compile(r"intentional|deliberately|on purpose|staged", re.I),
    "B.6": re.compile(r"unlicensed|no (driver'?s )?license|excluded driver", re.I),
}


def demo_reasoner(claim: Claim, policy: Policy, coverage_type: CoverageType, citations: list[Citation]) -> CoverageDecision:
    retrieved = {c.clause_id: c for c in citations}
    grant = GRANT[coverage_type]

    if coverage_type not in policy.coverages:
        return CoverageDecision(
            covered=False,
            coverage_type=coverage_type,
            rationale=(
                f"The loss is a {coverage_type} loss under clause {grant}, but the declarations for "
                f"{policy.policy_number} carry no {coverage_type} coverage. Clause {grant} applies only "
                "when the declarations show a premium and limit for that coverage."
            ),
            cited_clauses=[grant],
            confidence=0.95,
        )

    for cid, pattern in EXCLUSION_TRIGGERS.items():
        if cid in retrieved and (m := pattern.search(claim.loss_description)):
            clause = retrieved[cid]
            return CoverageDecision(
                covered=False,
                coverage_type=coverage_type,
                rationale=(
                    f"The narrative states \"{m.group(0)}\", which falls under {cid} ({clause.title}). "
                    f"Exclusions in Part B override the {coverage_type} insuring agreement in {grant}, "
                    "so the loss is not covered."
                ),
                cited_clauses=[cid, grant] if grant in retrieved else [cid],
                confidence=0.92,
            )

    cited = [cid for cid in (grant, "A.3", "A.4") if cid in retrieved] or [citations[0].clause_id]
    confidence = 0.91
    notes = []
    if grant not in retrieved:
        confidence -= 0.15
        notes.append(f"the {coverage_type} insuring agreement was not among the retrieved clauses")
    if is_vague(claim.loss_description):
        confidence -= 0.25
        notes.append("the narrative is too vague to fully match the insuring agreement")
    rationale = (
        f"Direct and accidental {coverage_type} loss matches the insuring agreement in {grant}. "
        "No Part B exclusion is triggered by the narrative. The deductible (A.3) and limit (A.4) apply."
    )
    if notes:
        rationale += " Confidence reduced because " + " and ".join(notes) + "."
    return CoverageDecision(
        covered=True,
        coverage_type=coverage_type,
        rationale=rationale,
        cited_clauses=cited,
        confidence=round(max(confidence, 0.3), 2),
    )


SYSTEM = (
    "You are a senior auto insurance coverage analyst. Decide whether a claim is covered using "
    "ONLY the policy clauses provided. Do not rely on outside knowledge of insurance law. "
    "Exclusions override insuring agreements. Cite the clause ids you relied on. Confidence is "
    "a number from 0 to 1; lower it when the narrative is vague or the clauses are ambiguous."
)


def llm_reasoner(claim: Claim, policy: Policy, coverage_type: CoverageType, citations: list[Citation]) -> CoverageDecision:
    clauses = "\n\n".join(f"[{c.clause_id}] {c.title}\n{c.text}" for c in citations)
    decl = ", ".join(
        f"{k}: deductible ${v.deductible:,.0f}, limit ${v.limit:,.0f}" for k, v in policy.coverages.items()
    )
    prompt = (
        f"CLAIM\nPolicy: {claim.policy_number}\nVehicle: {claim.vehicle}\nDate of loss: {claim.date_of_loss}\n"
        f"Narrative: {claim.loss_description}\nClaimed amount: ${claim.claimed_amount:,.2f}\n\n"
        f"DECLARATIONS\nCoverages on this policy: {decl}\nLoss classified as: {coverage_type}\n\n"
        f"RETRIEVED POLICY CLAUSES\n{clauses}\n\nDecide coverage."
    )
    out = llm.structured_call(SYSTEM, prompt, llm.LLMCoverage)
    valid = {c.clause_id for c in citations}
    cited = [c for c in out.cited_clauses if c in valid] or [citations[0].clause_id]
    return CoverageDecision(
        covered=out.covered,
        coverage_type=coverage_type,
        rationale=out.rationale,
        cited_clauses=cited,
        confidence=round(min(max(out.confidence, 0.0), 1.0), 2),
    )
