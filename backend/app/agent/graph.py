"""LangGraph pipeline. Every node is wrapped so it emits step events and a trace entry."""

from __future__ import annotations

import operator
import time
from datetime import date, datetime
from typing import Annotated, Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from app import config
from app.models import (
    Citation,
    Claim,
    ClaimInput,
    CoverageDecision,
    EvaluationResult,
    FraudAssessment,
    Policy,
    PolicyCheck,
    Settlement,
    TraceStep,
)

from . import llm
from .coverage import demo_reasoner, llm_reasoner
from .fraud import assess_fraud, repair_benchmark
from .intake import build_claim, parse_free_text
from .policies import get_policy
from .policy_check import check_policy
from .retrieval import build_query, classify_coverage, retrieve
from .settlement import compute_settlement

STEPS: list[tuple[str, str]] = [
    ("intake", "Intake"),
    ("policy_check", "Policy check"),
    ("retrieval", "Policy retrieval"),
    ("coverage", "Coverage decision"),
    ("fraud", "Fraud signals"),
    ("settlement", "Settlement"),
    ("review_gate", "Human review gate"),
]
_LABELS = dict(STEPS)
# Relative pacing for demo streaming so the timeline feels like real work.
_PACE = {"intake": 0.8, "policy_check": 0.45, "retrieval": 1.0, "coverage": 1.9,
         "fraud": 0.7, "settlement": 0.4, "review_gate": 0.5}


class ClaimState(TypedDict, total=False):
    input: ClaimInput
    other_claim_dates: list[date]
    delay_ms: int
    claim: Claim
    policy: Policy | None
    policy_check: PolicyCheck
    coverage_type: str
    citations: list[Citation]
    coverage: CoverageDecision
    fraud: FraudAssessment
    settlement: Settlement
    result: EvaluationResult
    trace: Annotated[list[TraceStep], operator.add]


NodeFn = Callable[[ClaimState], tuple[dict[str, Any], str, list[str]]]


def _writer():
    try:
        from langgraph.config import get_stream_writer

        return get_stream_writer()
    except Exception:  # not running under a custom stream
        return lambda _event: None


def traced(node: str) -> Callable[[NodeFn], Callable[[ClaimState], dict]]:
    def deco(fn: NodeFn) -> Callable[[ClaimState], dict]:
        def run(state: ClaimState) -> dict:
            write = _writer()
            started = datetime.now()
            t0 = time.perf_counter()
            write({"type": "step_start", "node": node, "label": _LABELS[node]})
            delay = state.get("delay_ms", 0)
            if delay:
                time.sleep(delay * _PACE[node] / 1000)
            try:
                update, summary, details = fn(state)
                status = "done"
            except Exception as exc:
                step = TraceStep(node=node, label=_LABELS[node], status="failed", started_at=started,
                                 duration_ms=int((time.perf_counter() - t0) * 1000),
                                 summary=str(exc), details=[])
                write({"type": "step_end", "step": step.model_dump(mode="json")})
                raise
            step = TraceStep(node=node, label=_LABELS[node], status=status, started_at=started,
                             duration_ms=int((time.perf_counter() - t0) * 1000),
                             summary=summary, details=details)
            write({"type": "step_end", "step": step.model_dump(mode="json")})
            return {**update, "trace": [step]}

        return run

    return deco


@traced("intake")
def intake_node(state: ClaimState):
    inp = state["input"]
    details: list[str] = []
    extracted: dict = {}
    if inp.text:
        if llm.live_enabled():
            try:
                system = "Extract structured auto insurance claim fields from the narrative. Leave unknown fields null."
                extracted = llm.structured_call(system, inp.text, llm.ExtractedClaim).model_dump(exclude_none=True)
                extracted["loss_description"] = inp.text.strip()
                details.append(f"Parsed free text with {config.LLM_MODEL}")
            except Exception as exc:
                extracted = parse_free_text(inp.text)
                details.append(f"LLM extraction unavailable ({type(exc).__name__}); used rule-based parser")
        else:
            extracted = parse_free_text(inp.text)
            details.append("Parsed free-text narrative with rule-based extractor (demo mode)")
    else:
        details.append("Received structured JSON payload")
    claim, notes = build_claim(inp, extracted)
    details += notes
    details += [
        f"Policy {claim.policy_number} · {claim.claimant_name}",
        f"Loss on {claim.date_of_loss}, reported {claim.reported_date}",
        f"Claimed ${claim.claimed_amount:,.2f}" + (" · police report on file" if claim.police_report else ""),
    ]
    return {"claim": claim}, f"Structured claim for {claim.claimant_name}, ${claim.claimed_amount:,.0f}", details


