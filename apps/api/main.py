from datetime import datetime
import time
from typing import List, Literal, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .services import tools
from .services import evaluator
from .services import orchestrator


class Reference(BaseModel):
    kind: Literal["table", "column", "cell", "figure", "query", "doc"] = "figure"
    locator: str
    evidence_id: Optional[str] = None


class Distribution(BaseModel):
    column: str
    dtype: str
    count: int
    missing: int
    histogram: List[float]
    source_ref: Optional[Reference] = None


class DataQualityIssue(BaseModel):
    severity: Literal["low", "medium", "high", "critical"]
    column: str
    description: str
    statistic: Optional[dict] = None
    evidence: Reference


class DataQualityReport(BaseModel):
    issues: List[DataQualityIssue]


class NextAction(BaseModel):
    title: str
    reason: Optional[str] = None
    impact: float = Field(ge=0, le=1)
    effort: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    score: float
    wsjf: float
    rice: float
    dependencies: Optional[List[str]] = None


class Summary(BaseModel):
    rows: int
    cols: int
    missing_rate: float = Field(alias="missing_rate", ge=0.0, le=1.0)
    type_mix: dict = Field(alias="type_mix")

    class Config:
        allow_population_by_field_name = True


class Outlier(BaseModel):
    column: str
    indices: List[int]
    evidence: Optional[Reference] = None


class EDAReport(BaseModel):
    summary: Summary
    distributions: List[Distribution]
    key_features: List[str]
    outliers: List[Outlier]
    data_quality_report: DataQualityReport
    next_actions: List[NextAction]
    references: List[Reference]

    class Config:
        allow_population_by_field_name = True


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


class ChartsSuggestResponse(BaseModel):
    charts: List["ChartCandidate"]


class QnAResponse(BaseModel):
    answers: List["Answer"]
    references: List["Reference"] = []


class PrioritizeRequestItem(BaseModel):
    title: str
    reason: Optional[str] = None
    impact: float = Field(ge=0, le=1)
    effort: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    dependencies: Optional[List[str]] = None


class PrioritizeRequest(BaseModel):
    dataset_id: str
    next_actions: List[PrioritizeRequestItem]


class PrioritizedAction(BaseModel):
    title: str
    reason: Optional[str] = None
    impact: float = Field(ge=0, le=1)
    effort: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    score: float
    wsjf: float
    rice: float
    dependencies: Optional[List[str]] = None


class PIIScanRequest(BaseModel):
    dataset_id: str
    columns: Optional[List[str]] = None


class PIIScanResult(BaseModel):
    detected_fields: List[str]
    mask_policy: Literal["MASK", "HASH", "DROP"] = "MASK"
    masked_fields: List[str] = []
    updated_at: Optional[str] = None


class LeakageScanRequest(BaseModel):
    dataset_id: str


class LeakageScanResult(BaseModel):
    flagged_columns: List[str]
    rules_matched: List[str]
    excluded_columns: List[str] = []
    acknowledged_columns: List[str] = []
    updated_at: Optional[str] = None


class RecipeEmitRequest(BaseModel):
    dataset_id: str


class RecipeEmitResult(BaseModel):
    artifact_hash: str
    files: List[str]


class PIIApplyRequest(BaseModel):
    dataset_id: str
    mask_policy: Literal["MASK", "HASH", "DROP"] = "MASK"
    columns: List[str] = []


class PIIApplyResult(BaseModel):
    dataset_id: str
    mask_policy: Literal["MASK", "HASH", "DROP"]
    masked_fields: List[str]
    updated_at: str


class LeakageResolveRequest(BaseModel):
    dataset_id: str
    action: Literal["exclude", "acknowledge", "reset"] = "exclude"
    columns: List[str]


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


# --- Datasets Upload (A1 前段) ---
class UploadResponse(BaseModel):
    dataset_id: str


@app.post("/api/datasets/upload", response_model=UploadResponse)
def datasets_upload(file: UploadFile = File(...)) -> UploadResponse:
    try:
        dsid = tools.save_dataset(file)
    except ValueError as e:
        msg = str(e)
        code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE if "too large" in msg else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=msg)
    log_event("DatasetUploaded", {"dataset_id": dsid, "filename": file.filename})
    return UploadResponse(dataset_id=dsid)


@app.get("/api/datasets", response_model=List[dict])
def datasets_list() -> List[dict]:
    from .services.storage import list_datasets

    return list_datasets()


