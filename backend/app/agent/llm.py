"""Claude client used in live mode (DEMO_MODE=false). Demo mode never touches the network."""

from __future__ import annotations

from datetime import date
from typing import TypeVar

from pydantic import BaseModel

from app import config

T = TypeVar("T", bound=BaseModel)

_client = None


def live_enabled() -> bool:
    return not config.DEMO_MODE


def _get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic()
    return _client


def structured_call(system: str, prompt: str, schema: type[T]) -> T:
    """One Claude call constrained to a Pydantic schema. Raises on refusal or API error."""
    response = _get_client().messages.parse(
        model=config.LLM_MODEL,
        max_tokens=4000,
        system=system,
        output_config={"effort": "low"},
        messages=[{"role": "user", "content": prompt}],
        output_format=schema,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise RuntimeError(f"Model returned no structured output (stop_reason={response.stop_reason})")
    return response.parsed_output


class ExtractedClaim(BaseModel):
    policy_number: str | None = None
    claimant_name: str | None = None
    vehicle: str | None = None
    date_of_loss: date | None = None
    reported_date: date | None = None
    location: str | None = None
    claimed_amount: float | None = None
    police_report: bool = False


class LLMCoverage(BaseModel):
    covered: bool
    rationale: str
    cited_clauses: list[str]
    confidence: float
