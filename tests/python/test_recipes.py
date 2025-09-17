import json
from pathlib import Path

from apps.api.services import recipes, storage


def test_build_artifacts_creates_files(tmp_path, monkeypatch):
    monkeypatch.setattr(recipes, "ARTIFACT_DIR", tmp_path)

    sample_csv = 'value\n1\n2\n3\n'

    def dataset_path(dataset_id: str) -> Path:
        path = tmp_path / f"{dataset_id}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(sample_csv)
        return path

    monkeypatch.setattr(storage, "dataset_path", dataset_path)

    dataset_id = "ds_rec"
    report = {
        "summary": {"rows": 100, "cols": 10, "missing_rate": 0.1, "type_mix": {"int": 5}},
        "next_actions": [
            {
                "title": "Fix missing",
                "impact": 0.9,
                "effort": 0.3,
                "confidence": 0.8,
                "score": 2.4,
                "wsjf": 2.4,
                "rice": 12.0,
            }
        ],
        "data_quality_report": {"issues": []},
    }

    paths = recipes.build_artifacts(dataset_id, report)["files"]
    recipe_path = Path(paths[0]["path"])
    assert recipe_path.exists()
    payload = json.loads(recipe_path.read_text())
    assert payload["summary"]["rows"] == 100
    notebook_path = Path(paths[1]["path"])
    assert notebook_path.exists()
    sql_path = Path(paths[2]["path"])
    assert sql_path.exists()
