from typing import Any, Dict, List, Optional
from fastapi import UploadFile
from . import storage
import re
from collections import Counter
import csv


def _mock_report() -> Dict[str, Any]:
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
                    issues.append({"severity": "high", "column": col, "description": "欠損が多い", "statistic": {"missing": round(miss/rows, 2)}})
            # 未来日付
            for col in df.columns:
                if df[col].dtype == "object":
                    try:
                        dt = pd.to_datetime(df[col], errors="coerce")
                        future = int((dt > pd.Timestamp.now()).sum())
                        if future > 0:
                            issues.append({"severity": "critical", "column": col, "description": "将来日付が含まれている", "statistic": {"future_dates": future}})
                    except Exception:
                        pass
            # 分布（最大2列、数値のみ）
            dists: List[Dict[str, Any]] = []
            num_cols = [c for c in df.columns if np.issubdtype(df[c].dtype, np.number)]
            for col in num_cols[:2]:
                s = df[col].dropna()
                hist, _ = np.histogram(s, bins=5) if not s.empty else (np.zeros(5, dtype=int), [])
                dists.append({"column": col, "dtype": str(df[col].dtype), "count": rows, "missing": int(df[col].isna().sum()), "histogram": [int(x) for x in hist.tolist()]})
            # 外れ値（IQRベース、先頭1列のみ）
            outliers: List[Dict[str, Any]] = []
            if num_cols:
                s = df[num_cols[0]].dropna()
                if not s.empty:
                    q1, q3 = s.quantile(0.25), s.quantile(0.75)
                    iqr = q3 - q1
                    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
                    idx = df.index[(df[num_cols[0]] < lo) | (df[num_cols[0]] > hi)].tolist()[:10]
                    outliers.append({"column": num_cols[0], "indices": [int(i) for i in idx]})
            return {
                "summary": {"rows": rows, "cols": cols, "missingRate": round(missing_rate, 4), "typeMix": dict(type_mix)},
                "issues": issues,
                "distributions": dists,
                "keyFeatures": [],
                "outliers": outliers,
            }
        except Exception:
            # pandas不在や失敗時: 軽量CSVで概算
            rows = 0
            cols = 0
            missing_counts: Dict[str, int] = {}
            type_mix: Dict[str, int] = {"int": 0, "float": 0, "cat": 0}
            with path.open("r", newline="") as f:
                reader = csv.DictReader(f)
                fieldnames = reader.fieldnames or []
                cols = len(fieldnames)
                for name in fieldnames:
                    missing_counts[name] = 0
                for row in reader:
                    rows += 1
                    for k, v in row.items():
                        if v is None or v == "":
                            missing_counts[k] += 1
                        else:
                            try:
                                int(v); type_mix["int"] += 1
                            except Exception:
                                try:
                                    float(v); type_mix["float"] += 1
                                except Exception:
                                    type_mix["cat"] += 1
                    if sample_ratio and rows > int((1.0 - sample_ratio) * 10_000):
                        break
            missing_total = sum(missing_counts.values())
            total_cells = rows * max(cols, 1)
            missing_rate = float(missing_total) / float(total_cells or 1)
            dists = [
                {"column": name, "dtype": "unknown", "count": rows, "missing": miss, "histogram": []}
                for name, miss in list(missing_counts.items())[:2]
            ]
            issues = []
            for name, miss in missing_counts.items():
                if rows and miss / rows > 0.3:
                    issues.append({"severity": "high", "column": name, "description": "欠損が多い", "statistic": {"missing": round(miss/rows, 2)}})
            return {
                "summary": {"rows": rows, "cols": cols, "missingRate": round(missing_rate, 4), "typeMix": type_mix},
                "issues": issues,
                "distributions": dists,
                "keyFeatures": [],
                "outliers": [],
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
