from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import storage


def setup_dataset(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE", tmp_path)
    monkeypatch.setattr(storage, "INDEX", tmp_path / "index.json")
    monkeypatch.setattr(storage, "META_SUFFIX", ".meta.json")

    def dataset_path(dataset_id: str) -> Path:
        path = tmp_path / f"{dataset_id}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text('col\nvalue\n')
        return path

    monkeypatch.setattr(storage, "dataset_path", dataset_path)
    storage.register_dataset("ds_leak", "leak.csv", 10, 1, 1)


def test_leakage_resolve_excludes_columns(tmp_path, monkeypatch):
    setup_dataset(tmp_path, monkeypatch)
    client = TestClient(app)

    scan = client.post("/api/leakage/scan", json={"dataset_id": "ds_leak"})
    assert scan.status_code == 200
    body = scan.json()
    assert "target_next_month" in body["flagged_columns"]

    resp = client.post(
        "/api/leakage/resolve",
        json={"dataset_id": "ds_leak", "action": "exclude", "columns": ["target_next_month"]},
    )
    assert resp.status_code == 200
    resolved = resp.json()
    assert "target_next_month" not in resolved["flagged_columns"]
    assert "target_next_month" in resolved["excluded_columns"]

    scan_after = client.post("/api/leakage/scan", json={"dataset_id": "ds_leak"})
    assert scan_after.status_code == 200
    after = scan_after.json()
    assert "target_next_month" not in after["flagged_columns"]
    assert "target_next_month" in after["excluded_columns"]
