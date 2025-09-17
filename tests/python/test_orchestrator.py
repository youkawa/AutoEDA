import json
from types import SimpleNamespace

import pytest

from apps.api.services import orchestrator


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AUTOEDA_LLM_MODEL", raising=False)
    monkeypatch.setattr(orchestrator.rag, "load_default_corpus", lambda: None)
    monkeypatch.setattr(orchestrator, "_rag_seeded", True)


def fake_profile_report():
    return {
        "summary": {"rows": 1000, "cols": 10, "missing_rate": 0.1, "type_mix": {"int": 5, "float": 3, "cat": 2}},
        "distributions": [
            {"column": "price", "dtype": "float64", "count": 1000, "missing": 120, "histogram": [1, 2, 3, 4, 5], "source_ref": {"kind": "figure", "locator": "fig:price"}},
        ],
        "data_quality_report": {
            "issues": [
                {"severity": "high", "column": "price", "description": "欠損が多い", "statistic": {"missing_ratio": 0.32}, "evidence": {"kind": "table", "locator": "tbl:price"}},
            ]
        },
        "key_features": [],
        "next_actions": [],
        "references": [],
    }


@pytest.fixture
def patch_tools(monkeypatch):
    monkeypatch.setattr(orchestrator.tools, "profile_api", lambda *args, **kwargs: fake_profile_report())
    monkeypatch.setattr(orchestrator.tools, "pii_scan", lambda *args, **kwargs: {"detected_fields": ["email"], "mask_policy": "MASK"})
    monkeypatch.setattr(orchestrator.tools, "leakage_scan", lambda *args, **kwargs: {"flagged_columns": ["target_next_month"], "rules_matched": ["time_causality"]})
    monkeypatch.setattr(orchestrator, "_retrieve_context", lambda report: [])


def test_generate_eda_report_fallback(monkeypatch, patch_tools):
    report, evaluation = orchestrator.generate_eda_report("ds_fallback")

    assert evaluation["llm_error"] is not None
    assert report["key_features"], "fallback should synthesize key features"
    assert report["next_actions"], "fallback should generate next actions"
    assert "wsjf" in report["next_actions"][0]
    assert "rice" in report["next_actions"][0]
    # references deduplicated and include policy entries
    locators = {ref["locator"] for ref in report["references"]}
    assert "policy:pii" in locators
    assert "policy:leakage" in locators


def test_generate_eda_report_with_llm(monkeypatch, patch_tools):
    context_docs = [{"id": "doc:req", "text": "EDA 要件", "metadata": {"source": "requirements.md"}}]
    monkeypatch.setattr(orchestrator, "_retrieve_context", lambda report: context_docs)

    class DummyResponses:
        def create(self, **kwargs):
            payload = {
                "key_features": ["LLM 派生の洞察"],
                "next_actions": [
                    {
                        "title": "LLM Action",
                        "reason": "LLM",
                        "impact": 0.8,
                        "effort": 0.2,
                        "confidence": 0.9,
                        "score": 3.42,
                        "wsjf": 3.42,
                        "rice": 26.28,
                    },
                ],
                "references": [{"kind": "doc", "locator": "llm:analysis"}],
            }
            output = SimpleNamespace(content=[SimpleNamespace(type="output_text", text=json.dumps(payload, ensure_ascii=False))])
            return SimpleNamespace(output=[output])

    class DummyOpenAI:
        def __init__(self, *args, **kwargs):
            self.responses = DummyResponses()

    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setattr(orchestrator, "OpenAI", DummyOpenAI)

    report, evaluation = orchestrator.generate_eda_report("ds_llm")

    assert evaluation["llm_error"] is None
    assert evaluation["llm_latency_ms"] is not None
    assert report["key_features"] == ["LLM 派生の洞察"]
    assert report["next_actions"][0]["title"] == "LLM Action"
    assert any(ref["locator"] == "llm:analysis" for ref in report["references"])
