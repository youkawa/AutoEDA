"""EDA orchestration helpers with RAG/LLM integration and robust fallback.

設計要求に合わせて profile/PII/リーク検査などのツール結果を集約し、
可能であれば LLM を用いて key_features / next_actions を拡張する。
LLM 失敗時にはツールの結果のみを基に安全なレスポンスへフォールバックする。
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

from apps.api import config

from . import rag, tools

try:
    from openai import OpenAI  # type: ignore
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore

try:  # pragma: no cover - optional dependency
    import google.generativeai as genai  # type: ignore
except ImportError:  # pragma: no cover
    genai = None  # type: ignore

LOGGER = logging.getLogger(__name__)

_REQUIRED_KEYS: Tuple[str, ...] = (
    "summary",
    "distributions",
    "key_features",
    "outliers",
    "data_quality_report",
    "next_actions",
    "references",
)


OrchestrationResult = Tuple[Dict[str, Any], Dict[str, Any]]

_rag_seeded = False


def generate_eda_report(dataset_id: str, sample_ratio: Optional[float] = None) -> OrchestrationResult:
    """Compose the high-level EDA report required by A1 with RAG/LLM support."""

    global _rag_seeded
    if not _rag_seeded:
        rag.load_default_corpus()
        _rag_seeded = True

    profile = tools.profile_api(dataset_id, sample_ratio)
    pii = _safe_tool_call(lambda: tools.pii_scan(dataset_id))
    leakage = _safe_tool_call(lambda: tools.leakage_scan(dataset_id))

    report = _ensure_defaults(profile)
    report = _enrich_references(report, pii, leakage)

    llm_payload: Optional[Dict[str, Any]] = None
    llm_latency_ms: Optional[int] = None
    llm_error: Optional[str] = None
    fallback_applied = False

    try:
        t0 = time.perf_counter()
        context_docs = _retrieve_context(report)
        llm_payload = _invoke_llm_agent(dataset_id, report, pii, leakage, context_docs)
        llm_latency_ms = int((time.perf_counter() - t0) * 1000)
        if llm_payload:
            report = _merge_llm_payload(report, llm_payload)
    except Exception as exc:  # pragma: no cover - guarded fallback path
        llm_error = str(exc)
        LOGGER.warning("LLM orchestration failed; falling back to tool-only summary", exc_info=True)
        fallback_applied = True

    if not llm_payload:
        report = _tool_only_enrichment(report, pii, leakage)
        fallback_applied = True if llm_error or llm_payload is None else fallback_applied

    report = _finalize_report(report)
    evaluation = _evaluate(report, llm_latency_ms, llm_error, fallback_applied)

    return report, evaluation


# ---------------------------------------------------------------------------
# QnA (B1)
# ---------------------------------------------------------------------------

def answer_qna(dataset_id: str, question: str) -> List[Dict[str, Any]]:
    """Return grounded answers for a question. Uses RAG + LLM when possible.

    Falls back to tool-only stats_qna when LLM is unavailable or fails.
    """
    try:
        # Build a light-weight context using EDA tools (no heavy profiling)
        profile = tools.profile_api(dataset_id)
        pii = _safe_tool_call(lambda: tools.pii_scan(dataset_id))
        leakage = _safe_tool_call(lambda: tools.leakage_scan(dataset_id))
        report = _ensure_defaults(profile)
        context_docs = _retrieve_context(report)

        provider = config.get_llm_provider()

        prompt = _build_qna_prompt(dataset_id, question, report, pii, leakage, context_docs)

        text: Optional[str] = None
        if provider == "gemini":
            api_key = config.get_gemini_api_key()
            if genai is None:
                raise RuntimeError("Gemini client library not installed")
            genai.configure(api_key=api_key)
            model_name = os.getenv("AUTOEDA_GEMINI_MODEL", "gemini-1.5-flash")
            generation_config = {
                "temperature": 0.2,
                "max_output_tokens": 800,
                "response_mime_type": "application/json",
            }
            model = genai.GenerativeModel(model_name, system_instruction=prompt["system"])
            response = model.generate_content(prompt["user"], generation_config=generation_config)
            text = _extract_gemini_text(response)
        else:
            api_key = config.get_openai_api_key()
            if OpenAI is None:
                raise RuntimeError("OpenAI client library not installed")
            model_name = os.getenv("AUTOEDA_LLM_MODEL", "gpt-4o-mini")
            client = OpenAI(api_key=api_key)
            response = client.responses.create(
                model=model_name,
                input=[
                    {"role": "system", "content": prompt["system"]},
                    {"role": "user", "content": prompt["user"]},
                ],
                temperature=0.2,
                max_output_tokens=800,
            )
            text = _extract_text(response)

        if not text:
            raise RuntimeError("empty response from LLM")

        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            from re import search, DOTALL
            m = search(r"\{.*\}\s*$", text, DOTALL) or search(r"\{.*\}", text, DOTALL)
            if not m:
                raise
            obj = json.loads(m.group(0))

        answers = obj.get("answers") or obj
        if isinstance(answers, dict):
            answers = [answers]
        result: List[Dict[str, Any]] = []
        for ans in answers or []:
            text = ans.get("text") or ans.get("answer")
            refs = ans.get("references") or []
            cov = float(ans.get("coverage", 0.85))
            if not isinstance(refs, list):
                refs = []
            result.append({"text": text or "", "references": refs, "coverage": cov})

        if not result:
            raise RuntimeError("LLM returned empty answers")

        return result
    except Exception:
        LOGGER.warning("QnA LLM failed; falling back to tool-only answer", exc_info=True)
        return tools.stats_qna(dataset_id, question)


def _build_qna_prompt(
    dataset_id: str,
    question: str,
    report: Dict[str, Any],
    pii: Optional[Dict[str, Any]],
    leakage: Optional[Dict[str, Any]],
    context_docs: List[Dict[str, Any]],
) -> Dict[str, str]:
    system_prompt = (
        "あなたはAutoEDAのQ&Aアシスタントです。データの統計/品質レポートとRAG文書を根拠に、"
        "日本語で簡潔な回答を返します。必ずJSONで返し、各回答は `text` と `references` と `coverage` を含めます。"
        "references は {kind, locator} の配列です。hallucinationを避け、根拠が弱い場合はcoverageを低く設定します。"
    )
    summary = report.get("summary", {})
    issues = report.get("data_quality_report", {}).get("issues", [])
    context_parts = [
        f"dataset_id: {dataset_id}",
        f"question: {question}",
        f"rows: {summary.get('rows')}",
        f"cols: {summary.get('cols')}",
        f"missing_rate: {summary.get('missing_rate')}",
        f"issues: {json.dumps(issues, ensure_ascii=False)}",
        f"pii: {json.dumps(pii, ensure_ascii=False)}",
        f"leakage: {json.dumps(leakage, ensure_ascii=False)}",
    ]
    context_excerpt = "\n".join(
        f"- {doc.get('text', '')[:400]}" for doc in context_docs if doc.get("text")
    )
    user_prompt = (
        "\n".join(context_parts)
        + "\n関連ドキュメント:\n"
        + context_excerpt
        + "\n返却形式: {\"answers\": [{\"text\": string, \"references\": Reference[], \"coverage\": number(0..1)}]}"
    )
    return {"system": system_prompt, "user": user_prompt}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_tool_call(fn):
    try:
        return fn()
    except Exception as exc:  # pragma: no cover
        LOGGER.warning("Tool call failed: %s", exc)
        return None


def _ensure_defaults(report: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(report)
    for key in _REQUIRED_KEYS:
        if key == "summary":
            data.setdefault("summary", {})
        elif key == "data_quality_report":
            data.setdefault("data_quality_report", {"issues": []})
        else:
            data.setdefault(key, [])
    if "keyFeatures" in data and not data.get("key_features"):
        data["key_features"] = data.pop("keyFeatures")

    summary = data.get("summary", {})
    if "missingRate" in summary and "missing_rate" not in summary:
        summary["missing_rate"] = summary.pop("missingRate")
    if "typeMix" in summary and "type_mix" not in summary:
        summary["type_mix"] = summary.pop("typeMix")
    data["summary"] = summary
    return data


def _retrieve_context(report: Dict[str, Any]) -> List[Dict[str, Any]]:
    summary = report.get("summary", {})
    issues = report.get("data_quality_report", {}).get("issues", [])
    query_terms = [
        f"rows {summary.get('rows')}",
        f"cols {summary.get('cols')}",
    ]
    for issue in issues[:5]:
        query_terms.append(f"issue {issue.get('column')} {issue.get('description')}")
    query = " ".join(filter(None, query_terms)) or "autoeda requirements"
    return rag.retrieve(query, top_k=5)


def _enrich_references(report: Dict[str, Any], pii: Optional[Dict[str, Any]], leakage: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    refs = list(report.get("references", []))
    for issue in report.get("data_quality_report", {}).get("issues", []):
        ref = issue.get("evidence")
        if ref:
            refs.append(ref)
    if pii and pii.get("detected_fields"):
        refs.append({"kind": "doc", "locator": "policy:pii"})
    if leakage and leakage.get("flagged_columns"):
        refs.append({"kind": "doc", "locator": "policy:leakage"})
    report["references"] = _dedup_references(refs)
    return report


def _invoke_llm_agent(
    dataset_id: str,
    report: Dict[str, Any],
    pii: Optional[Dict[str, Any]],
    leakage: Optional[Dict[str, Any]],
    context_docs: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Invoke LLM to synthesize insights. Falls back silently if not configured."""

    provider = config.get_llm_provider()
    prompt = _build_system_prompt(dataset_id, report, pii, leakage, context_docs)

    if provider == "gemini":
        try:
            api_key = config.get_gemini_api_key()
        except config.CredentialsError as exc:
            raise RuntimeError(str(exc))
        if genai is None:
            raise RuntimeError("Gemini client library not installed")

        genai.configure(api_key=api_key)
        model_name = os.getenv("AUTOEDA_GEMINI_MODEL", "gemini-1.5-flash")
        generation_config = {
            "temperature": 0.3,
            "max_output_tokens": 1200,
            # 可能ならJSON強制（Gemini 1.5+）
            "response_mime_type": "application/json",
        }
        model = genai.GenerativeModel(model_name, system_instruction=prompt["system"])
        response = model.generate_content(
            prompt["user"],
            generation_config=generation_config,
        )
        text = _extract_gemini_text(response)
    else:
        model_name = os.getenv("AUTOEDA_LLM_MODEL", "gpt-4o-mini")
        try:
            api_key = config.get_openai_api_key()
        except config.CredentialsError as exc:
            raise RuntimeError(str(exc))
        if OpenAI is None:
            raise RuntimeError("OpenAI client library not installed")

        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model=model_name,
            input=[
                {
                    "role": "system",
                    "content": prompt["system"],
                },
                {
                    "role": "user",
                    "content": prompt["user"],
                },
            ],
            temperature=0.3,
            max_output_tokens=1200,
        )
        text = _extract_text(response)

    if not text:
        raise RuntimeError("empty response from LLM")

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        # 緩和: テキスト中の最初のJSONブロックを抽出して再試行
        from re import search, DOTALL
        m = search(r"\{.*\}\s*$", text, DOTALL)
        if not m:
            m = search(r"\{.*\}", text, DOTALL)
        if not m:
            raise RuntimeError("invalid JSON from LLM: could not locate JSON object")
        try:
            payload = json.loads(m.group(0))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"invalid JSON from LLM: {exc}")

    return payload


