from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import tools


def test_profile_api_next_actions_include_priority_metrics(tmp_path, monkeypatch):
    monkeypatch.setattr(tools.storage, "BASE", tmp_path)
    monkeypatch.setattr(tools.storage, "INDEX", tmp_path / "index.json")

    def dataset_path(dataset_id: str):
        return tmp_path / f"{dataset_id}.csv"

    monkeypatch.setattr(tools.storage, "dataset_path", dataset_path)

    dsid = "ds_actions"
    csv = """feature,impact,confidence
missing,0.8,0.7
future,0.9,0.85
"""
    dataset_path(dsid).parent.mkdir(parents=True, exist_ok=True)
    dataset_path(dsid).write_text(csv, encoding="utf-8")

    report = tools.profile_api(dsid)
    assert report["next_actions"], "should emit next actions"
    action = report["next_actions"][0]
    assert "wsjf" in action and "rice" in action
    assert action["score"] == action["wsjf"]


def test_prioritize_actions_returns_wsjf_and_rice():
    client = TestClient(app)
    payload = {
        "dataset_id": "ds",
        "next_actions": [
            {"title": "A", "impact": 0.9, "effort": 0.5, "confidence": 0.8},
            {"title": "B", "impact": 0.7, "effort": 0.3, "confidence": 0.6},
        ],
    }
    resp = client.post("/api/actions/prioritize", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert all("wsjf" in item and "rice" in item for item in data)
    assert all(item["score"] == item["wsjf"] for item in data)
