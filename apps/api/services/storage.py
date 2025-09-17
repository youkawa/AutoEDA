from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Tuple

BASE = Path(__file__).resolve().parents[2] / "data" / "datasets"


def ensure_dirs() -> None:
    BASE.mkdir(parents=True, exist_ok=True)


def generate_dataset_id() -> str:
    return "ds_" + uuid.uuid4().hex[:8]


def dataset_path(dataset_id: str) -> Path:
    return BASE / f"{dataset_id}.csv"


def save_file(file_obj, dest: Path) -> None:
    with dest.open("wb") as f:
        while True:
            chunk = file_obj.file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)


def save_upload(file_obj) -> Tuple[str, Path]:
    ensure_dirs()
    dsid = generate_dataset_id()
    dest = dataset_path(dsid)
    save_file(file_obj, dest)
    return dsid, dest

