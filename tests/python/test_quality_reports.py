import json
from pathlib import Path

from apps.api.scripts import merge_quality_reports


def test_merge_reports_pass(tmp_path):
    slo_path = tmp_path / "slo.json"
    rag_path = tmp_path / "rag.json"
    summary_path = tmp_path / "summary.json"

    slo_payload = {
        "violations": {
            "EDAReportGenerated": {"p95_exceeded": False, "groundedness_below": False},
        }
    }
    rag_payload = {"report": {"missing": []}}
    slo_path.write_text(json.dumps(slo_payload), encoding="utf-8")
    rag_path.write_text(json.dumps(rag_payload), encoding="utf-8")

    summary = merge_quality_reports.merge_reports(slo_path, rag_path, summary_path)

    assert summary["slo"]["status"] == "pass"
    assert summary["rag"]["status"] == "pass"
    assert summary_path.exists()


def test_merge_reports_fail(tmp_path):
    slo_path = tmp_path / "slo.json"
    rag_path = tmp_path / "rag.json"
    summary_path = tmp_path / "summary.json"

    slo_payload = {
        "violations": {
            "EDAReportGenerated": {"p95_exceeded": True, "groundedness_below": False},
        }
    }
    rag_payload = {"report": {"missing": ["coverage"]}}
    slo_path.write_text(json.dumps(slo_payload), encoding="utf-8")
    rag_path.write_text(json.dumps(rag_payload), encoding="utf-8")

    summary = merge_quality_reports.merge_reports(slo_path, rag_path, summary_path)

    assert summary["slo"]["status"] == "fail"
    assert summary["rag"]["status"] == "fail"
