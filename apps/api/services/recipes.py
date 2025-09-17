"""Recipe artifact generation utilities."""

from __future__ import annotations

import json
import textwrap
import hashlib
from pathlib import Path
from typing import Dict, Any, List

from . import storage

ARTIFACT_DIR = Path("data") / "recipes"


def ensure_dir(dataset_id: str) -> Path:
    path = ARTIFACT_DIR / dataset_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def generate_recipe(dataset_id: str, report: Dict[str, Any]) -> Path:
    target = ensure_dir(dataset_id) / "recipe.json"
    payload = {
        "dataset_id": dataset_id,
        "summary": report.get("summary", {}),
        "next_actions": report.get("next_actions", []),
        "data_quality_report": report.get("data_quality_report", {}),
        "references": report.get("references", []),
    }
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    return target


def generate_notebook(dataset_id: str, report: Dict[str, Any], sample_path: Path) -> Path:
    nb = ensure_dir(dataset_id) / "eda.ipynb"
    cells = [
        {
            "cell_type": "markdown",
            "metadata": {},
            "source": [f"# AutoEDA recipe for {dataset_id}\n"],
        },
        {
            "cell_type": "code",
            "metadata": {},
            "source": [
                "import pandas as pd\n",
                f"df = pd.read_csv('{sample_path.as_posix()}')\n",
                "df.head()\n",
            ],
            "outputs": [],
            "execution_count": None,
        },
    ]
    nb.write_text(json.dumps({"cells": cells, "metadata": {}, "nbformat": 4, "nbformat_minor": 5}))
    return nb


def generate_sql(dataset_id: str, report: Dict[str, Any], sample_path: Path) -> Path:
    sql = ensure_dir(dataset_id) / "sampling.sql"
    sql.write_text(
        textwrap.dedent(
            f"""
            -- Auto-generated sampling query for {dataset_id}
            SELECT * FROM external_csv('{sample_path.as_posix()}')
            LIMIT 1000;
            """
        ).strip()
    )
    return sql


def build_artifacts(dataset_id: str, report: Dict[str, Any]) -> Dict[str, Any]:
    ensure_dir(dataset_id)
    sample_path = storage.dataset_path(dataset_id)
    created_sample = False
    if not sample_path.exists():
        sample_path = ensure_dir(dataset_id) / f"{dataset_id}_sample.csv"
        sample_path.write_text("value\n0\n")
        created_sample = True

    recipe_path = generate_recipe(dataset_id, report)
    notebook_path = generate_notebook(dataset_id, report, sample_path)
    sql_path = generate_sql(dataset_id, report, sample_path)

    files = [recipe_path, notebook_path, sql_path]

    return {
        "files": [
            {
                "name": f.name,
                "path": f.as_posix(),
                "size_bytes": f.stat().st_size,
            }
            for f in files
        ],
        "sample_created": created_sample,
        "dataset_path": sample_path.as_posix(),
    }


def compute_summary(dataset_path: Path) -> Dict[str, Any]:
    rows = 0
    cols = 0
    try:  # use pandas if available
        import pandas as pd  # type: ignore

        df = pd.read_csv(dataset_path)
        rows, cols = int(df.shape[0]), int(df.shape[1])
        missing_rate = float(df.isna().sum().sum()) / float(max(rows * max(cols, 1), 1))
        return {"rows": rows, "cols": cols, "missing_rate": round(missing_rate, 4)}
    except Exception:
        with dataset_path.open("r", encoding="utf-8", errors="ignore") as f:
            header = f.readline()
            cols = header.count(",") + 1 if header else 0
            for _ in f:
                rows += 1
        return {"rows": rows, "cols": cols, "missing_rate": 0.0}


def within_tolerance(original: Dict[str, Any], measured: Dict[str, Any], tolerance: float = 0.01) -> bool:
    for key in ("rows", "cols", "missing_rate"):
        if key not in original or key not in measured:
            continue
        base = float(original[key]) or 1.0
        delta = abs(float(measured[key]) - float(original[key])) / base
        if delta > tolerance:
            return False
    return True


def hash_files(files: List[Dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for info in files:
        path = Path(info["path"])
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]
