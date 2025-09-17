from typing import Dict, Any, List, Optional

_TREND_KEYWORDS = {
    "increasing": {"増加", "上昇", "伸び", "改善"},
    "decreasing": {"減少", "低下", "悪化", "縮小"},
    "flat": {"横ばい", "安定", "変化なし"},
}


def consistency_ok(chart: Dict[str, Any]) -> bool:
    score = float(chart.get("consistency_score", 0.0))
    if score < 0.95:
        return False

    diagnostics = chart.get("diagnostics", {}) or {}
    explanation = str(chart.get("explanation", ""))

    expected_trend = diagnostics.get("trend")
    if expected_trend:
        described_trend = _extract_trend(explanation)
        if described_trend and described_trend != expected_trend:
            return False

        if expected_trend == "increasing" and diagnostics.get("correlation") is not None:
            if float(diagnostics.get("correlation")) < 0:
                return False
        if expected_trend == "decreasing" and diagnostics.get("correlation") is not None:
            if float(diagnostics.get("correlation")) > 0:
                return False

    return True


def coverage_ok(answer: Dict[str, Any]) -> bool:
    return float(answer.get("coverage", 0.0)) >= 0.8


def top_chart(charts: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not charts:
        return None
    return max(charts, key=lambda c: float(c.get("consistency_score", 0.0)))


def _extract_trend(explanation: str) -> Optional[str]:
    lowered = explanation.lower()
    for trend, keywords in _TREND_KEYWORDS.items():
        for keyword in keywords:
            if keyword in explanation or keyword in lowered:
                return trend
    return None
