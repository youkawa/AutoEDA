from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import storage
from apps.api.services import recipes


def prepare_dataset(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "BASE", tmp_path)
    monkeypatch.setattr(storage, "INDEX", tmp_path / "index.json")
    monkeypatch.setattr(storage, "META_SUFFIX", ".meta.json")
    sample_csv = "value\n1\n2\n3\n"

    def dataset_path(dataset_id: str) -> Path:
        path = tmp_path / f"{dataset_id}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(sample_csv)
        return path

    monkeypatch.setattr(storage, "dataset_path", dataset_path)
    storage.register_dataset("ds_recipe", "sample.csv", len(sample_csv), 3, 1)


def test_emit_recipe_generates_artifacts(tmp_path, monkeypatch):
    prepare_dataset(tmp_path, monkeypatch)
    monkeypatch.setattr(recipes, "ARTIFACT_DIR", tmp_path / "recipes")

    client = TestClient(app)
    resp = client.post("/api/recipes/emit", json={"dataset_id": "ds_recipe"})
    assert resp.status_code == 200
    payload = resp.json()
    assert "artifact_hash" in payload
    files = payload["files"]
    assert any(f["name"] == "recipe.json" for f in files)
    assert payload["summary"]["rows"] == 3
    assert payload["measured_summary"]["rows"] == 3
