"""Policy records (the 'policy admin system' for the demo)."""

from __future__ import annotations

import json
from functools import lru_cache

from app.config import DATA_DIR
from app.models import Policy


@lru_cache
def load_policies() -> dict[str, Policy]:
    raw = json.loads((DATA_DIR / "policies.json").read_text())
    return {p["policy_number"]: Policy.model_validate(p) for p in raw}


def get_policy(policy_number: str | None) -> Policy | None:
    if not policy_number:
        return None
    return load_policies().get(policy_number.strip().upper())