@app.post("/api/eda", response_model=EDAReport)
def eda(req: EDARequest) -> EDAReport:
    t0 = time.perf_counter()
    report_payload, evaluation = orchestrator.generate_eda_report(req.dataset_id, req.sample_ratio)
    report = EDAReport(**report_payload)
    dur = int((time.perf_counter() - t0) * 1000)
    log_event(
        "EDAReportGenerated",
        {
            "dataset_id": req.dataset_id,
            "sample_ratio": req.sample_ratio,
            "groundedness": evaluation.get("groundedness"),
            "issues": len(report.data_quality_report.issues),
            "next_actions": len(report.next_actions),
            "llm_latency_ms": evaluation.get("llm_latency_ms"),
            "llm_error": evaluation.get("llm_error"),
            "duration_ms": dur,
        },
    )
    return report


@app.post("/api/charts/suggest", response_model=ChartsSuggestResponse)
def charts_suggest(req: ChartsSuggestRequest) -> ChartsSuggestResponse:
    t0 = time.perf_counter()
    raw = tools.chart_api(req.dataset_id, req.k)
    filtered = [ChartCandidate(**c) for c in raw if evaluator.consistency_ok(c)]
    dur = int((time.perf_counter() - t0) * 1000)
    log_event("ChartsSuggested", {"dataset_id": req.dataset_id, "k": req.k, "count": len(filtered), "duration_ms": dur})
    return ChartsSuggestResponse(charts=filtered)


@app.post("/api/qna", response_model=QnAResponse)
def qna(req: QnARequest) -> QnAResponse:
    t0 = time.perf_counter()
    raw = tools.stats_qna(req.dataset_id, req.question)
    answers = [Answer(**a) for a in raw]
    refs: List[Reference] = []
    for a in answers:
        refs.extend(a.references)
    cov = answers[0].coverage if answers else 0.0
    dur = int((time.perf_counter() - t0) * 1000)
    log_event("EDAQueryAnswered", {"dataset_id": req.dataset_id, "coverage": cov, "duration_ms": dur})
    return QnAResponse(answers=answers, references=refs)


@app.post("/api/actions/prioritize", response_model=List[PrioritizedAction])
def prioritize(req: PrioritizeRequest) -> List[PrioritizedAction]:
    items = [{"title": it.title, "impact": it.impact, "effort": it.effort, "confidence": it.confidence} for it in req.next_actions]
    ranked = [PrioritizedAction(**r) for r in tools.prioritize_actions(req.dataset_id, items)]
    log_event("ActionsPrioritized", {"dataset_id": req.dataset_id, "count": len(ranked)})
    return ranked


@app.post("/api/pii/scan", response_model=PIIScanResult)
def pii_scan(req: PIIScanRequest) -> PIIScanResult:
    raw = tools.pii_scan(req.dataset_id, req.columns)
    res = PIIScanResult(**raw)
    log_event("PIIMasked", {"dataset_id": req.dataset_id, "detected_fields": res.detected_fields, "mask_policy": res.mask_policy})
    return res


@app.post("/api/pii/apply", response_model=PIIApplyResult)
def pii_apply(req: PIIApplyRequest) -> PIIApplyResult:
    result = tools.apply_pii_policy(req.dataset_id, req.mask_policy, req.columns)
    log_event(
        "PIIPolicyApplied",
        {
            "dataset_id": req.dataset_id,
            "mask_policy": result["mask_policy"],
            "masked_fields": result["masked_fields"],
        },
    )
    return PIIApplyResult(**result)


@app.post("/api/leakage/scan", response_model=LeakageScanResult)
def leakage_scan(req: LeakageScanRequest) -> LeakageScanResult:
    raw = tools.leakage_scan(req.dataset_id)
    res = LeakageScanResult(**raw)
    log_event("LeakageRiskFlagged", {"dataset_id": req.dataset_id, "flagged": res.flagged_columns, "rules_matched": res.rules_matched})
    return res


@app.post("/api/leakage/resolve", response_model=LeakageScanResult)
def leakage_resolve(req: LeakageResolveRequest) -> LeakageScanResult:
    updated = tools.resolve_leakage(req.dataset_id, req.action, req.columns)
    res = LeakageScanResult(**updated)
    log_event(
        "LeakageResolutionApplied",
        {
            "dataset_id": req.dataset_id,
            "action": req.action,
            "columns": req.columns,
            "remaining": res.flagged_columns,
        },
    )
    return res


@app.post("/api/recipes/emit", response_model=RecipeEmitResult)
def recipes_emit(req: RecipeEmitRequest) -> RecipeEmitResult:
    res = tools.recipe_emit(req.dataset_id)
    log_event("EDARecipeEmitted", {"artifact_hash": res["artifact_hash"], "files": res["files"]})
    return RecipeEmitResult(**res)


@app.post("/api/recipes/export", response_model=RecipeEmitResult)
def recipes_export(req: RecipeEmitRequest) -> RecipeEmitResult:
    # 互換エンドポイント（設計上の想定パス）: 内部処理は同一
    return recipes_emit(req)