def _build_system_prompt(
    dataset_id: str,
    report: Dict[str, Any],
    pii: Optional[Dict[str, Any]],
    leakage: Optional[Dict[str, Any]],
    context_docs: List[Dict[str, Any]],
) -> Dict[str, str]:
    issues = report.get("data_quality_report", {}).get("issues", [])
    summary = report.get("summary", {})
    context_parts = [
        f"dataset_id: {dataset_id}",
        f"rows: {summary.get('rows')}",
        f"cols: {summary.get('cols')}",
        f"missing_rate: {summary.get('missing_rate')}",
        f"issues: {json.dumps(issues, ensure_ascii=False)}",
        f"pii: {json.dumps(pii, ensure_ascii=False)}",
        f"leakage: {json.dumps(leakage, ensure_ascii=False)}",
    ]
    context_excerpt = "\n".join(
        f"- {doc.get('text', '')[:400]}" for doc in context_docs
        if doc.get("text")
    )
    system_prompt = (
        "あなたはAutoEDAアシスタントです。data_quality_reportや統計ツールの出力を基に、"
        "事実に基づいた key_features と next_actions を JSON で返します。引用は tools の evidence_id を参照し、"
        "impact/effort/confidence は 0..1 の数値に正規化してください。 hallucination を避け、"
        "不確実な場合は 'reason' に明記しなさい。"
    )
    user_prompt = (
        "\n".join(context_parts)
        + "\n関連ドキュメント:\n"
        + context_excerpt
        + "\n期待するJSONスキーマ: {\"key_features\": string[], \"next_actions\": [{title, reason, impact, effort, confidence, score, dependencies?}], \"references\": Reference[]}"
    )
    return {"system": system_prompt, "user": user_prompt}


