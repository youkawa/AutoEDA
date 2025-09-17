import math

from apps.api.services import metrics


def setup_function():
    metrics.reset()


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
