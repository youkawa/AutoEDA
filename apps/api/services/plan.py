from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from . import tools
from . import rag


@dataclass
class PlanTask:
    id: str
    title: str
    why: str
    tool: str
    depends_on: List[str]
    acceptance: str


def _task(id_: str, title: str, why: str, tool: str, depends_on: List[str], acceptance: str) -> Dict[str, Any]:
    return {"id": id_, "title": title, "why": why, "tool": tool, "depends_on": depends_on, "acceptance": acceptance}


def generate_plan(dataset_id: str, goals: str | None = None, top_k: int = 5) -> Dict[str, Any]:
    """MVP plan generation without LLM.

    - Use profiling summary and RAG retrieval hints to propose tasks
    - No external calls, deterministic output
    """
    prof = tools.profile_api(dataset_id)
    docs = rag.retrieve(f"EDA plan for {dataset_id}", top_k=min(3, max(1, top_k)))
    rows = prof["summary"]["rows"]
    cols = prof["summary"]["cols"]
    tasks: List[Dict[str, Any]] = []
    tasks.append(_task(
        "profile",
        "基本プロファイルの取得",
        f"行数={rows}, 列数={cols} を確認し、型/欠損率を把握する",
        "profile_api",
        [],
        "要約に rows/cols/missing_rate/type_mix が含まれること",
    ))
    tasks.append(_task(
        "pii-scan",
        "PII の検出",
        "メール/電話/SSN などの秘匿情報を検出し、マスク方針を決める",
        "pii_scan",
        ["profile"],
        "detected_fields が意図に合致し、mask_policy が設定されること",
    ))
    tasks.append(_task(
        "leakage-scan",
        "リーク検査",
        "ターゲットリークの可能性を検出し、除外/確認を行う",
        "leakage_scan",
        ["profile"],
        "flagged_columns が空か、対応が記録されること",
    ))
    tasks.append(_task(
        "charts-suggest",
        "チャート提案の取得",
        "整合性の高い可視化候補を取得し、仮説検証の観点を洗い出す",
        "chart_api",
        ["profile"],
        "候補が1件以上、整合性>=0.95 が存在すること",
    ))
    tasks.append(_task(
        "qna",
        "根拠付きQ&A",
        "関心事項を具体化し、次アクションに必要な根拠を収集する",
        "stats_qna",
        ["profile", "charts-suggest"],
        "coverage>=0.8 を満たす回答が返ること",
    ))
    # attach top references from RAG
    hints = [d.get("locator") or d.get("text", "")[:50] for d in (docs or [])]
    meta = {"hints": hints}
    return {"version": "v1", "tasks": tasks, "meta": meta}

