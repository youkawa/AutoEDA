"""Lightweight chart generation service (MVP).

Generates a simple Vega-Lite-like SVG for preview without executing arbitrary code.
Stores job results under data/charts/<job_id>/result.json for traceability.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4
from . import metrics
from .sandbox import SandboxRunner

_DATA_DIR = Path("data/charts")
_JOBS: Dict[str, Dict[str, Any]] = {}
_BATCHES: Dict[str, Dict[str, Any]] = {}
_QUEUE: "list[Dict[str, Any]]" = []
_CV = threading.Condition()
_ASYNC = os.environ.get("AUTOEDA_CHARTS_ASYNC", "0") in {"1", "true", "TRUE"}
_PARALLEL = max(1, int(os.environ.get("AUTOEDA_CHARTS_PARALLELISM", "1") or "1"))
_WORKER_STARTED = False
_CANCEL_FLAGS: Dict[str, bool] = {}
_BATCH_LIMITS: Dict[str, int] = {}
_BATCH_RUNNING: Dict[str, int] = {}
_LAST_SERVED_BATCH: Optional[str] = None


def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def _start_worker_once() -> None:
    global _WORKER_STARTED
    if _WORKER_STARTED:
        return
    if not _ASYNC:
        return

    def _worker():
        global _LAST_SERVED_BATCH
        while True:
            with _CV:
                while not _QUEUE:
                    _CV.wait()
                # Fair scheduler: round-robin by batch_id
                job_idx = 0
                if _LAST_SERVED_BATCH is not None:
                    for idx, j in enumerate(_QUEUE):
                        if (j.get("item") or {}).get("batch_id") != _LAST_SERVED_BATCH:
                            job_idx = idx
                            break
                job = _QUEUE.pop(job_idx)
            job_id = job["job_id"]
            _JOBS[job_id]["status"] = "running"
            _JOBS[job_id]["stage"] = "generating"
            try:
                item = job["item"]
                _LAST_SERVED_BATCH = item.get("batch_id")
                # batch-level parallelism gate
                batch_id = item.get("batch_id")
                if batch_id:
                    with _CV:
                        limit = _BATCH_LIMITS.get(batch_id, _PARALLEL)
                        running_now = _BATCH_RUNNING.get(batch_id, 0)
                        if running_now >= limit:
                            # put it back to the queue tail and wait briefly
                            _QUEUE.append(job)
                            _CV.wait(timeout=0.05)
                            continue
                        _BATCH_RUNNING[batch_id] = running_now + 1
                runner = SandboxRunner()
                # stage: generating -> running -> rendering
                _JOBS[job_id]["stage"] = "generating"
                exec_mode = os.environ.get("AUTOEDA_SANDBOX_EXECUTE", "0") in {"1", "true", "TRUE"}
                if exec_mode:
                    jid = job_id
                    result = runner.run_generated_chart(job_id=jid, spec_hint=item.get("spec_hint"), dataset_id=item.get("dataset_id"), cancel_check=lambda: bool(_CANCEL_FLAGS.get(jid)))
                else:
                    if os.environ.get("AUTOEDA_SANDBOX_SUBPROCESS", "0") in {"1", "true", "TRUE"}:
                        result = runner.run_template_subprocess(spec_hint=item.get("spec_hint"), dataset_id=item.get("dataset_id"))
                    else:
                        result = runner.run_template(spec_hint=item.get("spec_hint"), dataset_id=item.get("dataset_id"))
                _JOBS[job_id]["stage"] = "rendering"
                outdir = _DATA_DIR / job_id
                outdir.mkdir(parents=True, exist_ok=True)
                # cooperative cancel: if cancel requested during run, mark as cancelled and skip persistence
                if _CANCEL_FLAGS.get(job_id):
                    _JOBS[job_id].update({"status": "cancelled"})
                else:
                    payload = {"job_id": job_id, "status": "succeeded", "result": result}
                    (outdir / "result.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                    _JOBS[job_id].update(payload)
                    _JOBS[job_id]["stage"] = "done"
                # metrics
                try:
                    t0 = _JOBS[job_id].get("t0") or time.perf_counter()
                    dur = int((time.perf_counter() - t0) * 1000)
                    metrics.record_event("ChartJobFinished", duration_ms=dur)
                    metrics.persist_event({
                        "event_name": "ChartJobFinished",
                        "duration_ms": dur,
                        "dataset_id": item.get("dataset_id"),
                        "hint": item.get("spec_hint"),
                    })
                except Exception:
                    pass
            except Exception as exc:
                msg = str(exc)
                if "timeout" in msg:
                    friendly = "実行がタイムアウトしました（制限時間超過）。"
                elif "cancelled" in msg:
                    friendly = "実行がキャンセルされました。"
                else:
                    friendly = f"実行に失敗しました: {msg}"
                _JOBS[job_id].update({"status": "failed", "error": friendly})
            # small yield
            time.sleep(0.01)
            # decrement running counter for batch
            if item.get("batch_id"):
                with _CV:
                    b = item.get("batch_id")
                    _BATCH_RUNNING[b] = max(0, _BATCH_RUNNING.get(b, 1) - 1)
                    _CV.notify_all()
    # spawn N workers
    for i in range(_PARALLEL):
        t = threading.Thread(target=_worker, daemon=True, name=f"charts-worker-{i+1}")
        t.start()
    _WORKER_STARTED = True


def _svg_bar(title: str = "Bar Chart") -> str:
    # Very simple static SVG bar preview (no data binding)
    bars = "".join(
        f'<rect x="{20 + i*30}" y="{100 - h}" width="20" height="{h}" fill="#60a5fa" />'
        for i, h in enumerate([20, 60, 100, 50, 80])
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120">'
        f'<text x="10" y="16" font-size="12" fill="#0f172a">{title}</text>'
        f'<line x1="10" y1="100" x2="350" y2="100" stroke="#94a3b8" stroke-width="1" />'
        f'{bars}'
        f'</svg>'
    )


def _svg_line(title: str = "Line Chart") -> str:
    points = [(20, 90), (60, 60), (100, 70), (140, 40), (180, 55), (220, 30), (260, 35), (300, 25)]
    path_d = "M " + " L ".join(f"{x} {y}" for x, y in points)
    circles = "".join(f'<circle cx="{x}" cy="{y}" r="3" fill="#34d399" />' for x, y in points)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120">'
        f'<text x="10" y="16" font-size="12" fill="#0f172a">{title}</text>'
        f'<path d="{path_d}" fill="none" stroke="#34d399" stroke-width="2" />'
        f'{circles}'
        f'</svg>'
    )


def _svg_scatter(title: str = "Scatter Plot") -> str:
    pts = [(20, 80), (50, 60), (80, 70), (110, 40), (140, 55), (170, 65), (200, 45), (230, 35), (260, 75)]
    circles = "".join(f'<circle cx="{x}" cy="{y}" r="3" fill="#f97316" />' for x, y in pts)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120">'
        f'<text x="10" y="16" font-size="12" fill="#0f172a">{title}</text>'
        f'{circles}'
        f'</svg>'
    )


def _template_result(spec_hint: Optional[str], dataset_id: Optional[str] = None) -> Dict[str, Any]:
    kind = (spec_hint or "bar").lower()
    if kind == "line":
        svg = _svg_line("Line (template)")
    elif kind == "scatter":
        svg = _svg_scatter("Scatter (template)")
    else:
        svg = _svg_bar("Bar (template)")
    # minimal vega-lite like spec (for docs/preview purposes)
    vega_spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "mark": kind if kind in {"bar", "line"} else "point",
        "data": {"name": "data"},
        "encoding": {
            "x": {"field": "x", "type": "quantitative"},
            "y": {"field": "y", "type": "quantitative"},
        },
        "datasets": {"data": [{"x": i, "y": v} for i, v in enumerate([1, 3, 2, 5, 4])]},
        "description": f"template {kind} chart",
    }
    code = (
        "# template-only preview (MVP)\n"
        "import json\n"
        "spec = { 'mark': '%s', 'data': {'values': [{'x':0,'y':1}]}}\n"
        "print(json.dumps(spec))\n" % (kind if kind in {"bar", "line"} else "point")
    )
    result = {
        "language": "python",
        "library": "vega",
        "code": code,
        "seed": 42,
        "meta": {
            "dataset_id": dataset_id,
            "hint": spec_hint,
            "engine": "template",
            "sandbox": os.environ.get("AUTOEDA_SANDBOX_SUBPROCESS", "0") in {"1", "true", "TRUE"} and "subprocess" or "inline",
            "parallelism": _PARALLEL,
        },
        "outputs": [
            {"type": "image", "mime": "image/svg+xml", "content": svg},
            {"type": "vega", "mime": "application/json", "content": vega_spec},
        ],
    }
    return result


def generate(item: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a chart result.

    - synchronous (default): returns succeeded with result
    - asynchronous (AUTOEDA_CHARTS_ASYNC=1): returns queued job; worker will complete it
    """
    _ensure_dir()
    if _ASYNC:
        _start_worker_once()
        job_id = uuid4().hex[:12]
        job = {"job_id": job_id, "status": "queued", "t0": time.perf_counter(), "item": item}
        if item.get("chart_id"):
            job["chart_id"] = item.get("chart_id")
        _JOBS[job_id] = job
        with _CV:
            _QUEUE.append({"job_id": job_id, "item": item})
            _CV.notify()
        return job
    else:
        job_id = uuid4().hex[:12]
        t0 = time.perf_counter()
        runner = SandboxRunner()
        exec_mode = os.environ.get("AUTOEDA_SANDBOX_EXECUTE", "0") in {"1", "true", "TRUE"}
        if exec_mode:
            jid = job_id
            result = runner.run_generated_chart(job_id=jid, spec_hint=item.get("spec_hint"), dataset_id=item.get("dataset_id"), cancel_check=lambda: bool(_CANCEL_FLAGS.get(jid)))
        else:
            result = runner.run_template(spec_hint=item.get("spec_hint"), dataset_id=item.get("dataset_id"))
        job = {"job_id": job_id, "status": "succeeded", "result": result}
        if item.get("chart_id"):
            job["chart_id"] = item.get("chart_id")
        _JOBS[job_id] = job
        outdir = _DATA_DIR / job_id
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / "result.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            dur = int((time.perf_counter() - t0) * 1000)
            metrics.record_event("ChartJobFinished", duration_ms=dur)
            metrics.persist_event({
                "event_name": "ChartJobFinished",
                "duration_ms": dur,
                "dataset_id": item.get("dataset_id"),
                "hint": item.get("spec_hint"),
            })
        except Exception:
            pass
        return job


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    return _JOBS.get(job_id)


