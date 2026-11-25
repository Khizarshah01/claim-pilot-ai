"""Pydantic models shared by the API and the agent pipeline."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Decision = Literal["Approve", "Deny", "Review"]
ClaimStatus = Literal["pending", "approved", "denied", "in_review"]
CoverageType = Literal["collision", "comprehensive"]


class ClaimInput(BaseModel):
    """What a user submits: structured fields, free text, or both."""

    text: str | None = Field(default=None, description="Free-text claim narrative")
    policy_number: str | None = None
    claimant_name: str | None = None
    vehicle: str | None = None
    date_of_loss: date | None = None
    reported_date: date | None = None
    location: str | None = None
    loss_description: str | None = None
    claimed_amount: float | None = Field(default=None, ge=0)
    police_report: bool = False
    documents: list[str] = Field(default_factory=list)


class Claim(BaseModel):
    """Structured claim produced by the intake node."""

    policy_number: str
    claimant_name: str
    vehicle: str = ""
    date_of_loss: date
    reported_date: date
    location: str = ""
    loss_description: str
    claimed_amount: float = Field(ge=0)
    police_report: bool = False
    documents: list[str] = Field(default_factory=list)


class Coverage(BaseModel):
    deductible: float
    limit: float


class Policy(BaseModel):
    policy_number: str
    holder: str
    vehicle: str
    start_date: date
    end_date: date
    premium_paid: bool
    coverages: dict[str, Coverage]
    prior_claims: list[date] = Field(default_factory=list)


class PolicyCheck(BaseModel):
    passed: bool
    checks: list[dict[str, Any]]
    reason: str


class Citation(BaseModel):
    clause_id: str
    section: str
    title: str
    text: str
    score: float


class CoverageDecision(BaseModel):
    covered: bool
    coverage_type: CoverageType
    rationale: str
    cited_clauses: list[str]
    confidence: float = Field(ge=0, le=1)


class FraudFlag(BaseModel):
    code: str
    label: str
    weight: int
    detail: str


class FraudAssessment(BaseModel):
    score: int = Field(ge=0, le=100)
    level: Literal["low", "medium", "high"]
    flags: list[FraudFlag]


class Settlement(BaseModel):
    approved_cost: float
    deductible: float
    limit: float
    payout: float
    capped: bool


class TraceStep(BaseModel):
    node: str
    label: str
    status: Literal["done", "failed", "skipped"]
    started_at: datetime
    duration_ms: int
    summary: str
    details: list[str] = Field(default_factory=list)


class EvaluationResult(BaseModel):
    decision: Decision
    payout: float
    confidence: float
    risk_score: int
    risk_level: Literal["low", "medium", "high"]
    coverage_type: CoverageType | None = None
    rationale: str
    review_reasons: list[str] = Field(default_factory=list)
    policy_check: PolicyCheck | None = None
    citations: list[Citation] = Field(default_factory=list)
    cited_clauses: list[str] = Field(default_factory=list)
    fraud_flags: list[FraudFlag] = Field(default_factory=list)
    settlement: Settlement | None = None
    trace: list[TraceStep] = Field(default_factory=list)
    mode: Literal["demo", "live"] = "demo"
    total_duration_ms: int = 0


class AuditEvent(BaseModel):
    at: datetime
    actor: str
    action: str
    note: str = ""


class ClaimRecord(BaseModel):
    id: str
    created_at: datetime
    status: ClaimStatus
    input: ClaimInput
    claim: Claim | None = None
    policy: Policy | None = None
    result: EvaluationResult | None = None
    audit: list[AuditEvent] = Field(default_factory=list)


class EvaluateRequest(BaseModel):
    claim_id: str | None = None
    claim: ClaimInput | None = None


class ActionRequest(BaseModel):
    action: Literal["approve", "deny", "escalate"]
    note: str = ""
