#!/usr/bin/env python3
"""RAG ゴールデンセット検証スクリプト."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.services import rag  # noqa: E402

OUTPUT_ENV = "AUTOEDA_RAG_OUTPUT"


def load_queries(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Golden queries file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def run_checks(path: Path) -> Dict[str, Any]:
    rag.load_default_corpus()
    queries = load_queries(path)
    report = rag.evaluate_golden_queries(queries)
    return {
        "queries": queries,
        "report": report,
        "golden_path": str(path),
    }


def default_golden_path() -> Path:
    return Path(os.getenv("AUTOEDA_RAG_GOLDEN_PATH", "docs/rag_golden.json"))


def write_output(payload: Dict[str, Any], destination: str | None) -> None:
    if not destination:
        return
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main(argv: List[str] | None = None) -> int:
    argv = argv or sys.argv[1:]
    target = Path(argv[0]) if argv else default_golden_path()
    result = run_checks(target)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    write_output(result, os.getenv(OUTPUT_ENV))
    missing = result["report"].get("missing", [])
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