def generate_batch(items: List[Dict[str, Any]], parallelism: int = 3) -> Dict[str, Any]:
    batch_id = uuid4().hex[:12]
    job_items: List[Dict[str, Any]] = []
    results: List[Dict[str, Any]] = []

    if _ASYNC:
        _start_worker_once()
        effective = max(1, min(int(parallelism or 1), _PARALLEL))
        # record limits for this batch
        _BATCH_LIMITS[batch_id] = effective
        for it in items:
            job = generate({**it, "batch_id": batch_id})  # queued
            entry = {"job_id": job["job_id"], "status": job["status"]}
            if job.get("chart_id"):
                entry["chart_id"] = job.get("chart_id")
            job_items.append(entry)
        status = {
            "batch_id": batch_id,
            "total": len(items),
            "done": 0,
            "running": len(items),
            "failed": 0,
            "items": job_items,
            "parallelism": parallelism,
            "parallelism_effective": effective,
            # no results yet in async mode
        }
        _BATCHES[batch_id] = status
        return status
    else:
        t0 = time.perf_counter()
        results_map: Dict[str, Any] = {}
        for it in items:
            job = generate(it)
            result = job.get("result")
            results.append(result)
            entry = {"job_id": job["job_id"], "status": job["status"]}
            if job.get("chart_id"):
                entry["chart_id"] = job.get("chart_id")
                if result is not None:
                    results_map[job["chart_id"]] = result
            job_items.append(entry)
        status = {
            "batch_id": batch_id,
            "total": len(items),
            "done": len(items),
            "running": 0,
            "failed": 0,
            "items": job_items,
            "results": results,
            "results_map": results_map or None,
        }
        _BATCHES[batch_id] = status
        try:
            dur = int((time.perf_counter() - t0) * 1000)
            metrics.record_event("ChartBatchFinished", duration_ms=dur)
            metrics.persist_event({
                "event_name": "ChartBatchFinished",
                "duration_ms": dur,
                "batch_id": batch_id,
                "total": len(items),
            })
        except Exception:
            pass
        return status


