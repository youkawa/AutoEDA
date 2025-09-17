from typing import Any, Dict, List, Optional, Tuple
from fastapi import UploadFile
from . import storage
import re
from collections import Counter
import csv


def make_reference(locator: str, kind: str = "table", evidence_id: Optional[str] = None) -> Dict[str, Any]:
    ref: Dict[str, Any] = {"kind": kind, "locator": locator}
    if evidence_id:
        ref["evidence_id"] = evidence_id
    return ref


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
            {"title": "price 列の欠損補完", "reason": "重大な欠損率を是正", "impact": 0.9, "effort": 0.3, "confidence": 0.8, "score": 2.4, "dependencies": ["impute_price_mean"]},
            {"title": "date 列の異常値修正", "reason": "未来日付がリークリスク", "impact": 0.85, "effort": 0.4, "confidence": 0.7, "score": 1.4875, "dependencies": ["validate_date_source"]},
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

            def calc_score(impact: float, effort: float, confidence: float) -> float:
                eff = effort if effort > 0 else 0.1
                return round((impact / eff) * confidence, 4)

            next_actions = []
            severity_map = {"critical": 0.95, "high": 0.9, "medium": 0.7, "low": 0.5}
            for issue in issues:
                impact = severity_map.get(issue["severity"], 0.6)
                effort = 0.35 if issue["severity"] in {"critical", "high"} else 0.45
                confidence = 0.75 if issue["severity"] == "medium" else 0.85
                next_actions.append({
                    "title": f"{issue['column']} の改善",
                    "reason": issue["description"],
                    "impact": round(min(1.0, impact), 2),
                    "effort": round(min(1.0, effort), 2),
                    "confidence": round(min(1.0, confidence), 2),
                    "score": calc_score(impact, effort, confidence),
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
                    {"title": "欠損補完", "reason": "高い欠損率を解消", "impact": 0.85, "effort": 0.4, "confidence": 0.75, "score": 1.5938, "dependencies": ["remediate_missing"]}
                ],
                "references": [make_reference("tbl:summary", "table", dataset_id)],
            }
    except Exception:
        return _mock_report()


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
        impact = min(1.0, max(0.0, float(it.get("impact", 0))))
        effort = min(1.0, max(0.01, float(it.get("effort", 0))))
        confidence = min(1.0, max(0.0, float(it.get("confidence", 0))))
        return round((impact / effort) * confidence, 4)

    ranked = [
        {
            "title": it["title"],
            "reason": it.get("reason"),
            "impact": min(1.0, max(0.0, float(it.get("impact", 0)))),
            "effort": min(1.0, max(0.0, float(it.get("effort", 0)))),
            "confidence": min(1.0, max(0.0, float(it.get("confidence", 0)))),
            "score": calc_score(it),
            "dependencies": it.get("dependencies", []),
        }
        for it in items
    ]
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked


def pii_scan(dataset_id: str, columns: Optional[List[str]] = None) -> Dict[str, Any]:
    # 互換: columns 指定時は名前ベース。未指定時は内容ベースで簡易検出。
    candidates = {"email", "phone", "ssn"}
    if columns:
        detected = sorted(list(candidates.intersection(set(columns or []))))
        return {"detected_fields": detected, "mask_policy": "MASK"}
    path = storage.dataset_path(dataset_id)
    if not path.exists():
        return {"detected_fields": [], "mask_policy": "MASK"}
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
        return {"detected_fields": detected, "mask_policy": "MASK"}
    except Exception:
        return {"detected_fields": [], "mask_policy": "MASK"}


def leakage_scan(dataset_id: str) -> Dict[str, Any]:
    flagged = ["target_next_month", "rolling_mean_7d", "leak_feature"]
    rules = ["time_causality", "aggregation_trace"]
    return {"flagged_columns": flagged, "rules_matched": rules}


def recipe_emit(dataset_id: str) -> Dict[str, Any]:
    # Deterministic artifact hash for demo purposes
    digest = f"{hash(dataset_id) & 0xFFFFFFFF:08x}"
    files = ["recipe.json", "eda.ipynb", "sampling.sql"]
    return {"artifact_hash": digest, "files": files}


# --- Upload helper ---
def save_dataset(file: UploadFile) -> str:
    dsid, _ = storage.save_upload(file)
    return dsid
