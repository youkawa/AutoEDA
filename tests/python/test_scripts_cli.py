import json
import os
from pathlib import Path

from apps.api.scripts import check_rag, check_slo


def test_check_rag_main_outputs_file(monkeypatch, tmp_path):
    golden = tmp_path / "golden.json"
    golden.write_text(json.dumps([{"id": "q", "query": "整合性", "expects": ["design.md"]}]), encoding="utf-8")

    report_dir = tmp_path / "reports"
    report_path = report_dir / "rag.json"

    monkeypatch.setenv("AUTOEDA_RAG_OUTPUT", str(report_path))

    # inject deterministic corpus
    monkeypatch.setattr(check_rag.rag, "_in_memory_store", [])
    monkeypatch.setattr(check_rag.rag, "_chroma_client", None)
    monkeypatch.setattr(check_rag.rag, "_collection", None)
    monkeypatch.setattr(check_rag.rag, "load_default_corpus", lambda: check_rag.rag.ingest([
        {"id": "design", "text": "整合性 0.95", "metadata": {"source": "design.md"}}
    ]))

    exit_code = check_rag.main([str(golden)])
    assert exit_code == 0
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["report"]["missing"] == []


def test_check_slo_main_outputs_file(monkeypatch, tmp_path):
    events = tmp_path / "events.jsonl"
    events.write_text(json.dumps({
        "event_name": "EDAReportGenerated",
        "duration_ms": 100,
        "groundedness": 0.95,
    }) + "\n", encoding="utf-8")

    output = tmp_path / "slo.json"

    monkeypatch.setenv(check_slo.OUTPUT_ENV, str(output))

    exit_code = check_slo.main([str(events)])
    assert exit_code == 0
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["violations"]["EDAReportGenerated"]["p95_exceeded"] is False
