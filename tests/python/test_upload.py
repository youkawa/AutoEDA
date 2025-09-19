from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import storage


def _setup_tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE", tmp_path)
    monkeypatch.setattr(storage, "INDEX", tmp_path / "index.json")


def test_upload_csv_success(tmp_path, monkeypatch):
    _setup_tmp_storage(tmp_path, monkeypatch)
    client = TestClient(app)

    csv_content = "date,sales\n2024-01-01,100\n"
    files = {"file": ("sample.csv", csv_content, "text/csv")}
    resp = client.post("/api/datasets/upload", files=files)

    assert resp.status_code == 200
    data = resp.json()
    assert "dataset_id" in data and data["dataset_id"].startswith("ds_")

    # index.json should be created and contain the dataset
    index_path = tmp_path / "index.json"
    assert index_path.exists()
    content = index_path.read_text()
    assert data["dataset_id"] in content


def test_upload_rejects_non_csv(tmp_path, monkeypatch):
    _setup_tmp_storage(tmp_path, monkeypatch)
    client = TestClient(app)

    files = {"file": ("sample.txt", "hello", "text/plain")}
    resp = client.post("/api/datasets/upload", files=files)
    assert resp.status_code == 400
    assert "only .csv" in resp.json().get("detail", "")

