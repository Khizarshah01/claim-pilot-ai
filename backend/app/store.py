"""In-memory claim store, seeded from data/seed_claims.json at startup."""

from __future__ import annotations

import json
import threading
from collections import Counter
from datetime import date, datetime, timedelta

from app.config import DATA_DIR
from app.models import AuditEvent, ClaimInput, ClaimRecord, EvaluationResult

from .agent.graph import run_sync
from .agent.intake import build_claim, parse_free_text
from .agent.policies import get_policy

_STATUS = {"Approve": "approved", "Deny": "denied", "Review": "in_review"}


class ClaimStore:
    def __init__(self) -> None:
        self._claims: dict[str, ClaimRecord] = {}
        self._lock = threading.Lock()
        self._seq = 2500

    # ---- queries -------------------------------------------------------
    def list(self) -> list[ClaimRecord]:
        return sorted(self._claims.values(), key=lambda r: r.created_at, reverse=True)

    def get(self, claim_id: str) -> ClaimRecord | None:
        return self._claims.get(claim_id)

    def other_claim_dates(self, record: ClaimRecord) -> list[date]:
        if record.claim is None:
            return []
        return [
            r.claim.date_of_loss
            for r in self._claims.values()
            if r.id != record.id and r.claim and r.claim.policy_number == record.claim.policy_number
            and r.created_at < record.created_at
        ]

    # ---- mutations -----------------------------------------------------
    def create(self, inp: ClaimInput, claim_id: str | None = None, created_at: datetime | None = None) -> ClaimRecord:
        with self._lock:
            if claim_id is None:
                self._seq += 1
                claim_id = f"CLM-{self._seq}"
            record = ClaimRecord(id=claim_id, created_at=created_at or datetime.now(), status="pending", input=inp)
            try:  # best-effort preview so the inbox can render before evaluation
                record.claim, _ = build_claim(inp, parse_free_text(inp.text) if inp.text else None)
                record.policy = get_policy(record.claim.policy_number)
            except ValueError:
                pass
            record.audit.append(AuditEvent(at=record.created_at, actor="Intake", action="Claim received"))
            self._claims[claim_id] = record
            return record

    def apply_result(self, record: ClaimRecord, claim, policy, result: EvaluationResult) -> ClaimRecord:
        record.claim, record.policy, record.result = claim, policy, result
        record.status = _STATUS[result.decision]  # type: ignore[assignment]
        verb = {"Approve": "Auto-approved", "Deny": "Auto-denied", "Review": "Routed to adjuster"}[result.decision]
        record.audit.append(AuditEvent(at=datetime.now(), actor="ClaimPilot agent", action=verb,
                                       note=f"Confidence {result.confidence:.0%}, risk {result.risk_score}"))
        return record

    def action(self, record: ClaimRecord, action: str, note: str = "") -> ClaimRecord:
        record.status = {"approve": "approved", "deny": "denied", "escalate": "in_review"}[action]  # type: ignore[assignment]
        label = {"approve": "Approved by adjuster", "deny": "Denied by adjuster", "escalate": "Sent to adjuster"}[action]
        record.audit.append(AuditEvent(at=datetime.now(), actor="You", action=label, note=note))
        return record

    def evaluate_sync(self, record: ClaimRecord) -> ClaimRecord:
        claim, policy, result = run_sync(record.input, self.other_claim_dates(record))
        # stamp trace times relative to claim creation so seeded history looks coherent
        return self.apply_result(record, claim, policy, result)

    # ---- analytics -----------------------------------------------------
    def stats(self) -> dict:
        records = self.list()
        status = Counter(r.status for r in records)
        evaluated = [r for r in records if r.result]
        auto = [r for r in evaluated if r.result and r.result.decision != "Review"]
        payout = sum(r.result.payout for r in records if r.result and r.status == "approved")
        avg_ms = sum(r.result.total_duration_ms for r in evaluated if r.result) / max(len(evaluated), 1)
        avg_risk = sum(r.result.risk_score for r in evaluated if r.result) / max(len(evaluated), 1)
        today = date.today()
        days = [today - timedelta(days=i) for i in range(13, -1, -1)]
        by_day = {d.isoformat(): {"date": d.isoformat(), "approved": 0, "denied": 0, "in_review": 0, "pending": 0} for d in days}
        for r in records:
            k = r.created_at.date().isoformat()
            if k in by_day:
                by_day[k][r.status] += 1
        flags = Counter(f.label for r in evaluated if r.result for f in r.result.fraud_flags)
        return {
            "total": len(records),
            "by_status": {s: status.get(s, 0) for s in ("approved", "denied", "in_review", "pending")},
            "auto_decision_rate": round(len(auto) / max(len(evaluated), 1), 3),
            "approval_rate": round(status.get("approved", 0) / max(len(evaluated), 1), 3),
            "total_payout": round(payout, 2),
            "avg_decision_ms": round(avg_ms),
            "avg_risk": round(avg_risk, 1),
            "timeline": list(by_day.values()),
            "top_flags": [{"label": k, "count": v} for k, v in flags.most_common(5)],
        }


def seed(store: ClaimStore) -> None:
    for item in json.loads((DATA_DIR / "seed_claims.json").read_text()):
        rec = store.create(ClaimInput.model_validate(item["input"]), item["id"], datetime.fromisoformat(item["created_at"]))
        if not item.get("pending"):
            store.evaluate_sync(rec)


STORE = ClaimStore()
