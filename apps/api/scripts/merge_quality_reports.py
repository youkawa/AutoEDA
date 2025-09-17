#!/usr/bin/env python3
"""Merge SLO/RAG QA reports into a single summary."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

SLO_ENV = "AUTOEDA_SLO_OUTPUT"
RAG_ENV = "AUTOEDA_RAG_OUTPUT"
SUMMARY_ENV = "AUTOEDA_QA_SUMMARY"

DEFAULT_SLO = Path("reports/slo_report.json")
DEFAULT_RAG = Path("reports/rag_report.json")
DEFAULT_SUMMARY = Path("reports/quality_summary.json")


def _load(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _slo_status(payload: Optional[Dict[str, Any]]) -> str:
    if payload is None:
        return "missing"
    violations = payload.get("violations", {})
    has_violation = any(
        isinstance(result, dict) and any(result.values())
        for result in violations.values()
    )
    return "fail" if has_violation else "pass"


def _rag_status(payload: Optional[Dict[str, Any]]) -> str:
    if payload is None:
        return "missing"
    missing = payload.get("report", {}).get("missing", [])
    return "fail" if missing else "pass"


def merge_reports(
    slo_path: Path,
    rag_path: Path,
    summary_path: Path,
) -> Dict[str, Any]:
    slo = _load(slo_path)
    rag = _load(rag_path)

    summary = {
        "slo": {
            "path": str(slo_path),
            "status": _slo_status(slo),
            "data": slo,
        },
        "rag": {
            "path": str(rag_path),
            "status": _rag_status(rag),
            "data": rag,
        },
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


def main(argv: list[str] | None = None) -> int:
    slo_path = Path(os.getenv(SLO_ENV, str(DEFAULT_SLO)))
    rag_path = Path(os.getenv(RAG_ENV, str(DEFAULT_RAG)))
    summary_path = Path(os.getenv(SUMMARY_ENV, str(DEFAULT_SUMMARY)))

    result = merge_reports(slo_path, rag_path, summary_path)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    status = {
        result["slo"]["status"],
        result["rag"]["status"],
    }
    return 1 if "fail" in status else 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
