import time
import sys
from pathlib import Path
from statistics import quantiles
from typing import Any, Dict, List

from fastapi.testclient import TestClient

# Ensure repo root is on sys.path so that `apps.api.main` can be imported on CI
ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.main import app  # type: ignore


def p95(durations_ms: List[float]) -> float:
    if not durations_ms:
        return 0.0
    # statistics.quantiles returns cut points; use n=20 for robustness
    q = quantiles(durations_ms, n=20)
    return q[18]  # 95th percentile (index 18 when n=20 gives 95%)


def measure(client: TestClient, method: str, url: str, json: Dict[str, Any], runs: int = 10):
    durs: List[float] = []
    last_json: Any = None
    for _ in range(runs):
        t0 = time.perf_counter()
        resp = client.request(method, url, json=json)
        t1 = time.perf_counter()
        resp.raise_for_status()
        last_json = resp.json()
        durs.append((t1 - t0) * 1000.0)
    return p95(durs), last_json


def main() -> None:
    client = TestClient(app)
    errors: List[str] = []

    # A1: /api/eda
    p95_ms, data = measure(client, "POST", "/api/eda", {"dataset_id": "ds_001"})
    if p95_ms > 10_000:
        errors.append(f"A1 p95 too high: {p95_ms:.1f}ms > 10000ms")
    for key in ("summary", "data_quality_report", "distributions", "key_features", "outliers", "next_actions", "references"):
        if key not in data:
            errors.append(f"A1 missing field: {key}")

    # A2: /api/charts/suggest (k=5)
    p95_ms, charts = measure(client, "POST", "/api/charts/suggest", {"dataset_id": "ds_001", "k": 5})
    if p95_ms > 6000:
        errors.append(f"A2 p95 too high: {p95_ms:.1f}ms > 6000ms")
    # Accept both legacy list and new object shape { charts: [...] }
    charts_list = charts if isinstance(charts, list) else charts.get("charts") if isinstance(charts, dict) else None
    if not isinstance(charts_list, list) or not charts_list:
        errors.append("A2 charts response invalid")
    else:
        if charts_list[0].get("consistency_score", 0) < 0.95:
            errors.append("A2 top chart consistency_score < 0.95")

    # B1: /api/qna
    p95_ms, answers = measure(client, "POST", "/api/qna", {"dataset_id": "ds_001", "question": "売上のトレンドは？"})
    if p95_ms > 4000:
        errors.append(f"B1 p95 too high: {p95_ms:.1f}ms > 4000ms")
    # Accept both legacy list and new object shape { answers: [...] }
    answers_list = answers if isinstance(answers, list) else answers.get("answers") if isinstance(answers, dict) else None
    if not isinstance(answers_list, list) or not answers_list:
        errors.append("B1 answers response invalid")
    else:
        if answers_list[0].get("coverage", 0) < 0.8:
            errors.append("B1 coverage < 0.8")

    # B2: /api/actions/prioritize
    items = [
        {"title": "欠損補完", "impact": 0.9, "effort": 0.35, "confidence": 0.8},
        {"title": "特徴量追加", "impact": 0.7, "effort": 0.5, "confidence": 0.7},
    ]
    p95_ms, ranked = measure(client, "POST", "/api/actions/prioritize", {"dataset_id": "ds_001", "next_actions": items})
    if p95_ms > 3000:
        errors.append(f"B2 p95 too high: {p95_ms:.1f}ms > 3000ms")
    if not isinstance(ranked, list) or not ranked:
        errors.append("B2 ranked response invalid")
    else:
        if "score" not in ranked[0]:
            errors.append("B2 missing score in first action")

    # C1: /api/pii/scan
    p95_ms, pii = measure(client, "POST", "/api/pii/scan", {"dataset_id": "ds_001", "columns": ["email", "price", "phone"]})
    if not isinstance(pii, dict) or "detected_fields" not in pii:
        errors.append("C1 invalid pii result")

    # C2: /api/leakage/scan
    p95_ms, leak = measure(client, "POST", "/api/leakage/scan", {"dataset_id": "ds_001"})
    if not isinstance(leak, dict) or "flagged_columns" not in leak:
        errors.append("C2 invalid leakage result")

    # D1: /api/recipes/emit
    p95_ms, recipe = measure(client, "POST", "/api/recipes/emit", {"dataset_id": "ds_001"})
    if p95_ms > 8000:
        errors.append(f"D1 p95 too high: {p95_ms:.1f}ms > 8000ms")
    if not isinstance(recipe, dict) or set(["artifact_hash", "files"]) - set(recipe.keys()):
        errors.append("D1 invalid recipe result structure")
    else:
        files = set(recipe.get("files", []))
        expected = {"recipe.json", "eda.ipynb", "sampling.sql"}
        if not expected.issubset(files):
            errors.append("D1 missing expected files")

    if errors:
        for e in errors:
            print(f"[nfr] {e}")
        raise SystemExit(1)
    print("[nfr] API NFR checks passed.")


if __name__ == "__main__":
    main()
