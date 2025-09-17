import json
import math
from pathlib import Path

from apps.api.services import metrics


def setup_function():
    metrics.reset()
    metrics.set_event_log_path(Path("test-metrics.log"))
    path = metrics.get_event_log_path()
    if path.exists():
        path.unlink()


def test_record_tracks_durations_and_computes_p95():
    samples = [120, 150, 90, 110, 95, 105, 130, 125, 100, 160]
    for value in samples:
        metrics.record_event("EDAReportGenerated", duration_ms=value)

    p95 = metrics.slo_snapshot()["events"]["EDAReportGenerated"]["p95"]
    assert math.isclose(p95, 156, rel_tol=0.01)


def test_violations_detected_when_threshold_exceeded():
    for value in [120, 150, 140, 145, 155]:
        metrics.record_event("EDAReportGenerated", duration_ms=value, groundedness=0.92)
    metrics.record_event("EDAReportGenerated", duration_ms=320, groundedness=0.7)

    report = metrics.detect_violations({
        "EDAReportGenerated": {
            "p95": 400,
            "groundedness": 0.9,
        }
    })

    eda_report = report["EDAReportGenerated"]
    assert eda_report["p95_exceeded"] is False
    assert eda_report["groundedness_below"] is True


def test_persist_event_appends_json(tmp_path):
    metrics.set_event_log_path(tmp_path / "events.jsonl")
    payload = {"event_name": "EDAReportGenerated", "duration_ms": 120, "groundedness": 0.95}
    metrics.persist_event(payload)
    metrics.persist_event({"event_name": "EDAReportGenerated", "duration_ms": 140})

    contents = list(metrics.load_event_log())
    assert len(contents) == 2
    assert contents[0]["duration_ms"] == 120


def test_bootstrap_from_events_reconstructs_store(tmp_path):
    metrics.set_event_log_path(tmp_path / "events.jsonl")
    events = [
        {"event_name": "EDAReportGenerated", "duration_ms": 100, "groundedness": 0.92},
        {"event_name": "EDAReportGenerated", "duration_ms": 130, "groundedness": 0.88},
    ]
    with metrics.get_event_log_path().open("w", encoding="utf-8") as f:
        for event in events:
            f.write(json.dumps(event) + "\n")

    metrics.bootstrap_from_events(metrics.load_event_log())
    snapshot = metrics.slo_snapshot()
    assert snapshot["events"]["EDAReportGenerated"]["count"] == 2
