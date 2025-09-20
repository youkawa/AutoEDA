from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

_STORE = Path("data/charts/saved.json")
_STORE.parent.mkdir(parents=True, exist_ok=True)


def _load() -> Dict[str, Any]:
    if not _STORE.exists():
        return {"items": []}
    try:
        return json.loads(_STORE.read_text(encoding="utf-8"))
    except Exception:
        return {"items": []}


def _save(obj: Dict[str, Any]) -> None:
    _STORE.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def add_item(item: Dict[str, Any]) -> Dict[str, Any]:
    data = _load()
    items: List[Dict[str, Any]] = data.get("items", [])
    items.insert(0, item)
    data["items"] = items[:200]  # cap
    _save(data)
    return item


def list_items(dataset_id: str | None = None) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = _load().get("items", [])
    if dataset_id:
        items = [it for it in items if it.get("dataset_id") == dataset_id]
    return items

