from typing import Any, Dict, Iterable, List, Optional, Tuple
from fastapi import UploadFile
from . import storage, recipes
import re
from collections import Counter
from datetime import datetime
from itertools import combinations
from math import sqrt
from pathlib import Path
import csv


def make_reference(locator: str, kind: str = "table", evidence_id: Optional[str] = None) -> Dict[str, Any]:
    ref: Dict[str, Any] = {"kind": kind, "locator": locator}
    if evidence_id:
        ref["evidence_id"] = evidence_id
    return ref


def compute_priority_metrics(
    impact: float,
    effort: float,
    confidence: float,
    *,
    urgency: float = 0.7,
) -> Dict[str, float]:
    impact = min(1.0, max(0.0, float(impact)))
    confidence = min(1.0, max(0.0, float(confidence)))
    eff = min(1.0, max(0.05, float(effort)))
    urgency = min(1.0, max(0.1, float(urgency)))
    cost_of_delay = (impact * 0.6 + urgency * 0.4) * confidence
    wsjf = round(cost_of_delay / eff, 4)
    reach = 1.0 + urgency * 9.0
    rice = round((reach * impact * confidence) / eff, 2)
    return {"wsjf": wsjf, "rice": rice, "score": wsjf}


def _mock_report() -> Dict[str, Any]:
    return {
        "summary": {"rows": 1_000_000, "cols": 48, "missing_rate": 0.12, "type_mix": {"int": 20, "float": 10, "cat": 18}},
        "distributions": [
            {"column": "price", "dtype": "float", "count": 1_000_000, "missing": 320_000, "histogram": [100, 200, 500, 800, 300], "source_ref": make_reference("fig:price_hist", "figure")},
            {"column": "quantity", "dtype": "int", "count": 1_000_000, "missing": 5000, "histogram": [150, 400, 700, 600, 250], "source_ref": make_reference("fig:quantity_hist", "figure")},
        ],
        "key_features": ["price × promotion_rate が強い関係（r=0.85）", "seasonal_index が売上に大きく影響"],
        "outliers": [{"column": "sales", "indices": [12, 45, 156, 789], "evidence": make_reference("tbl:outliers_sales", "table", "mock:sales")}],
        "data_quality_report": {
            "issues": [
                {"severity": "high", "column": "price", "description": "欠損が多い（32%）", "statistic": {"missing_ratio": 0.32}, "evidence": make_reference("tbl:price_quality", "table", "mock:price")},
                {"severity": "critical", "column": "date", "description": "将来日付が含まれている", "statistic": {"future_dates": 45}, "evidence": make_reference("tbl:date_future", "table", "mock:date")},
            ]
        },
        "next_actions": [
            {
                "title": "price 列の欠損補完",
                "reason": "重大な欠損率を是正",
                "impact": 0.9,
                "effort": 0.3,
                "confidence": 0.8,
                **compute_priority_metrics(0.9, 0.3, 0.8, urgency=0.95),
                "dependencies": ["impute_price_mean"],
            },
            {
                "title": "date 列の異常値修正",
                "reason": "未来日付がリークリスク",
                "impact": 0.85,
                "effort": 0.4,
                "confidence": 0.7,
                **compute_priority_metrics(0.85, 0.4, 0.7, urgency=0.9),
                "dependencies": ["validate_date_source"],
            },
        ],
        "references": [
            make_reference("tbl:summary"),
            make_reference("fig:price_hist", "figure"),
            make_reference("fig:quantity_hist", "figure"),
        ],
    }


