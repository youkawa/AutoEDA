import json
from types import SimpleNamespace

import pytest

from apps.api import config as app_config
from apps.api.services import orchestrator


@pytest.fixture(autouse=True)
def reset_config(monkeypatch):
    monkeypatch.delenv("AUTOEDA_LLM_MODEL", raising=False)
    monkeypatch.delenv("AUTOEDA_CREDENTIALS_FILE", raising=False)
    app_config.reset_cache()
    monkeypatch.setattr(orchestrator.rag, "load_default_corpus", lambda: None)
    monkeypatch.setattr(orchestrator, "_rag_seeded", True)
    yield
    app_config.reset_cache()


@pytest.fixture
def credentials_file(tmp_path, monkeypatch):
    path = tmp_path / "credentials.json"
    payload = {
        "llm": {
            "provider": "openai",
            "openai": {"api_key": "dummy"},
        }
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setenv("AUTOEDA_CREDENTIALS_FILE", str(path))
    app_config.reset_cache()
    yield path
    app_config.reset_cache()


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


def test_generate_eda_report_with_llm(monkeypatch, patch_tools, credentials_file):
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

    monkeypatch.setattr(orchestrator, "OpenAI", DummyOpenAI)

    report, evaluation = orchestrator.generate_eda_report("ds_llm")

    assert evaluation["llm_error"] is None
    assert evaluation["llm_latency_ms"] is not None
    assert report["key_features"] == ["LLM 派生の洞察"]
    assert report["next_actions"][0]["title"] == "LLM Action"
    assert any(ref["locator"] == "llm:analysis" for ref in report["references"])


def test_generate_eda_report_with_gemini(monkeypatch, patch_tools, tmp_path):
    path = tmp_path / "credentials.json"
    payload = {
        "llm": {
            "provider": "gemini",
            "gemini": {"api_key": "gm-dummy"},
        }
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setenv("AUTOEDA_CREDENTIALS_FILE", str(path))
    app_config.reset_cache()

    context_docs = [{"id": "doc:req", "text": "EDA 要件", "metadata": {"source": "requirements.md"}}]
    monkeypatch.setattr(orchestrator, "_retrieve_context", lambda report: context_docs)

    class DummyResponse:
        text = json.dumps(
            {
                "key_features": ["Gemini 洞察"],
                "next_actions": [
                    {
                        "title": "Gemini Action",
                        "reason": "Gemini",
                        "impact": 0.7,
                        "effort": 0.3,
                        "confidence": 0.85,
                        "score": 2.0,
                        "wsjf": 2.0,
                        "rice": 18.0,
                    }
                ],
                "references": [{"kind": "doc", "locator": "llm:gemini"}],
            },
            ensure_ascii=False,
        )

    class DummyGenerativeModel:
        def __init__(self, _model_name, system_instruction=None):
            self.system_instruction = system_instruction

        def generate_content(self, *_args, **_kwargs):
            return DummyResponse()

    class DummyGenAI:
        def __init__(self):
            self.configured = None

        def configure(self, api_key=None):  # type: ignore
            self.configured = api_key

        def GenerativeModel(self, model_name, system_instruction=None):  # type: ignore
            return DummyGenerativeModel(model_name, system_instruction=system_instruction)

    dummy_genai = DummyGenAI()
    monkeypatch.setattr(orchestrator, "genai", dummy_genai)

    report, evaluation = orchestrator.generate_eda_report("ds_gemini")

    assert evaluation["llm_error"] is None
    assert report["key_features"] == ["Gemini 洞察"]
    assert report["next_actions"][0]["title"] == "Gemini Action"
    assert any(ref["locator"] == "llm:gemini" for ref in report["references"])


def test_generate_eda_report_marks_fallback(monkeypatch, patch_tools):
    monkeypatch.setattr(orchestrator.tools, "profile_api", lambda *args, **kwargs: fake_profile_report())
    monkeypatch.setattr(orchestrator.tools, "pii_scan", lambda *args, **kwargs: None)
    monkeypatch.setattr(orchestrator.tools, "leakage_scan", lambda *args, **kwargs: None)
    monkeypatch.setattr(orchestrator, "_retrieve_context", lambda report: [])
    monkeypatch.setattr(orchestrator, "_invoke_llm_agent", lambda *args, **kwargs: None)

    report, evaluation = orchestrator.generate_eda_report("ds_fallback_flag")

    assert evaluation["fallback_applied"] is True
    assert evaluation["groundedness"] >= 0.9
