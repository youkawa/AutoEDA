from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import storage


def test_pii_apply_updates_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE", tmp_path)
    monkeypatch.setattr(storage, "INDEX", tmp_path / "index.json")
    monkeypatch.setattr(storage, "META_SUFFIX", ".meta.json")

    def dataset_path(dataset_id: str) -> Path:
        path = tmp_path / f"{dataset_id}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text("email,phone\nfoo@example.com,000-0000\n")
        return path

    monkeypatch.setattr(storage, "dataset_path", dataset_path)
    storage.register_dataset("ds1", "sample.csv", 10, 1, 2)

    client = TestClient(app)

    scan = client.post("/api/pii/scan", json={"dataset_id": "ds1", "columns": ["email", "phone"]})
    assert scan.status_code == 200
    resp = client.post(
        "/api/pii/apply",
        json={"dataset_id": "ds1", "mask_policy": "HASH", "columns": ["email"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mask_policy"] == "HASH"
    assert data["masked_fields"] == ["email"]

    scan_after = client.post("/api/pii/scan", json={"dataset_id": "ds1", "columns": ["email", "phone"]})
    assert scan_after.status_code == 200
    scan_data = scan_after.json()
    assert scan_data["mask_policy"] == "HASH"
    assert "masked_fields" in scan_data
    assert scan_data["masked_fields"] == ["email"]