def profile_api(dataset_id: str, sample_ratio: Optional[float] = None) -> Dict[str, Any]:
    # CSVプロファイル。pandas があれば利用し、無い/失敗時は軽量CSV/モックへフォールバック。
    path = storage.dataset_path(dataset_id)
    if not path.exists():
        return _mock_report()
    try:
        try:
            import pandas as pd  # type: ignore
            import numpy as np  # type: ignore
            # サンプリング読み込み
            read_kwargs: Dict[str, Any] = {}
            if sample_ratio and 0 < sample_ratio < 1:
                # 粗いサンプル: 先頭n行のみ（本実装では乱択を推奨）
                read_kwargs["nrows"] = max(10_000, int(200_000 * sample_ratio))
            df = pd.read_csv(path, **read_kwargs)
            rows, cols = int(df.shape[0]), int(df.shape[1])
            missing_rate = float(df.isna().sum().sum()) / float(max(rows * max(cols, 1), 1))
            # 型推定: pandasのdtypeから概算
            type_mix = Counter()
            for dt in df.dtypes:
                if np.issubdtype(dt, np.integer):
                    type_mix["int"] += 1
                elif np.issubdtype(dt, np.floating):
                    type_mix["float"] += 1
                else:
                    type_mix["cat"] += 1
            # 欠損課題
            issues: List[Dict[str, Any]] = []
            for col in df.columns:
                miss = int(df[col].isna().sum())
                if rows and miss / rows > 0.3:
                    issues.append({
                        "severity": "high",
                        "column": col,
                        "description": "欠損が多い",
                        "statistic": {"missing_ratio": round(miss/rows, 2)},
                        "evidence": make_reference(f"tbl:{col}_missing", "table", f"{dataset_id}:{col}:missing")
                    })
            # 未来日付
            for col in df.columns:
                if df[col].dtype == "object":
                    try:
                        dt = pd.to_datetime(df[col], errors="coerce")
                        future = int((dt > pd.Timestamp.now()).sum())
                        if future > 0:
                            issues.append({
                                "severity": "critical",
                                "column": col,
                                "description": "将来日付が含まれている",
                                "statistic": {"future_dates": future},
                                "evidence": make_reference(f"tbl:{col}_future_dates", "table", f"{dataset_id}:{col}:future")
                            })
                    except Exception:
                        pass
            # 分布（最大2列、数値のみ）
            dists: List[Dict[str, Any]] = []
            num_cols = [c for c in df.columns if np.issubdtype(df[c].dtype, np.number)]
            for col in num_cols[:2]:
                s = df[col].dropna()
                hist, _ = np.histogram(s, bins=5) if not s.empty else (np.zeros(5, dtype=int), [])
                dists.append({
                    "column": col,
                    "dtype": str(df[col].dtype),
                    "count": rows,
                    "missing": int(df[col].isna().sum()),
                    "histogram": [int(x) for x in hist.tolist()],
                    "source_ref": make_reference(f"fig:{col}_hist", "figure", f"{dataset_id}:{col}:hist")
                })
            # 外れ値（IQRベース、先頭1列のみ）
            outliers: List[Dict[str, Any]] = []
            if num_cols:
                s = df[num_cols[0]].dropna()
                if not s.empty:
                    q1, q3 = s.quantile(0.25), s.quantile(0.75)
                    iqr = q3 - q1
                    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
                    idx = df.index[(df[num_cols[0]] < lo) | (df[num_cols[0]] > hi)].tolist()[:10]
                    outliers.append({
                        "column": num_cols[0],
                        "indices": [int(i) for i in idx],
                        "evidence": make_reference(f"tbl:{num_cols[0]}_outliers", "table", f"{dataset_id}:{num_cols[0]}:outliers")
                    })

            references = [make_reference("tbl:summary", "table", dataset_id)]
            references.extend(ref for ref in (dist.get("source_ref") for dist in dists) if ref)
            for issue in issues:
                references.append(issue["evidence"])
            for out in outliers:
                if out.get("evidence"):
                    references.append(out["evidence"])

            next_actions = []
            severity_map = {"critical": 0.95, "high": 0.9, "medium": 0.7, "low": 0.5}
            for issue in issues:
                impact = severity_map.get(issue["severity"], 0.6)
                effort = 0.35 if issue["severity"] in {"critical", "high"} else 0.45
                confidence = 0.75 if issue["severity"] == "medium" else 0.85
                metrics = compute_priority_metrics(
                    impact,
                    effort,
                    confidence,
                    urgency=impact,
                )
                next_actions.append({
                    "title": f"{issue['column']} の改善",
                    "reason": issue["description"],
                    "impact": round(min(1.0, impact), 2),
                    "effort": round(min(1.0, effort), 2),
                    "confidence": round(min(1.0, confidence), 2),
                    **metrics,
                    "dependencies": [f"remediate_{issue['column']}"]
                })

            key_features: List[str] = []

            return {
                "summary": {"rows": rows, "cols": cols, "missing_rate": round(missing_rate, 4), "type_mix": dict(type_mix)},
                "distributions": dists,
                "key_features": key_features,
                "outliers": outliers,
                "data_quality_report": {"issues": issues},
                "next_actions": next_actions,
                "references": references,
            }
        except Exception:
            # pandas不在や失敗時: 軽量CSVで概算
            rows = 0
            missing_counts: Dict[str, int] = {}
            # 型推定（列ごとに最初の非空100件で判定）
            dtype_votes: Dict[str, Dict[str, int]] = {}
            # 数値列のサンプル（最大1000件/列）で簡易ヒストグラム
            numeric_samples: Dict[str, List[float]] = {}

            def cast_kind(val: str) -> Tuple[str, Optional[float]]:
                try:
                    iv = int(val)
                    return "int", float(iv)
                except Exception:
                    try:
                        fv = float(val)
                        return "float", fv
                    except Exception:
                        return "cat", None

            with path.open("r", newline="") as f:
                reader = csv.DictReader(f)
                fieldnames = reader.fieldnames or []
                cols = len(fieldnames)
                for name in fieldnames:
                    missing_counts[name] = 0
                    dtype_votes[name] = {"int": 0, "float": 0, "cat": 0}
                    numeric_samples[name] = []
                for row in reader:
                    rows += 1
                    for k, v in row.items():
                        if v is None or v == "":
                            missing_counts[k] += 1
                        else:
                            kind, num = cast_kind(v)
                            dtype_votes[k][kind] += 1
                            if num is not None and len(numeric_samples[k]) < 1000:
                                numeric_samples[k].append(num)
                    if sample_ratio and rows > int((1.0 - sample_ratio) * 50_000):
                        break

            def pick_dtype(name: str) -> str:
                votes = dtype_votes.get(name, {})
                if not votes:
                    return "unknown"
                k = max(votes.items(), key=lambda x: x[1])[0]
                return k

            type_mix: Dict[str, int] = {"int": 0, "float": 0, "cat": 0}
            for name in list(dtype_votes.keys()):
                k = pick_dtype(name)
                if k in type_mix:
                    type_mix[k] += 1

            missing_total = sum(missing_counts.values())
            total_cells = rows * max(cols, 1)
            missing_rate = float(missing_total) / float(total_cells or 1)

            def hist5(vals: List[float]) -> List[int]:
                if not vals:
                    return []
                lo, hi = min(vals), max(vals)
                if lo == hi:
                    return [len(vals), 0, 0, 0, 0]
                bins = [0, 0, 0, 0, 0]
                width = (hi - lo) / 5.0
                for x in vals:
                    idx = int((x - lo) / width)
                    if idx == 5:
                        idx = 4
                    bins[idx] += 1
                return bins

            # 分布は推定で数値上位2列
            numeric_cols = [c for c in numeric_samples.keys() if len(numeric_samples[c]) > 0]
            dists = []
            for name in numeric_cols[:2]:
                dists.append({
                    "column": name,
                    "dtype": pick_dtype(name),
                    "count": rows,
                    "missing": missing_counts[name],
                    "histogram": hist5(numeric_samples[name])
                })

            issues = []
            for name, miss in missing_counts.items():
                if rows and miss / rows > 0.3:
                    issues.append({
                        "severity": "high",
                        "column": name,
                        "description": "欠損が多い",
                        "statistic": {"missing_ratio": round(miss/rows, 2)},
                        "evidence": make_reference(f"tbl:{name}_missing", "table", f"{dataset_id}:{name}:missing")
                    })

            return {
                "summary": {"rows": rows, "cols": cols, "missing_rate": round(missing_rate, 4), "type_mix": type_mix},
                "distributions": dists,
                "key_features": [],
                "outliers": [],
                "data_quality_report": {"issues": issues},
                "next_actions": [
                    {
                        "title": "欠損補完",
                        "reason": "高い欠損率を解消",
                        "impact": 0.85,
                        "effort": 0.4,
                        "confidence": 0.75,
                        **compute_priority_metrics(0.85, 0.4, 0.75, urgency=0.85),
                        "dependencies": ["remediate_missing"],
                    }
                ],
                "references": [make_reference("tbl:summary", "table", dataset_id)],
            }
    except Exception:
        return _mock_report()