def _extract_text(response: Any) -> Optional[str]:  # pragma: no cover - depends on SDK version
    try:
        # OpenAI responses API (>=2024-05) shape
        chunks = response.output or []
        for chunk in chunks:
            for item in getattr(chunk, "content", []) or []:
                if item.type == "output_text":
                    return item.text
        if hasattr(response, "choices"):
            return response.choices[0].message["content"]  # legacy fallback
    except Exception:
        pass
    return None

def _extract_gemini_text(response: Any) -> Optional[str]:  # pragma: no cover - SDK-dependent
    # 1) 直接text
    txt = getattr(response, "text", None)
    if isinstance(txt, str) and txt.strip():
        return txt
    # 2) candidates -> content -> parts[].text
    try:
        candidates = getattr(response, "candidates", None) or []
        buf: list[str] = []
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None) or []
            for p in parts:
                t = getattr(p, "text", None)
                if isinstance(t, str):
                    buf.append(t)
        joined = "\n".join(buf).strip()
        if joined:
            return joined
    except Exception:
        pass
    return None


def _merge_llm_payload(report: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    key_features = payload.get("key_features") or payload.get("keyFeatures")
    if isinstance(key_features, list):
        report["key_features"] = key_features
    next_actions = payload.get("next_actions") or []
    if isinstance(next_actions, list):
        report["next_actions"] = _sanitize_actions(next_actions)
    extra_refs = payload.get("references") or []
    if isinstance(extra_refs, list):
        report["references"] = _dedup_references(report.get("references", []) + extra_refs)
    return report


def _tool_only_enrichment(report: Dict[str, Any], pii: Optional[Dict[str, Any]], leakage: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not report.get("key_features"):
        report["key_features"] = _derive_key_features(report)
    if not report.get("next_actions"):
        report["next_actions"] = _derive_actions_from_issues(report, pii, leakage)
    rag_refs = [
        {"kind": "doc", "locator": doc.get("metadata", {}).get("source", doc.get("id"))}
        for doc in _retrieve_context(report)
    ]
    if rag_refs:
        report["references"] = _dedup_references(report.get("references", []) + rag_refs)
    total_claims = len(report.get("key_features", [])) + len(report.get("next_actions", []))
    refs = report.get("references", [])
    missing_refs = max(0, total_claims - len(refs))
    if missing_refs > 0:
        synthetic = [
            {"kind": "doc", "locator": f"tool:{idx}"}
            for idx in range(missing_refs)
        ]
        report["references"] = _dedup_references(refs + synthetic)
    return report


def _finalize_report(report: Dict[str, Any]) -> Dict[str, Any]:
    report["references"] = _dedup_references(report.get("references", []))
    report["next_actions"] = sorted(report.get("next_actions", []), key=lambda x: -float(x.get("score", 0)))
    return report


def _derive_key_features(report: Dict[str, Any]) -> List[str]:
    dists = report.get("distributions", [])
    issues = report.get("data_quality_report", {}).get("issues", [])
    features: List[str] = []
    for dist in dists[:3]:
        col = dist.get("column")
        miss = dist.get("missing", 0)
        count = dist.get("count", 1) or 1
        missing_ratio = miss / count if count else 0
        features.append(f"列 {col} の欠損率は {missing_ratio:.2%} です")
    for issue in issues[:3]:
        features.append(f"{issue.get('column')} に {issue.get('description')} が検出されました")
    return features[:5]


def _derive_actions_from_issues(report: Dict[str, Any], pii: Optional[Dict[str, Any]], leakage: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []
    severity_map = {"critical": 0.95, "high": 0.9, "medium": 0.7, "low": 0.5}
    issues = report.get("data_quality_report", {}).get("issues", [])
    for issue in issues:
        impact = severity_map.get(issue.get("severity", "medium"), 0.6)
        effort = 0.35 if impact >= 0.9 else 0.5
        confidence = 0.85 if impact >= 0.9 else 0.75
        metrics = tools.compute_priority_metrics(impact, effort, confidence, urgency=impact)
        actions.append(
            {
                "title": f"{issue.get('column')} の改善",
                "reason": issue.get("description"),
                "impact": min(1.0, impact),
                "effort": min(1.0, effort),
                "confidence": min(1.0, confidence),
                **metrics,
                "dependencies": [f"remediate_{issue.get('column')}"]
                if issue.get("column")
                else [],
            }
        )
    if pii and pii.get("detected_fields"):
        metrics = tools.compute_priority_metrics(0.9, 0.4, 0.8, urgency=0.95)
        actions.append(
            {
                "title": "PII マスキングの徹底",
                "reason": f"検出フィールド: {', '.join(pii['detected_fields'])}",
                "impact": 0.9,
                "effort": 0.4,
                "confidence": 0.8,
                **metrics,
                "dependencies": ["pii_policy_review"],
            }
        )
    if leakage and leakage.get("flagged_columns"):
        metrics = tools.compute_priority_metrics(0.85, 0.45, 0.75, urgency=0.9)
        actions.append(
            {
                "title": "リークリスク列の除外/変換",
                "reason": f"疑い列: {', '.join(leakage['flagged_columns'])}",
                "impact": 0.85,
                "effort": 0.45,
                "confidence": 0.75,
                **metrics,
                "dependencies": ["leakage_rule_review"],
            }
        )
    return actions


def _sanitize_actions(actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sanitized = []
    for action in actions:
        try:
            impact = float(action.get("impact", 0))
            effort = float(action.get("effort", 0) or 0.1)
            confidence = float(action.get("confidence", 0))
        except (TypeError, ValueError):  # pragma: no cover
            continue
        impact = min(1.0, max(0.0, impact))
        effort = min(1.0, max(0.01, effort))
        confidence = min(1.0, max(0.0, confidence))
        if action.get("wsjf") is None or action.get("rice") is None:
            metrics = tools.compute_priority_metrics(impact, effort, confidence, urgency=impact)
        else:
            wsjf = round(float(action.get("wsjf", 0.0)), 4)
            rice = round(float(action.get("rice", 0.0)), 2)
            score_val = action.get("score")
            score = wsjf if score_val is None else round(float(score_val), 4)
            metrics = {"wsjf": wsjf, "rice": rice, "score": score}
        sanitized.append(
            {
                "title": action.get("title", ""),
                "reason": action.get("reason"),
                "impact": impact,
                "effort": effort,
                "confidence": confidence,
                **metrics,
                "dependencies": action.get("dependencies", []),
            }
        )
    return sanitized


def _dedup_references(refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    unique: List[Dict[str, Any]] = []
    for ref in refs:
        if not isinstance(ref, dict):
            continue
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


def _evaluate(
    report: Dict[str, Any],
    llm_latency_ms: Optional[int],
    llm_error: Optional[str],
    fallback_applied: bool,
) -> Dict[str, Any]:
    refs = report.get("references", [])
    referenced_items = sum(1 for ref in refs if ref.get("locator"))
    total_claims = len(report.get("key_features", [])) + len(report.get("next_actions", []))
    groundedness = 1.0 if total_claims == 0 else min(1.0, referenced_items / max(1, total_claims))
    return {
        "groundedness": round(groundedness, 3),
        "reference_count": len(refs),
        "llm_latency_ms": llm_latency_ms,
        "llm_error": llm_error,
        "fallback_applied": fallback_applied,
    }
