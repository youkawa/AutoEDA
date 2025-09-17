from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Dict, List, Tuple

BASE = Path(__file__).resolve().parents[2] / "data" / "datasets"
INDEX = BASE / "index.json"


def ensure_dirs() -> None:
    BASE.mkdir(parents=True, exist_ok=True)


def generate_dataset_id() -> str:
    return "ds_" + uuid.uuid4().hex[:8]


def dataset_path(dataset_id: str) -> Path:
    return BASE / f"{dataset_id}.csv"


def _read_chunks(file_obj, chunk_size: int = 1024 * 1024):
    while True:
        chunk = file_obj.file.read(chunk_size)
        if not chunk:
            break
        yield chunk


def save_file(file_obj, dest: Path, max_bytes: int | None = None) -> int:
    total = 0
    with dest.open("wb") as f:
        for chunk in _read_chunks(file_obj):
            total += len(chunk)
            if max_bytes is not None and total > max_bytes:
                # cleanup partial file
                try:
                    f.close()
                finally:
                    if dest.exists():
                        dest.unlink(missing_ok=True)
                raise ValueError("file too large")
            f.write(chunk)
    return total


def scan_csv_metadata(path: Path, max_rows: int = 200_000) -> Dict[str, int]:
    rows = 0
    cols = 0
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        header = f.readline()
        cols = header.count(",") + 1 if header else 0
        for _ in f:
            rows += 1
            if rows >= max_rows:
                break
    return {"rows": rows, "cols": cols}


def _load_index() -> Dict[str, Dict]:
    if not INDEX.exists():
        return {"datasets": []}
    try:
        return json.loads(INDEX.read_text())
    except Exception:
        return {"datasets": []}


def _save_index(data: Dict[str, List[Dict]]) -> None:
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def register_dataset(dataset_id: str, filename: str, size_bytes: int, rows: int, cols: int) -> None:
    data = _load_index()
    ds = {
        "id": dataset_id,
        "name": filename,
        "rows": rows,
        "cols": cols,
    }
    # upsert by id
    items = [d for d in data.get("datasets", []) if d.get("id") != dataset_id]
    items.append(ds)
    data["datasets"] = items
    _save_index(data)


def list_datasets() -> List[Dict]:
    return _load_index().get("datasets", [])


def save_upload(file_obj, *, max_bytes: int = 100 * 1024 * 1024, max_cols: int = 50) -> Tuple[str, Path]:
    ensure_dirs()
    ext_ok = str(file_obj.filename or "").lower().endswith(".csv")
    if not ext_ok:
        raise ValueError("unsupported file type: only .csv allowed")
    dsid = generate_dataset_id()
    dest = dataset_path(dsid)
    size = save_file(file_obj, dest, max_bytes=max_bytes)
    meta = scan_csv_metadata(dest)
    if meta["cols"] > max_cols:
        dest.unlink(missing_ok=True)
        raise ValueError("too many columns")
    register_dataset(dsid, file_obj.filename or dest.name, size, meta["rows"], meta["cols"])
    return dsid, dest
