import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import tools, storage


@pytest.fixture
def temp_dataset(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE", tmp_path)
    monkeypatch.setattr(storage, "INDEX", tmp_path / "index.json")

    def dataset_path(dataset_id: str) -> Path:
        return tmp_path / f"{dataset_id}.csv"

    monkeypatch.setattr(storage, "dataset_path", dataset_path)

    dsid = "ds_chart"
    csv_content = """date,sales,segment,promotion_rate
2024-01-01,100,A,0.10
2024-01-02,130,B,0.12
2024-01-03,95,A,0.05
2024-01-04,160,B,0.20
2024-01-05,180,A,0.25
"""
    dataset_path(dsid).parent.mkdir(parents=True, exist_ok=True)
    dataset_path(dsid).write_text(csv_content, encoding="utf-8")
    return dsid


def test_chart_api_generates_ranked_suggestions(temp_dataset):
    suggestions = tools.chart_api(temp_dataset, k=5)

    assert len(suggestions) == 5
    scores = [s["consistency_score"] for s in suggestions]
    assert all(score >= 0.95 for score in scores)
    assert scores == sorted(scores, reverse=True)
    assert {s["type"] for s in suggestions} >= {"line", "bar"}
    assert all("source_ref" in s and s["source_ref"]["locator"] for s in suggestions)


def test_charts_api_filters_inconsistent(monkeypatch):
    client = TestClient(app)
    payload = [
        {
            "id": "keep",
            "type": "bar",
            "explanation": "consistent",
            "source_ref": {"kind": "figure", "locator": "fig:keep"},
            "consistency_score": 0.97,
        },
        {
            "id": "drop",
            "type": "line",
            "explanation": "low consistency",
            "source_ref": {"kind": "figure", "locator": "fig:drop"},
            "consistency_score": 0.9,
        },
    ]

    monkeypatch.setattr(tools, "chart_api", lambda dataset_id, k=5: payload)

    resp = client.post("/api/charts/suggest", json={"dataset_id": "ds", "k": 5})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["charts"]) == 1
    assert data["charts"][0]["id"] == "keep"