@traced("policy_check")
def policy_check_node(state: ClaimState):
    claim = state["claim"]
    policy = get_policy(claim.policy_number)
    result = check_policy(claim, policy)
    details = [f"{'PASS' if c['passed'] else 'FAIL'} · {c['name']}: {c['detail']}" for c in result.checks]
    summary = "Policy active and in good standing" if result.passed else result.reason
    return {"policy": policy, "policy_check": result}, summary, details


@traced("retrieval")
def retrieval_node(state: ClaimState):
    claim = state["claim"]
    coverage_type = classify_coverage(claim.loss_description)
    citations = retrieve(claim, coverage_type)
    details = [f"Classified loss as {coverage_type}", f"Query: \"{build_query(claim, coverage_type)[:90]}...\""]
    details += [f"{c.clause_id} {c.title} (relevance {c.score:.2f})" for c in citations]
    return ({"coverage_type": coverage_type, "citations": citations},
            f"Retrieved {len(citations)} clauses from Form PA-2026", details)


@traced("coverage")
def coverage_node(state: ClaimState):
    claim, policy = state["claim"], state["policy"]
    assert policy is not None
    ctype = state["coverage_type"]
    citations = state["citations"]
    details: list[str] = []
    if llm.live_enabled():
        try:
            decision = llm_reasoner(claim, policy, ctype, citations)  # type: ignore[arg-type]
            details.append(f"Reasoned over {len(citations)} retrieved clauses with {config.LLM_MODEL}")
        except Exception as exc:
            decision = demo_reasoner(claim, policy, ctype, citations)  # type: ignore[arg-type]
            details.append(f"LLM unavailable ({type(exc).__name__}); used canned reasoner")
    else:
        decision = demo_reasoner(claim, policy, ctype, citations)  # type: ignore[arg-type]
        details.append(f"Reasoned over {len(citations)} retrieved clauses (demo mode, canned LLM)")
    details.append(decision.rationale)
    details.append(f"Cited: {', '.join(decision.cited_clauses)} · confidence {decision.confidence:.0%}")
    summary = f"{'Covered' if decision.covered else 'Not covered'} under {ctype}"
    return {"coverage": decision}, summary, details


@traced("fraud")
def fraud_node(state: ClaimState):
    claim, policy = state["claim"], state["policy"]
    fa = assess_fraud(claim, policy, state.get("other_claim_dates", []))
    benchmark, basis = repair_benchmark(claim.loss_description)
    details = [f"Repair benchmark: ${benchmark:,.0f} ({basis})"]
    details += [f"+{f.weight} {f.label}: {f.detail}" for f in fa.flags] or ["No fraud signals triggered"]
    return {"fraud": fa}, f"Risk score {fa.score}/100 ({fa.level})", details


@traced("settlement")
def settlement_node(state: ClaimState):
    claim, policy = state["claim"], state["policy"]
    assert policy is not None
    ctype = state["coverage_type"]
    cov = policy.coverages.get(ctype)
    if cov is None or not state["coverage"].covered:
        s = compute_settlement(claim.claimed_amount, cov.deductible if cov else 0, 0)
        return {"settlement": s}, "No payable amount: loss not covered", ["Payout set to $0.00"]
    s = compute_settlement(claim.claimed_amount, cov.deductible, cov.limit)
    details = [
        f"Approved cost ${s.approved_cost:,.2f}",
        f"Less {ctype} deductible ${s.deductible:,.2f} (A.3)",
        f"Limit ${s.limit:,.2f} (A.4)" + (" · payout capped" if s.capped else ""),
        f"Payout ${s.payout:,.2f}",
    ]
    return {"settlement": s}, f"Payout ${s.payout:,.2f}", details


