from typing import Any, Dict, List, Optional


def profile_api(dataset_id: str, sample_ratio: Optional[float] = None) -> Dict[str, Any]:
    return {
        "summary": {"rows": 1_000_000, "cols": 48, "missingRate": 0.12, "typeMix": {"int": 20, "float": 10, "cat": 18}},
        "issues": [
            {"severity": "high", "column": "price", "description": "欠損が多い（32%）", "statistic": {"missing": 0.32}},
            {"severity": "critical", "column": "date", "description": "将来日付が含まれている", "statistic": {"future_dates": 45}},
        ],
        "distributions": [
            {"column": "price", "dtype": "float", "count": 1_000_000, "missing": 320_000, "histogram": [100, 200, 500, 800, 300]},
            {"column": "quantity", "dtype": "int", "count": 1_000_000, "missing": 5000, "histogram": [150, 400, 700, 600, 250]},
        ],
        "keyFeatures": ["price × promotion_rate が強い関係（r=0.85）", "seasonal_index が売上に大きく影響"],
        "outliers": [{"column": "sales", "indices": [12, 45, 156, 789]}],
    }


def chart_api(dataset_id: str, k: int = 5) -> List[Dict[str, Any]]:
    return [
        {
            "id": "c1",
            "type": "bar",
            "explanation": "売上の季節性を示すバーチャート",
            "source_ref": {"kind": "figure", "locator": "fig:sales_seasonality"},
            "consistency_score": 0.97,
        }
    ][:k]


def stats_qna(dataset_id: str, question: str) -> List[Dict[str, Any]]:
    return [
        {
            "text": f"質問『{question}』に対する回答（数値はツール出力のみ採用）",
            "references": [{"kind": "table", "locator": "tbl:summary"}, {"kind": "figure", "locator": "fig:sales_trend"}],
            "coverage": 0.85,
        }
    ]


def prioritize_actions(dataset_id: str, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def calc_score(it: Dict[str, Any]) -> float:
        denom = it.get("effort", 0) or 1.0
        return (it.get("impact", 0) / denom) * it.get("confidence", 0)

    ranked = [
        {
            "title": it["title"],
            "impact": it["impact"],
            "effort": it["effort"],
            "confidence": it["confidence"],
            "score": round(calc_score(it), 4),
        }
        for it in items
    ]
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked


def pii_scan(dataset_id: str, columns: Optional[List[str]] = None) -> Dict[str, Any]:
    candidates = {"email", "phone", "ssn"}
    detected = sorted(list(candidates.intersection(set(columns or []))))
    return {"detected_fields": detected, "mask_policy": "MASK"}


def leakage_scan(dataset_id: str) -> Dict[str, Any]:
    flagged = ["target_next_month", "rolling_mean_7d", "leak_feature"]
    rules = ["time_causality", "aggregation_trace"]
    return {"flagged_columns": flagged, "rules_matched": rules}
