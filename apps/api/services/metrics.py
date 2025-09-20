"""Lightweight in-memory metrics aggregation for NFR監視."""

from __future__ import annotations

import json
import os
import threading
from math import floor
from pathlib import Path
from typing import Any, Dict, Iterable, List, MutableMapping

_LOCK = threading.Lock()
_STORE: MutableMapping[str, Dict[str, List[float]]] = {}
_EVENT_LOG_PATH = Path(os.getenv("AUTOEDA_METRICS_LOG", "data/metrics/events.jsonl"))


def reset() -> None:
    with _LOCK:
        _STORE.clear()


def record_event(event_name: str, **properties: Any) -> None:
    duration = _coerce_float(properties.get("duration_ms"))
    groundedness = _coerce_float(properties.get("groundedness"))
    with _LOCK:
        bucket = _STORE.setdefault(event_name, {"duration_ms": [], "groundedness": []})
        if duration is not None:
            bucket["duration_ms"].append(duration)
        if groundedness is not None:
            bucket["groundedness"].append(groundedness)


def persist_event(payload: Dict[str, Any]) -> None:
    path = get_event_log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")


def load_event_log(path: Path | str | None = None) -> Iterable[Dict[str, Any]]:
    target = Path(path) if path else get_event_log_path()
    if not target.exists():
        return []
    with target.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def slo_snapshot() -> Dict[str, Any]:
    """Return in-memory percentiles plus lightweight status breakdown from event log.

    - events: p95/groundedness_min/count (in-memory)
    - breakdown: for key events, success_rate and failure reasons (from persisted JSONL)
    """
    with _LOCK:
        events = {name: _summarize(m) for name, m in _STORE.items()}
    breakdown = _status_breakdown(["ChartJobFinished", "ChartBatchFinished"])
    return {"events": events, "breakdown": breakdown}


def _status_breakdown(event_names: List[str]) -> Dict[str, Any]:
    counters: Dict[str, Any] = {}
    for ev in event_names:
        total = 0
        ok = 0
        failures = 0
        by_code: Dict[str, int] = {}
        for rec in load_event_log():
            if rec.get("event_name") != ev:
                continue
            total += 1
            status = str(rec.get("status") or "").lower()
            if status in {"succeeded", "success", "ok"}:
                ok += 1
            elif status in {"failed", "error", "cancelled"}:
                failures += 1
                code = str(rec.get("error_code") or rec.get("error") or "unknown")
                by_code[code] = by_code.get(code, 0) + 1
        rate = (ok / total) if total else 0.0
        counters[ev] = {"total": total, "success_rate": round(rate, 3), "failures": failures, "failure_by_code": by_code}
    return counters


def detect_violations(slo_config: Dict[str, Dict[str, float]]) -> Dict[str, Dict[str, bool]]:
    snapshot = slo_snapshot()["events"]
    report: Dict[str, Dict[str, bool]] = {}
    for name, thresholds in slo_config.items():
        summary = snapshot.get(name, {"count": 0, "p95": 0.0, "groundedness_min": 1.0})
        event_report: Dict[str, bool] = {}
        if "p95" in thresholds:
            event_report["p95_exceeded"] = summary["p95"] > thresholds["p95"] if summary["count"] else False
        if "groundedness" in thresholds:
            event_report["groundedness_below"] = summary["groundedness_min"] < thresholds["groundedness"] if summary["count"] else False
        report[name] = event_report
    return report


def set_event_log_path(path: Path | str) -> None:
    global _EVENT_LOG_PATH
    _EVENT_LOG_PATH = Path(path)


def get_event_log_path() -> Path:
    return _EVENT_LOG_PATH


def reset_store() -> None:
    reset()


def bootstrap_from_events(events: Iterable[Dict[str, Any]]) -> None:
    reset_store()
    for event in events:
        name = event.get("event_name")
        if not name:
            continue
        props = {k: v for k, v in event.items() if k != "event_name"}
        record_event(name, **props)


def _summarize(metrics: Dict[str, List[float]]) -> Dict[str, Any]:
    durations = metrics.get("duration_ms", [])
    grounded = metrics.get("groundedness", [])
    count = len(durations) or len(grounded)
    summary: Dict[str, Any] = {"count": count, "p95": 0.0, "groundedness_min": 1.0}
    if durations:
        summary["p95"] = _percentile(durations, 0.95)
    if grounded:
        summary["groundedness_min"] = min(grounded)
    return summary


def _percentile(values: List[float], percentile: float) -> float:
    if not values:
        return 0.0
    percentile = max(0.0, min(1.0, percentile))
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * percentile
    lower_index = floor(pos)
    upper_index = min(lower_index + 1, len(ordered) - 1)
    fraction = pos - lower_index
    interpolated = ordered[lower_index] + (ordered[upper_index] - ordered[lower_index]) * fraction
    return round(interpolated)


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