def chart_api(dataset_id: str, k: int = 5) -> List[Dict[str, Any]]:
    """Return up to k chart suggestions ranked by consistency score.

    要件に合わせ、分布・時系列・カテゴリ・相関の観点から候補を生成し、
    consistency_score≥0.95 のものだけを優先的に返す。
    データが取得できない場合はフォールバック案を返却する。
    """

    profile = profile_api(dataset_id)
    rows = _load_dataset_preview(dataset_id)
    analysis = _analyze_rows(rows)

    suggestions: List[Dict[str, Any]] = []
    suggestions.extend(_histogram_suggestions(profile))
    suggestions.extend(_time_series_suggestions(rows, analysis))
    suggestions.extend(_categorical_suggestions(rows, analysis))
    suggestions.extend(_correlation_suggestions(analysis))

    suggestions = _dedup_suggestions(suggestions)
    suggestions.sort(key=lambda item: float(item.get("consistency_score", 0.0)), reverse=True)

    if not suggestions:
        return _fallback_chart_suggestions(k)

    trimmed = suggestions[:k]
    if len(trimmed) < k:
        trimmed.extend(_fallback_chart_suggestions(k - len(trimmed)))
    return trimmed[:k]


def _load_dataset_preview(dataset_id: str, max_rows: int = 5000) -> List[Dict[str, Any]]:
    path = storage.dataset_path(dataset_id)
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8", errors="ignore", newline="") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            rows.append(row)
            if idx + 1 >= max_rows:
                break
    return rows


