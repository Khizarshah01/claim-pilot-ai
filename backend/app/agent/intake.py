"""Intake: turn a JSON payload or a free-text narrative into a structured Claim."""

from __future__ import annotations

import re
from datetime import date, datetime

from app.models import Claim, ClaimInput

from .policies import get_policy

_MONTHS = (
    "january|february|march|april|may|june|july|august|september|october|november|december"
)
_ISO_DATE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
_LONG_DATE = re.compile(rf"\b({_MONTHS})\s+(\d{{1,2}}),?\s+(20\d{{2}})\b", re.IGNORECASE)
_POLICY = re.compile(r"\b(CP-\d{3,6})\b", re.IGNORECASE)
_AMOUNT = re.compile(r"\$\s?([\d,]+(?:\.\d{1,2})?)")
_VEHICLE = re.compile(r"\b((?:19|20)\d{2}\s+[A-Z][\w-]+(?:\s+[A-Z0-9][\w-]*){1,2})")
_NAME = re.compile(
    r"(?:this is|my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)", re.IGNORECASE
)


def _dates_in(text: str) -> list[date]:
    found: list[tuple[int, date]] = []
    for m in _ISO_DATE.finditer(text):
        found.append((m.start(), date.fromisoformat(m.group(1))))
    for m in _LONG_DATE.finditer(text):
        d = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y").date()
        found.append((m.start(), d))
    return [d for _, d in sorted(found)]


def parse_free_text(text: str) -> dict:
    """Deterministic extractor used in demo mode (and as the live-mode fallback)."""
    out: dict = {}
    if m := _POLICY.search(text):
        out["policy_number"] = m.group(1).upper()
    if m := _NAME.search(text):
        out["claimant_name"] = m.group(1).strip()
    dates = _dates_in(text)
    if dates:
        out["date_of_loss"] = dates[0]
        if len(dates) > 1:
            out["reported_date"] = dates[1]
    amounts = [float(a.replace(",", "")) for a in _AMOUNT.findall(text)]
    if amounts:
        out["claimed_amount"] = max(amounts)
    if m := _VEHICLE.search(text):
        out["vehicle"] = m.group(1).strip().rstrip(".,")
    out["police_report"] = bool(re.search(r"police report|report number|officer", text, re.I))
    out["loss_description"] = text.strip()
    return out


def build_claim(inp: ClaimInput, extracted: dict | None = None) -> tuple[Claim, list[str]]:
    """Merge explicit fields over extracted ones. Returns the claim and a list of notes."""
    notes: list[str] = []
    data = dict(extracted or {})
    explicit = inp.model_dump(exclude={"text"}, exclude_none=True)
    if not explicit.get("documents"):
        explicit.pop("documents", None)
    if explicit.get("police_report") is False and data.get("police_report"):
        explicit.pop("police_report")
    data.update(explicit)

    policy = get_policy(data.get("policy_number"))
    if not data.get("claimant_name") and policy:
        data["claimant_name"] = policy.holder
        notes.append("Claimant name inferred from policy holder.")
    if not data.get("vehicle") and policy:
        data["vehicle"] = policy.vehicle
        notes.append("Vehicle inferred from policy declarations.")
    if not data.get("reported_date"):
        data["reported_date"] = data.get("date_of_loss") or date.today()
        notes.append("Reported date defaulted to date of loss.")

    missing = [
        f
        for f in ("policy_number", "date_of_loss", "loss_description", "claimed_amount")
        if data.get(f) in (None, "")
    ]
    if missing:
        raise ValueError(f"Could not extract required fields: {', '.join(missing)}")
    data.setdefault("claimant_name", "Unknown claimant")
    data["policy_number"] = str(data["policy_number"]).upper()
    return Claim.model_validate(data), notes