def get_batch(batch_id: str) -> Optional[Dict[str, Any]]:
    st = _BATCHES.get(batch_id)
    if not st:
        return None
    if _ASYNC:
        # recompute progress
        items = st.get("items", [])
        done = 0
        running = 0
        failed = 0
        cancelled = 0
        results: List[Dict[str, Any]] = []
        results_map: Dict[str, Any] = {}
        for it in items:
            j = _JOBS.get(it["job_id"], {})
            it["status"] = j.get("status", it.get("status"))
            if j.get("stage"):
                it["stage"] = j.get("stage")
            if it["status"] == "succeeded":
                done += 1
                if j.get("result"):
                    results.append(j["result"])
                    if it.get("chart_id"):
                        results_map[it["chart_id"]] = j["result"]
            elif it["status"] == "failed":
                failed += 1
            elif it["status"] == "cancelled":
                cancelled += 1
            else:
                running += 1
        queued = max(0, st.get("total", 0) - (done + running + failed + cancelled))
        st.update({"done": done, "running": running, "failed": failed, "cancelled": cancelled, "queued": queued})
        if done + failed == st.get("total", 0):
            st["results"] = results
            st["results_map"] = results_map
        return st
    return st


def cancel_batch(batch_id: str, job_ids: List[str]) -> int:
    """Cancel queued jobs in a batch. Returns the number of jobs cancelled.

    Notes:
    - Only jobs with status 'queued' are removed from the queue and marked 'cancelled'.
    - Running jobs are not interrupted (future: cooperative checks).
    """
    st = _BATCHES.get(batch_id)
    if not st:
        return 0
    targets = set(job_ids) if job_ids else {it.get("job_id") for it in st.get("items", [])}
    # remove from queue
    removed = 0
    with _CV:
        remaining: list[Dict[str, Any]] = []
        for job in _QUEUE:
            if job.get("job_id") in targets:
                jid = job.get("job_id")
                _JOBS.setdefault(jid, {})
                _JOBS[jid]["status"] = "cancelled"
                removed += 1
            else:
                remaining.append(job)
        _QUEUE[:] = remaining
    # reflect into batch items
    for it in st.get("items", []):
        if it.get("job_id") in targets and it.get("status") == "queued":
            it["status"] = "cancelled"
        elif it.get("job_id") in targets and it.get("status") == "running":
            # cooperative cancel for running jobs
            _CANCEL_FLAGS[it["job_id"]] = True
    # update counters via get_batch recompute path
    _BATCHES[batch_id] = st
    return removed
