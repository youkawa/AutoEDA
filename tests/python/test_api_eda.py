from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import orchestrator, metrics


def test_api_eda_returns_augmented_report(monkeypatch):
    payload = {
        "summary": {"rows": 1000, "cols": 5, "missing_rate": 0.2, "type_mix": {"int": 3}},
        "distributions": [],
        "key_features": ["from orchestrator"],
        "outliers": [],
        "data_quality_report": {"issues": []},
        "next_actions": [
            {
                "title": "Action",
                "impact": 0.8,
                "effort": 0.2,
                "confidence": 0.9,
                "score": 3.42,
                "wsjf": 3.42,
                "rice": 26.28,
            }
        ],
        "references": [{"kind": "doc", "locator": "orchestrator:ref"}],
    }
    evaluation = {"groundedness": 0.9, "llm_latency_ms": 120, "llm_error": None}

    monkeypatch.setattr(orchestrator, "generate_eda_report", lambda dataset_id, sample_ratio=None: (payload, evaluation))

    monkeypatch.setattr(metrics, "persist_event", lambda payload: None)

    client = TestClient(app)
    resp = client.post("/api/eda", json={"dataset_id": "ds_api"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["key_features"] == ["from orchestrator"]
    assert data["next_actions"][0]["title"] == "Action"


def test_api_eda_records_metrics(monkeypatch):
    payload = {
        "summary": {"rows": 1000, "cols": 5, "missing_rate": 0.2, "type_mix": {"int": 3}},
        "distributions": [],
        "key_features": ["from orchestrator"],
        "outliers": [],
        "data_quality_report": {"issues": []},
        "next_actions": [
            {
                "title": "Action",
                "impact": 0.8,
                "effort": 0.2,
                "confidence": 0.9,
                "score": 3.42,
                "wsjf": 3.42,
                "rice": 26.28,
            }
        ],
        "references": [{"kind": "doc", "locator": "orchestrator:ref"}],
    }
    evaluation = {"groundedness": 0.91, "llm_latency_ms": 120, "llm_error": None, "fallback_applied": False}

    monkeypatch.setattr(orchestrator, "generate_eda_report", lambda dataset_id, sample_ratio=None: (payload, evaluation))

    recorded = {}

    def fake_record(event_name, **properties):
        recorded[event_name] = properties

    monkeypatch.setattr(metrics, "record_event", fake_record)
    monkeypatch.setattr(metrics, "persist_event", lambda payload: None)

    client = TestClient(app)
    resp = client.post("/api/eda", json={"dataset_id": "ds_api"})
    assert resp.status_code == 200

    event = recorded["EDAReportGenerated"]
    assert event["groundedness"] == 0.91
    assert event["fallback_applied"] is False
    assert "duration_ms" in event
