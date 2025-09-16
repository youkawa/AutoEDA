from datetime import datetime
from typing import List, Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class Reference(BaseModel):
    kind: Literal["figure", "table", "query", "doc", "cell"] = "figure"
    locator: str


class Distribution(BaseModel):
    column: str
    dtype: str
    count: int
    missing: int
    histogram: List[float]
    source_ref: Optional[Reference] = None


class Issue(BaseModel):
    severity: Literal["low", "medium", "high", "critical"]
    column: str
    description: str
    statistic: Optional[dict] = None


class Summary(BaseModel):
    rows: int
    cols: int
    missingRate: float = Field(ge=0.0, le=1.0)
    typeMix: dict


class Outlier(BaseModel):
    column: str
    indices: List[int]


class EDAReport(BaseModel):
    summary: Summary
    issues: List[Issue]
    distributions: List[Distribution]
    keyFeatures: List[str]
    outliers: List[Outlier]


class EDARequest(BaseModel):
    dataset_id: str
    sample_ratio: Optional[float] = Field(default=None, ge=0, le=1)


class ChartsSuggestRequest(BaseModel):
    dataset_id: str
    k: int = 5


class ChartCandidate(BaseModel):
    id: str
    type: Literal["bar", "line", "scatter"]
    explanation: str
    source_ref: Reference
    consistency_score: float = Field(ge=0, le=1)


class QnARequest(BaseModel):
    dataset_id: str
    question: str


class Answer(BaseModel):
    text: str
    references: List[Reference]
    coverage: float = Field(ge=0, le=1)


class PrioritizeRequestItem(BaseModel):
    title: str
    impact: float
    effort: float
    confidence: float = Field(ge=0, le=1)


class PrioritizeRequest(BaseModel):
    dataset_id: str
    next_actions: List[PrioritizeRequestItem]


class PrioritizedAction(BaseModel):
    title: str
    impact: float
    effort: float
    confidence: float
    score: float


class PIIScanRequest(BaseModel):
    dataset_id: str
    columns: Optional[List[str]] = None


class PIIScanResult(BaseModel):
    detected_fields: List[str]
    mask_policy: Literal["MASK", "HASH", "DROP"] = "MASK"


class LeakageScanRequest(BaseModel):
    dataset_id: str


class LeakageScanResult(BaseModel):
    flagged_columns: List[str]
    rules_matched: List[str]


def log_event(event_name: str, properties: dict) -> None:
    # 簡易な観測イベント出力（JSON）
    payload = {
        "event_name": event_name,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        **properties,
    }
    print(payload)


app = FastAPI(title="AutoEDA API")

# 開発用CORS（Vite dev server: http://localhost:5173）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/eda", response_model=EDAReport)
def eda(req: EDARequest) -> EDAReport:
    report = EDAReport(
        summary=Summary(rows=1_000_000, cols=48, missingRate=0.12, typeMix={"int": 20, "float": 10, "cat": 18}),
        issues=[
            Issue(severity="high", column="price", description="欠損が多い（32%）", statistic={"missing": 0.32}),
            Issue(severity="critical", column="date", description="将来日付が含まれている", statistic={"future_dates": 45}),
        ],
        distributions=[
            Distribution(column="price", dtype="float", count=1_000_000, missing=320_000, histogram=[100, 200, 500, 800, 300]),
            Distribution(column="quantity", dtype="int", count=1_000_000, missing=5000, histogram=[150, 400, 700, 600, 250]),
        ],
        keyFeatures=["price × promotion_rate が強い関係（r=0.85）", "seasonal_index が売上に大きく影響"],
        outliers=[Outlier(column="sales", indices=[12, 45, 156, 789])],
    )
    log_event("EDAReportGenerated", {"dataset_id": req.dataset_id, "sample_ratio": req.sample_ratio, "groundedness": 0.92})
    return report


@app.post("/api/charts/suggest", response_model=List[ChartCandidate])
def charts_suggest(req: ChartsSuggestRequest) -> List[ChartCandidate]:
    out = [
        ChartCandidate(
            id="c1",
            type="bar",
            explanation="売上の季節性を示すバーチャート",
            source_ref=Reference(kind="figure", locator="fig:sales_seasonality"),
            consistency_score=0.97,
        )
    ]
    log_event("ChartsSuggested", {"dataset_id": req.dataset_id, "k": req.k, "count": len(out)})
    return out[: req.k]


@app.post("/api/qna", response_model=List[Answer])
def qna(req: QnARequest) -> List[Answer]:
    ans = Answer(
        text=f"質問『{req.question}』に対する回答（数値はツール出力のみ採用）",
        references=[Reference(kind="table", locator="tbl:summary"), Reference(kind="figure", locator="fig:sales_trend")],
        coverage=0.85,
    )
    log_event("EDAQueryAnswered", {"dataset_id": req.dataset_id, "coverage": ans.coverage})
    return [ans]


@app.post("/api/actions/prioritize", response_model=List[PrioritizedAction])
def prioritize(req: PrioritizeRequest) -> List[PrioritizedAction]:
    def calc_score(it: PrioritizeRequestItem) -> float:
        denom = it.effort if it.effort > 0 else 1.0
        return (it.impact / denom) * it.confidence

    ranked = [
        PrioritizedAction(
            title=it.title,
            impact=it.impact,
            effort=it.effort,
            confidence=it.confidence,
            score=round(calc_score(it), 4),
        )
        for it in req.next_actions
    ]
    ranked.sort(key=lambda x: x.score, reverse=True)
    log_event("ActionsPrioritized", {"dataset_id": req.dataset_id, "count": len(ranked)})
    return ranked


@app.post("/api/pii/scan", response_model=PIIScanResult)
def pii_scan(req: PIIScanRequest) -> PIIScanResult:
    # デモ用: カラム名に典型的PIIが含まれていれば検出
    candidates = {"email", "phone", "ssn"}
    detected = sorted(list(candidates.intersection(set(req.columns or []))))
    res = PIIScanResult(detected_fields=detected, mask_policy="MASK")
    log_event("PIIMasked", {"dataset_id": req.dataset_id, "detected_fields": detected, "mask_policy": res.mask_policy})
    return res


@app.post("/api/leakage/scan", response_model=LeakageScanResult)
def leakage_scan(req: LeakageScanRequest) -> LeakageScanResult:
    # デモ用: 未来情報/集計後列を示す名称ヒューリスティック
    flagged = []
    rules = []
    for col in ["target_next_month", "rolling_mean_7d", "leak_feature"]:
        flagged.append(col)
    if flagged:
        rules = ["time_causality", "aggregation_trace"]
    res = LeakageScanResult(flagged_columns=flagged, rules_matched=rules)
    log_event("LeakageRiskFlagged", {"dataset_id": req.dataset_id, "flagged": flagged, "rules_matched": rules})
    return res
