"""Runtime configuration. DEMO_MODE (default on) runs the full pipeline with no API keys."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(__file__).parent / "data"


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


DEMO_MODE: bool = _flag("DEMO_MODE", True)
# Artificial per-step latency while streaming in demo mode, so the live timeline is watchable.
DEMO_STEP_DELAY_MS: int = int(os.getenv("DEMO_STEP_DELAY_MS", "650"))
LLM_MODEL: str = os.getenv("CLAIMPILOT_MODEL", "claude-opus-5-5")
CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
]

# Decision thresholds
RISK_REVIEW_THRESHOLD = 60
CONFIDENCE_REVIEW_THRESHOLD = 0.70
