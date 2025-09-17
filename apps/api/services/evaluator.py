from typing import Dict, Any, List, Optional


def consistency_ok(chart: Dict[str, Any]) -> bool:
    return float(chart.get("consistency_score", 0.0)) >= 0.95


def coverage_ok(answer: Dict[str, Any]) -> bool:
    return float(answer.get("coverage", 0.0)) >= 0.8


def top_chart(charts: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not charts:
        return None
    return max(charts, key=lambda c: float(c.get("consistency_score", 0.0)))
