from fastapi.testclient import TestClient

from app import config

config.DEMO_STEP_DELAY_MS = 0
from app.main import app  # noqa: E402

client = TestClient(app)


def test_list_and_stats():
    claims = client.get("/claims").json()
    assert len(claims) >= 10
    stats = client.get("/stats").json()
    assert stats["total"] == len(claims)


def test_evaluate_streams_all_steps():
    body = {"claim": {"policy_number": "CP-1001", "claimant_name": "Maya Chen",
                      "date_of_loss": "2026-11-23", "reported_date": "2026-11-24",
                      "loss_description": "Rear-ended at a red light. Rear bumper, trunk lid and tail light damaged.",
                      "claimed_amount": 4280, "police_report": True}}
    with client.stream("POST", "/claims/evaluate", json=body) as r:
        text = "".join(r.iter_text())
    assert text.count("event: step_end") == 7
    assert "event: result" in text and '"decision": "Approve"' in text


def test_exclusion_denies():
    r = client.get("/claims/CLM-2407").json()
    assert r["result"]["decision"] == "Deny"
    assert "B.3" in [c["clause_id"] for c in r["result"]["citations"]]


def test_get_missing_claim_404():
    assert client.get("/claims/NOPE").status_code == 404