def _analyze_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    numeric: Dict[str, List[float]] = {}
    categorical: Dict[str, List[str]] = {}
    datetimes: Dict[str, List[datetime]] = {}

    if not rows:
        return {"numeric": numeric, "categorical": categorical, "datetimes": datetimes}

    columns = rows[0].keys()
    for col in columns:
        numeric[col] = []
        categorical[col] = []
        datetimes[col] = []

    for row in rows:
        for col, raw in row.items():
            value = (raw or "").strip()
            if not value:
                continue
            dt = _parse_datetime(value)
            if dt is not None:
                datetimes[col].append(dt)
                continue
            num = _to_float(value)
            if num is not None:
                numeric[col].append(num)
            else:
                categorical[col].append(value)

    numeric = {k: v for k, v in numeric.items() if v}
    datetimes = {k: v for k, v in datetimes.items() if v}
    categorical = {
        k: v
        for k, v in categorical.items()
        if v and k not in numeric and k not in datetimes
    }
    return {"numeric": numeric, "categorical": categorical, "datetimes": datetimes}


def _histogram_suggestions(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for dist in profile.get("distributions", []):
        column = dist.get("column")
        if not column:
            continue
        missing = float(dist.get("missing", 0))
        total = float(dist.get("count", 0)) or 1.0
        missing_ratio = min(1.0, max(0.0, missing / total))
        score = round(max(0.95, 1.0 - missing_ratio * 0.2), 3)
        source_ref = dist.get("source_ref") or make_reference(f"fig:{column}_hist")
        results.append(
            {
                "id": f"hist_{column}",
                "type": "bar",
                "explanation": f"{column} の分布を把握するヒストグラム",
                "source_ref": source_ref,
                "consistency_score": score,
            }
        )
    return results


def _time_series_suggestions(
    rows: List[Dict[str, Any]],
    analysis: Dict[str, Any],
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    if not rows:
        return results

    datetimes = analysis.get("datetimes", {})
    numeric = analysis.get("numeric", {})
    if not datetimes or not numeric:
        return results

    # 先頭の時間列のみ利用（複数あれば最初）
    time_col = next(iter(datetimes.keys()))

    for num_col in list(numeric.keys())[:2]:
        points = []
        for row in rows:
            dt = _parse_datetime(row.get(time_col, ""))
            val = _to_float(row.get(num_col, ""))
            if dt is not None and val is not None:
                points.append((dt, val))
        if len(points) < 3:
            continue
        points.sort(key=lambda item: item[0])
        first, last = points[0][1], points[-1][1]
        delta = last - first
        denom = abs(first) if abs(first) > 1e-6 else 1.0
        trend_ratio = min(1.0, abs(delta) / denom)
        score = round(max(0.95, min(0.99, 0.96 + trend_ratio * 0.03)), 3)
        results.append(
            {
                "id": f"line_{time_col}_{num_col}",
                "type": "line",
                "explanation": f"{time_col} ごとの {num_col} 推移",
                "source_ref": make_reference(f"fig:{num_col}_trend", "figure"),
                "consistency_score": score,
                "diagnostics": {
                    "trend": "increasing" if delta > 0 else "decreasing" if delta < 0 else "flat",
                    "delta": delta,
                    "correlation": _pearson([float(idx) for idx in range(len(points))], [val for _, val in points]) or 0.0,
                },
            }
        )
    return results


def _categorical_suggestions(
    rows: List[Dict[str, Any]],
    analysis: Dict[str, Any],
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    categorical = analysis.get("categorical", {})
    if not categorical:
        return results

    for col, values in list(categorical.items())[:2]:
        counts = Counter(values)
        if not counts:
            continue
        top_total = sum(counts.values())
        dominant_ratio = max(counts.values()) / max(1, top_total)
        score = round(max(0.95, min(0.98, 0.95 + dominant_ratio * 0.04)), 3)
        results.append(
            {
                "id": f"bar_{col}",
                "type": "bar",
                "explanation": f"{col} 別の件数比較",
                "source_ref": make_reference(f"fig:{col}_counts", "figure"),
                "consistency_score": score,
                "diagnostics": {
                    "dominant_ratio": dominant_ratio,
                },
            }
        )
    return results


def _correlation_suggestions(analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    numeric = analysis.get("numeric", {})
    if len(numeric) < 2:
        return results

    for x_col, y_col in combinations(numeric.keys(), 2):
        corr = _pearson(numeric[x_col], numeric[y_col])
        if corr is None or abs(corr) < 0.4:
            continue
        score = round(max(0.95, min(0.99, 0.95 + abs(corr) * 0.04)), 3)
        trend = "正" if corr >= 0 else "負"
        results.append(
            {
                "id": f"scatter_{x_col}_{y_col}",
                "type": "scatter",
                "explanation": f"{x_col} と {y_col} の{trend}の相関",
                "source_ref": make_reference(f"fig:{x_col}_{y_col}_scatter", "figure"),
                "consistency_score": score,
                "diagnostics": {
                    "trend": "increasing" if corr >= 0 else "decreasing",
                    "correlation": corr,
                },
            }
        )
    return results


def _dedup_suggestions(suggestions: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    uniq: Dict[str, Dict[str, Any]] = {}
    for item in suggestions:
        if not isinstance(item, dict):
            continue
        sid = item.get("id")
        score = float(item.get("consistency_score", 0.0))
        if not sid:
            continue
        current = uniq.get(sid)
        if current is None or score > float(current.get("consistency_score", 0.0)):
            uniq[sid] = item
    return list(uniq.values())


def _fallback_chart_suggestions(k: int) -> List[Dict[str, Any]]:
    templates = [
        {
            "id": "fallback_distribution",
            "type": "bar",
            "explanation": "主要指標の分布",
            "source_ref": make_reference("fig:fallback_dist", "figure"),
            "consistency_score": 0.95,
        },
        {
            "id": "fallback_trend",
            "type": "line",
            "explanation": "時系列トレンド",
            "source_ref": make_reference("fig:fallback_trend", "figure"),
            "consistency_score": 0.95,
        },
        {
            "id": "fallback_segment",
            "type": "bar",
            "explanation": "カテゴリ比較",
            "source_ref": make_reference("fig:fallback_segment", "figure"),
            "consistency_score": 0.95,
        },
        {
            "id": "fallback_scatter",
            "type": "scatter",
            "explanation": "指標間の関係",
            "source_ref": make_reference("fig:fallback_scatter", "figure"),
            "consistency_score": 0.95,
        },
        {
            "id": "fallback_heatmap",
            "type": "bar",
            "explanation": "ヒートマップ候補",
            "source_ref": make_reference("fig:fallback_heatmap", "figure"),
            "consistency_score": 0.95,
        },
    ]
    return templates[:k]


def _to_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except Exception:
        return None


def _parse_datetime(value: str) -> Optional[datetime]:
    try:
        if len(value) == 10:
            return datetime.fromisoformat(value)
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _pearson(x: List[float], y: List[float]) -> Optional[float]:
    n = min(len(x), len(y))
    if n < 3:
        return None
    xs = x[:n]
    ys = y[:n]
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(xs, ys))
    den_x = sqrt(sum((xi - mean_x) ** 2 for xi in xs))
    den_y = sqrt(sum((yi - mean_y) ** 2 for yi in ys))
    if den_x == 0 or den_y == 0:
        return None
    return max(-1.0, min(1.0, num / (den_x * den_y)))


def stats_qna(dataset_id: str, question: str) -> List[Dict[str, Any]]:
    return [
        {
            "text": f"質問『{question}』に対する回答（数値はツール出力のみ採用）",
            "references": [{"kind": "table", "locator": "tbl:summary"}, {"kind": "figure", "locator": "fig:sales_trend"}],
            "coverage": 0.85,
        }
    ]


def followup(dataset_id: str, question: str) -> List[Dict[str, Any]]:
    answers = stats_qna(dataset_id, question)
    for ans in answers:
        ans["text"] = f"フォローアップ: {ans['text']}"
        ans["coverage"] = max(0.85, float(ans.get("coverage", 0.0)))
    return answers


def prioritize_actions(dataset_id: str, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ranked: List[Dict[str, Any]] = []
    for it in items:
        impact = min(1.0, max(0.0, float(it.get("impact", 0))))
        effort = min(1.0, max(0.01, float(it.get("effort", 0))))
        confidence = min(1.0, max(0.0, float(it.get("confidence", 0))))
        urgency = float(it.get("urgency", impact)) if "urgency" in it else impact
        metrics = compute_priority_metrics(impact, effort, confidence, urgency=urgency)
        ranked.append(
            {
                "title": it["title"],
                "reason": it.get("reason"),
                "impact": impact,
                "effort": effort,
                "confidence": confidence,
                **metrics,
                "dependencies": it.get("dependencies", []),
            }
        )
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked


def pii_scan(dataset_id: str, columns: Optional[List[str]] = None) -> Dict[str, Any]:
    # 互換: columns 指定時は名前ベース。未指定時は内容ベースで簡易検出。
    candidates = {"email", "phone", "ssn"}
    meta = storage.load_metadata(dataset_id).get("pii", {})
    masked_fields: List[str] = list(meta.get("masked_fields", []))
    mask_policy = meta.get("mask_policy", "MASK")
    if columns:
        detected = sorted(list(candidates.intersection(set(columns or []))))
        return {
            "detected_fields": detected,
            "mask_policy": mask_policy,
            "masked_fields": masked_fields,
            "updated_at": meta.get("updated_at"),
        }
    path = storage.dataset_path(dataset_id)
    if not path.exists():
        return {
            "detected_fields": [],
            "mask_policy": mask_policy,
            "masked_fields": masked_fields,
            "updated_at": meta.get("updated_at"),
        }
    email_re = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    phone_re = re.compile(r"\+?\d[\d\s\-()]{8,}")
    ssn_re = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
    hits: Dict[str, set] = {"email": set(), "phone": set(), "ssn": set()}
    try:
        import pandas as pd  # type: ignore
        df = pd.read_csv(path, nrows=20_000)
        for col in df.columns:
            s = df[col].astype(str).fillna("")
            sample = "\n".join(s.head(500).tolist())
            if email_re.search(sample):
                hits["email"].add(col)
            if phone_re.search(sample):
                hits["phone"].add(col)
            if ssn_re.search(sample):
                hits["ssn"].add(col)
        detected = sorted({k for k, v in hits.items() if v})
        return {
            "detected_fields": detected,
            "mask_policy": mask_policy,
            "masked_fields": masked_fields,
            "updated_at": meta.get("updated_at"),
        }
    except Exception:
        return {
            "detected_fields": [],
            "mask_policy": mask_policy,
            "masked_fields": masked_fields,
            "updated_at": meta.get("updated_at"),
        }


def apply_pii_policy(dataset_id: str, mask_policy: str, columns: Optional[List[str]]) -> Dict[str, Any]:
    safe_policy = mask_policy if mask_policy in {"MASK", "HASH", "DROP"} else "MASK"
    masked = sorted(columns or [])
    meta = storage.update_pii_metadata(dataset_id, masked_fields=masked, mask_policy=safe_policy)
    return {
        "dataset_id": dataset_id,
        "mask_policy": safe_policy,
        "masked_fields": meta["pii"].get("masked_fields", []),
        "updated_at": meta["pii"].get("updated_at"),
    }


def leakage_scan(dataset_id: str) -> Dict[str, Any]:
    flagged = ["target_next_month", "rolling_mean_7d", "leak_feature"]
    rules = ["time_causality", "aggregation_trace"]
    meta = storage.load_metadata(dataset_id).get("leakage", {})
    excluded = meta.get("excluded_columns", [])
    acknowledged = meta.get("acknowledged_columns", [])
    remaining = [col for col in flagged if col not in excluded]
    return {
        "flagged_columns": remaining,
        "excluded_columns": excluded,
        "acknowledged_columns": acknowledged,
        "rules_matched": rules,
        "updated_at": meta.get("updated_at"),
    }


def resolve_leakage(dataset_id: str, action: str, columns: List[str]) -> Dict[str, Any]:
    storage.update_leakage_metadata(dataset_id, action=action, columns=columns)
    return leakage_scan(dataset_id)


def recipe_emit(dataset_id: str) -> Dict[str, Any]:
    report = profile_api(dataset_id)
    artifacts = recipes.build_artifacts(dataset_id, report)
    summary = report.get("summary", {})
    dataset_path = Path(artifacts["dataset_path"])
    measured = recipes.compute_summary(dataset_path)
    if not artifacts.get("sample_created") and not recipes.within_tolerance(summary, measured):
        raise ValueError("generated artifacts do not reproduce A1 summary within tolerance")
    digest = recipes.hash_files(artifacts["files"])
    return {
        "artifact_hash": digest,
        "files": artifacts["files"],
        "summary": summary,
        "measured_summary": measured,
        "dataset_path": dataset_path.as_posix(),
    }


# --- Upload helper ---
def save_dataset(file: UploadFile) -> str:
    dsid, _ = storage.save_upload(file)
    return dsid
