"""ClaimPilot API."""

from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app import config
from app.agent.graph import GRAPH, STEPS, finalize
from app.agent.policies import load_policies
from app.models import ActionRequest, ClaimInput, ClaimRecord, EvaluateRequest
from app.store import STORE, seed

app = FastAPI(title="ClaimPilot API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=config.CORS_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)
seed(STORE)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "demo_mode": config.DEMO_MODE, "model": config.LLM_MODEL}


@app.get("/meta")
def meta() -> dict:
    return {
        "demo_mode": config.DEMO_MODE,
        "steps": [{"node": n, "label": label} for n, label in STEPS],
        "policies": [p.model_dump(mode="json") for p in load_policies().values()],
    }


@app.get("/claims", response_model=list[ClaimRecord])
def list_claims() -> list[ClaimRecord]:
    return STORE.list()


@app.post("/claims", response_model=ClaimRecord, status_code=201)
def create_claim(inp: ClaimInput) -> ClaimRecord:
    if not inp.text and not inp.loss_description:
        raise HTTPException(422, "Provide a free-text narrative or a loss description")
    return STORE.create(inp)


@app.get("/claims/{claim_id}", response_model=ClaimRecord)
def get_claim(claim_id: str) -> ClaimRecord:
    rec = STORE.get(claim_id)
    if rec is None:
        raise HTTPException(404, f"Claim {claim_id} not found")
    return rec


@app.post("/claims/{claim_id}/action", response_model=ClaimRecord)
def claim_action(claim_id: str, body: ActionRequest) -> ClaimRecord:
    rec = get_claim(claim_id)
    return STORE.action(rec, body.action, body.note)


@app.post("/claims/evaluate")
def evaluate(body: EvaluateRequest) -> StreamingResponse:
    """Run the agent and stream step events over SSE (POST, consumed with fetch streaming)."""
    if body.claim_id:
        rec = get_claim(body.claim_id)
    elif body.claim:
        rec = STORE.create(body.claim)
    else:
        raise HTTPException(422, "Provide claim_id or claim")

    def stream() -> Iterator[str]:
        yield _sse("claim", {"id": rec.id})
        state: dict = {}
        init = {
            "input": rec.input,
            "other_claim_dates": STORE.other_claim_dates(rec),
            "delay_ms": config.DEMO_STEP_DELAY_MS if config.DEMO_MODE else 0,
            "trace": [],
        }
        try:
            for mode, chunk in GRAPH.stream(init, stream_mode=["custom", "values"]):
                if mode == "custom":
                    yield _sse(chunk["type"], chunk)
                else:
                    state = chunk
            result = finalize(state)
            STORE.apply_result(rec, state["claim"], state.get("policy"), result)
            yield _sse("result", rec.model_dump(mode="json"))
        except Exception as exc:  # surface pipeline errors to the UI instead of dropping the stream
            yield _sse("error", {"message": str(exc)})

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/stats")
def stats() -> dict:
    return STORE.stats()