@traced("review_gate")
def review_gate_node(state: ClaimState):
    pc = state["policy_check"]
    trace = state.get("trace", [])
    total_ms = sum(t.duration_ms for t in trace)
    mode = "live" if llm.live_enabled() else "demo"
    if not pc.passed:
        result = EvaluationResult(
            decision="Deny", payout=0, confidence=0.98, risk_score=0, risk_level="low",
            rationale=f"Policy validation failed: {pc.reason}.", policy_check=pc, mode=mode,
            total_duration_ms=total_ms,
        )
        return {"result": result}, "Auto-denied: policy validation failed", ["Deterministic denial, no review needed"]

    cov, fa, s = state["coverage"], state["fraud"], state["settlement"]
    reasons: list[str] = []
    if fa.score > config.RISK_REVIEW_THRESHOLD:
        reasons.append(f"Fraud risk {fa.score} exceeds threshold {config.RISK_REVIEW_THRESHOLD}")
    if cov.confidence < config.CONFIDENCE_REVIEW_THRESHOLD:
        reasons.append(f"Confidence {cov.confidence:.0%} below {config.CONFIDENCE_REVIEW_THRESHOLD:.0%}")

    if not cov.covered and not reasons:
        decision = "Deny"
    elif reasons:
        decision = "Review"
    else:
        decision = "Approve"
    cited = {c for c in cov.cited_clauses}
    citations = sorted(state["citations"], key=lambda c: (c.clause_id not in cited, -c.score))
    result = EvaluationResult(
        decision=decision,  # type: ignore[arg-type]
        payout=s.payout if (cov.covered and decision != "Deny") else 0,
        confidence=cov.confidence,
        risk_score=fa.score,
        risk_level=fa.level,
        coverage_type=cov.coverage_type,
        rationale=cov.rationale,
        review_reasons=reasons,
        policy_check=pc,
        citations=citations,
        fraud_flags=fa.flags,
        settlement=s,
        mode=mode,
        total_duration_ms=total_ms,
    )
    summary = {
        "Approve": "Auto-approved, within risk and confidence thresholds",
        "Deny": "Auto-denied on policy terms",
        "Review": "Routed to adjuster review",
    }[decision]
    return {"result": result}, summary, reasons or ["All gates passed"]


def _after_policy_check(state: ClaimState) -> str:
    return "retrieval" if state["policy_check"].passed else "review_gate"


def build_graph():
    g = StateGraph(ClaimState)
    g.add_node("intake", intake_node)
    g.add_node("policy_check", policy_check_node)
    g.add_node("retrieval", retrieval_node)
    g.add_node("coverage", coverage_node)
    g.add_node("fraud", fraud_node)
    g.add_node("settlement", settlement_node)
    g.add_node("review_gate", review_gate_node)
    g.add_edge(START, "intake")
    g.add_edge("intake", "policy_check")
    g.add_conditional_edges("policy_check", _after_policy_check, ["retrieval", "review_gate"])
    g.add_edge("retrieval", "coverage")
    g.add_edge("coverage", "fraud")
    g.add_edge("fraud", "settlement")
    g.add_edge("settlement", "review_gate")
    g.add_edge("review_gate", END)
    return g.compile()


GRAPH = build_graph()


def finalize(state: dict) -> EvaluationResult:
    result: EvaluationResult = state["result"]
    result.trace = list(state.get("trace", []))
    result.total_duration_ms = sum(t.duration_ms for t in result.trace)
    return result


def run_sync(inp: ClaimInput, other_claim_dates: list[date] | None = None) -> tuple[Claim, Policy | None, EvaluationResult]:
    state = GRAPH.invoke({"input": inp, "other_claim_dates": other_claim_dates or [], "delay_ms": 0, "trace": []})
    return state["claim"], state.get("policy"), finalize(state)
