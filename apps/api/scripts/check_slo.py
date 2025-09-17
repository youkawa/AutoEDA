#!/usr/bin/env python3
"""SLO監視: metricsログを解析し、閾値違反で非0終了するスクリプト。"""

from __future__ import annotations

import json
import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.services import metrics

# 既定閾値（docs/requirements.md A1/B1に準拠）
SLO_THRESHOLDS = {
    "EDAReportGenerated": {"p95": 10_000, "groundedness": 0.9},
    "EDAQueryAnswered": {"p95": 4_000, "groundedness": 0.8},
}

OUTPUT_ENV = "AUTOEDA_SLO_OUTPUT"


def load_events(path: Path) -> list[dict]:
    events = []
    if not path.exists():
        return events
    for record in metrics.load_event_log(path):
        events.append(record)
    return events


def write_output(payload: dict, destination: str | None) -> None:
    if not destination:
        return
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    argv = argv or sys.argv[1:]
    target = Path(argv[0]) if argv else metrics.get_event_log_path()
    events = load_events(target)
    metrics.bootstrap_from_events(events)
    violations = metrics.detect_violations(SLO_THRESHOLDS)

    output = {
        "slo_thresholds": SLO_THRESHOLDS,
        "snapshot": metrics.slo_snapshot(),
        "violations": violations,
        "event_log": str(target),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    write_output(output, os.getenv(OUTPUT_ENV))

    has_violation = any(
        any(result.values()) for result in violations.values()
    )
    return 1 if has_violation else 0


if __name__ == "__main__":
    sys.exit(main())
