"""EDA orchestration helpers.

暫定的に profile_api などのツール結果を集約し、設計要求に沿った
構造化レスポンスを生成する。将来的には RAG/LLM 呼び出しとの連携を
このモジュールに集中させる計画。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from . import tools

_REQUIRED_KEYS: Tuple[str, ...] = (
    "summary",
    "distributions",
    "key_features",
    "outliers",
    "data_quality_report",
    "next_actions",
    "references",
)


def _ensure_defaults(report: Dict[str, Any]) -> Dict[str, Any]:
    for key in _REQUIRED_KEYS:
        report.setdefault(key, [] if key != "summary" else {})
    report.setdefault("data_quality_report", {"issues": []})
    report.setdefault("key_features", [])
    report.setdefault("next_actions", [])
    report.setdefault("references", [])
    return report


def _dedup_references(refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    unique: List[Dict[str, Any]] = []
    for ref in refs:
        sig = (
            ref.get("kind"),
            ref.get("locator"),
            ref.get("evidence_id"),
        )
        if sig in seen:
            continue
        seen.add(sig)
        unique.append(ref)
    return unique


def generate_eda_report(dataset_id: str, sample_ratio: Optional[float] = None) -> Dict[str, Any]:
    """Compose the high-level EDA report required by A1."""

    report = tools.profile_api(dataset_id, sample_ratio)
    report = _ensure_defaults(report)

    # ルール: references はユニーク化し、重大度順に next_actions をソートする。
    report["references"] = _dedup_references(list(report.get("references", [])))

    issues = report["data_quality_report"].get("issues", [])
    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    issues.sort(key=lambda it: severity_rank.get(it.get("severity", "medium"), 2))

    actions = report.get("next_actions", [])
    actions.sort(key=lambda it: -float(it.get("score", 0)))

    return report
