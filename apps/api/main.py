from datetime import datetime
import time
from typing import List, Literal, Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .services import tools
from .services import evaluator
from .services import orchestrator
from .services import metrics
from .services import charts as chartsvc
from .services import sandbox
from . import config as app_config
from .services import plan as plan_svc
from .services import charts_store
from .services.security import redact
import os as _os
import json as _json


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


class FollowupRequest(BaseModel):
    dataset_id: str
    question: str


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
    files: List[Dict[str, Any]]
    summary: Optional[Summary] = None
    measured_summary: Optional[Dict[str, Any]] = None


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


class ProviderState(BaseModel):
    configured: bool


class CredentialStatus(BaseModel):
    provider: Literal["openai", "gemini"]
    configured: bool
    providers: Dict[str, ProviderState]


class CredentialUpdateRequest(BaseModel):
    provider: Literal["openai", "gemini"] = "openai"
    # サーバ側で明示バリデーションするため Optional にする
    api_key: Optional[str] = Field(default=None)
    openai_api_key: Optional[str] = Field(default=None, alias="openai_api_key")

    class Config:
        allow_population_by_field_name = True

class ProviderUpdateRequest(BaseModel):
    provider: Literal["openai", "gemini"]


def log_event(event_name: str, properties: dict) -> None:
    # 簡易な観測イベント出力（JSON）
    payload = {
        "event_name": event_name,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        **properties,
    }
    metrics.record_event(event_name, **properties)
    metrics.persist_event(payload)
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


@app.get("/api/metrics/slo")
def metrics_slo(dataset_id: Optional[str] = None) -> Dict[str, Any]:
    """Return in-memory SLO snapshot with simple threshold evaluation.

    - Optionally accepts `dataset_id` to scope Charts KPIs.
    """
    snapshot = metrics.slo_snapshot()
    thresholds = {
        "EDAReportGenerated": {"p95": 5000, "groundedness": 0.9},
        "ChartJobFinished": {"p95": 2000},
        "ChartBatchFinished": {"p95": 4000},
    }
    # allow env override (JSON)
    try:
        raw = _os.getenv("AUTOEDA_SLO_THRESHOLDS")
        if raw:
            env_cfg = _json.loads(raw)
            if isinstance(env_cfg, dict):
                thresholds.update(env_cfg)
    except Exception:
        pass
    evaluation = metrics.detect_violations(thresholds)
    # H 系 KPI 要約（served%/avg_wait）— 最近 N 件から（必要に応じ dataset_id でスコープ）
    charts = metrics.charts_summary(limit=12, dataset_id=dataset_id)
    return {"snapshot": snapshot, "evaluation": evaluation, "thresholds": thresholds, "charts_summary": charts, "dataset_id": dataset_id}


@app.get("/api/metrics/charts/snapshots")
def metrics_charts_snapshots(dataset_id: Optional[str] = None, limit: int = 12) -> Dict[str, Any]:
    """Return recent ChartBatchSnapshot series for ChartsPage sparkline."""
    limit = max(1, min(int(limit or 12), 200))
    snaps = metrics.recent_batch_snapshots(limit=limit, dataset_id=dataset_id)
    # project to minimal series
    series = []
    for s in snaps:
        total = int(s.get("total") or 0) or 1
        served = int(s.get("served") or 0)
        series.append({
            "t": s.get("timestamp"),
            "served_pct": int(round((served / total) * 100)),
            "avg_wait_ms": s.get("avg_wait_ms"),
            "served": served,
            "total": int(s.get("total") or 0),
        })
    return {"series": series}


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
            "fallback_applied": evaluation.get("fallback_applied"),
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
    try:
        raw = orchestrator.answer_qna(req.dataset_id, req.question)
    except Exception:
        raw = tools.stats_qna(req.dataset_id, req.question)
    answers = [Answer(**a) for a in raw]
    refs: List[Reference] = []
    for a in answers:
        refs.extend(a.references)
    cov = answers[0].coverage if answers else 0.0
    dur = int((time.perf_counter() - t0) * 1000)
    log_event("EDAQueryAnswered", {"dataset_id": req.dataset_id, "coverage": cov, "duration_ms": dur})
    return QnAResponse(answers=answers, references=refs)


@app.post("/api/followup", response_model=QnAResponse)
def followup(req: FollowupRequest) -> QnAResponse:
    t0 = time.perf_counter()
    raw = tools.followup(req.dataset_id, req.question)
    answers = [Answer(**a) for a in raw]
    refs: List[Reference] = []
    for ans in answers:
        refs.extend(ans.references)
    cov = answers[0].coverage if answers else 0.0
    dur = int((time.perf_counter() - t0) * 1000)
    log_event(
        "FollowupAnswered",
        {
            "dataset_id": req.dataset_id,
            "coverage": cov,
            "duration_ms": dur,
        },
    )
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


@app.get("/api/credentials/llm", response_model=CredentialStatus)
def credentials_llm_status() -> CredentialStatus:
    provider = app_config.get_llm_provider()
    provider_states = {
        name: ProviderState(configured=app_config.is_provider_configured(name))
        for name in sorted(app_config.SUPPORTED_PROVIDERS)
    }
    configured = provider_states.get(provider, ProviderState(configured=False)).configured
    return CredentialStatus(provider=provider, configured=configured, providers=provider_states)


@app.post("/api/credentials/llm", status_code=status.HTTP_204_NO_CONTENT)
def credentials_llm_update(req: CredentialUpdateRequest) -> None:
    # 人間可読な一貫フォーマットで 400 を返す
    key = (req.api_key or req.openai_api_key or "").strip()
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="api_key is required")
    if len(key) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="api_key must be at least 8 characters")
    if key.startswith("<"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="api_key still contains placeholder value")

    try:
        app_config.set_llm_credentials(req.provider, key)
    except app_config.CredentialsError as exc:
        # app_config 側の検証も 400 に正規化
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    log_event("LLMCredentialsUpdated", {"provider": req.provider, "configured": True})


@app.post("/api/credentials/llm/provider", status_code=status.HTTP_204_NO_CONTENT)
def credentials_llm_set_active(req: ProviderUpdateRequest) -> None:
    try:
        app_config.set_active_provider(req.provider)
    except app_config.CredentialsError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    log_event("LLMProviderSwitched", {"provider": req.provider})


# --- H: Chart Generation (MVP synchronous) ---
class ChartGenerateItem(BaseModel):
    dataset_id: str
    spec_hint: Optional[str] = None
    columns: Optional[List[str]] = None
    library: Optional[str] = None
    seed: Optional[int] = None


class ChartOutput(BaseModel):
    type: Literal["image", "vega"]
    mime: str
    content: Any


class ChartResult(BaseModel):
    language: str = "python"
    library: str = "vega"
    code: Optional[str] = None
    seed: Optional[int] = None
    outputs: List[ChartOutput]


class ChartJob(BaseModel):
    job_id: str
    status: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    result: Optional[ChartResult] = None
    error: Optional[str] = None
    error_code: Optional[Literal["timeout", "cancelled", "forbidden_import", "format_error", "unknown"]] = None
    error_detail: Optional[str] = None


class ChartBatchStatus(BaseModel):
    batch_id: str
    total: int
    done: int
    running: int
    failed: int
    items: List[Dict[str, Any]]
    results: Optional[List[ChartResult]] = None
    results_map: Optional[Dict[str, ChartResult]] = None
    queued: Optional[int] = None
    cancelled: Optional[int] = None
    parallelism: Optional[int] = None
    parallelism_effective: Optional[int] = None
    served: Optional[int] = None
    avg_wait_ms: Optional[int] = None


@app.post("/api/charts/generate", response_model=ChartJob)
def charts_generate(item: ChartGenerateItem) -> ChartJob:
    # metrics: requested -> completed
    log_event("ChartGenerationRequested", {"dataset_id": item.dataset_id, "hint": item.spec_hint})
    job = chartsvc.generate(item.dict())
    log_event(
        "ChartGenerationCompleted",
        {"dataset_id": item.dataset_id, "status": job.get("status"), "job_id": job.get("job_id")},
    )
    return ChartJob(**job)


@app.post("/api/charts/generate-batch", response_model=ChartBatchStatus)
def charts_generate_batch(payload: Dict[str, Any]) -> ChartBatchStatus:
    items = payload.get("items") or []
    try:
        parallelism = int(payload.get("parallelism") or 3)
    except Exception:
        parallelism = 3
    log_event("ChartBatchStarted", {"total": len(items), "parallelism": parallelism})
    status_obj = chartsvc.generate_batch(items, parallelism=parallelism)
    log_event("ChartBatchCompleted", {"batch_id": status_obj.get("batch_id"), "total": status_obj.get("total")})
    return ChartBatchStatus(**status_obj)


@app.get("/api/charts/jobs/{job_id}", response_model=ChartJob)
def charts_job(job_id: str) -> ChartJob:
    job = chartsvc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return ChartJob(**job)


@app.get("/api/charts/batches/{batch_id}", response_model=ChartBatchStatus)
def charts_batch(batch_id: str) -> ChartBatchStatus:
    st = chartsvc.get_batch(batch_id)
    if not st:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="batch not found")
    return ChartBatchStatus(**st)


class ChartBatchCancelRequest(BaseModel):
    job_ids: Optional[List[str]] = None


@app.post("/api/charts/batches/{batch_id}/cancel")
def charts_batch_cancel(batch_id: str, req: ChartBatchCancelRequest) -> Dict[str, Any]:
    cancelled = chartsvc.cancel_batch(batch_id, req.job_ids or [])
    return {"batch_id": batch_id, "cancelled": cancelled}


# --- F/G: Experimental skeleton endpoints (non-breaking stubs) ---
class PlanTask(BaseModel):
    id: str
    title: str
    why: Optional[str] = None
    tool: Optional[str] = None
    depends_on: Optional[List[str]] = None


class PlanModel(BaseModel):
    version: str
    generated_at: datetime
    tasks: List[PlanTask] = []


class PlanGenerateRequest(BaseModel):
    dataset_id: str
    goals: Optional[str] = None
    top_k: int = 5


class PlanReviseRequest(BaseModel):
    plan: PlanModel
    instruction: str


class ExecRunRequest(BaseModel):
    task_id: str
    dataset_id: Optional[str] = None
    code: Optional[str] = None
    language: Literal["python", "sql"] = "python"
    timeout_ms: Optional[int] = Field(default=3000, ge=100, le=20000)


class ExecRunResult(BaseModel):
    task_id: str
    status: Literal["succeeded", "failed", "skipped"] = "skipped"
    logs: List[str] = []
    outputs: List[Dict[str, Any]] = []
    # エラー時の機械判別コード（UIで友好メッセージに変換）
    error_code: Optional[Literal["timeout", "cancelled", "forbidden_import", "format_error", "unknown"]] = None


@app.post("/api/plan/generate", response_model=PlanModel)
def plan_generate(req: PlanGenerateRequest) -> PlanModel:
    obj = plan_svc.generate_plan(req.dataset_id, req.goals, req.top_k)
    tasks = [PlanTask(**t) for t in obj.get("tasks", [])]
    return PlanModel(version=obj.get("version", "v1"), generated_at=datetime.utcnow(), tasks=tasks)


@app.post("/api/plan/revise", response_model=PlanModel)
def plan_revise(req: PlanReviseRequest) -> PlanModel:
    try:
        obj = plan_svc.revise_plan(req.plan.dict(), req.instruction)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    tasks = [PlanTask(**t) for t in obj.get("tasks", [])]
    return PlanModel(version=obj.get("version", "v1"), generated_at=datetime.utcnow(), tasks=tasks)


@app.post("/api/exec/run", response_model=ExecRunResult)
def exec_run(req: ExecRunRequest) -> ExecRunResult:
    # MVP: Python のみサポート。code が無い場合は skipped。
    if req.language != "python" or not (req.code and req.code.strip()):
        return ExecRunResult(task_id=req.task_id, status="skipped", logs=["no-op"], outputs=[])
    try:
        runner = sandbox.SandboxRunner()
        res = runner.run_code_exec(code=req.code, dataset_id=req.dataset_id, timeout_sec=(req.timeout_ms or 3000)/1000.0)
        outs = res.get("outputs") or []
        return ExecRunResult(task_id=req.task_id, status="succeeded", logs=[], outputs=outs)
    except sandbox.SandboxError as exc:
        code = getattr(exc, "code", None)
        raw = getattr(exc, "logs", None)
        msg = redact(str(raw)[:500] if raw else str(exc))
        # 不明コードは 'unknown' に丸める
        ec: Optional[str] = code if isinstance(code, str) and code in {"timeout", "cancelled", "forbidden_import", "format_error", "unknown"} else "unknown"
        return ExecRunResult(task_id=req.task_id, status="failed", logs=[msg], outputs=[], error_code=ec) 

# --- G2: Deep-dive interactive suggestions (MVP deterministic) ---
class DeepDiveRequest(BaseModel):
    dataset_id: str
    prompt: str


class DeepDiveSuggestion(BaseModel):
    title: str
    why: Optional[str] = None
    code: Optional[str] = None
    spec: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    diagnostics: Optional[Dict[str, Any]] = None


class DeepDiveResponse(BaseModel):
    suggestions: List[DeepDiveSuggestion]


@app.post("/api/analysis/deepdive", response_model=DeepDiveResponse)
def analysis_deepdive(req: DeepDiveRequest) -> DeepDiveResponse:
    text = (req.prompt or "").lower()
    sugg: List[DeepDiveSuggestion] = []
    if any(k in text for k in ["trend", "時系列", "推移"]):
        sugg.append(DeepDiveSuggestion(
            title="時系列の推移を検証",
            why="トレンド/季節性の有無を確認",
            spec={
                "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                "mark": "line",
                "data": {"name": "data"},
                "encoding": {"x": {"field":"x","type":"quantitative"}, "y": {"field":"y","type":"quantitative"}},
                "datasets": {"data": [{"x": i, "y": v} for i, v in enumerate([1,2,3,2,4,3,5])]},
                "description": "deepdive line"
            },
            tags=["trend"],
            diagnostics={"seasonality": False, "expected_window": 3}
        ))
    if any(k in text for k in ["相関", "correlation", "関係"]):
        sugg.append(DeepDiveSuggestion(
            title="相関の有無を確認",
            why="散布図で線形関係や外れ値の有無を確認",
            spec={
                "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                "mark": "point",
                "data": {"name": "data"},
                "encoding": {"x": {"field":"x","type":"quantitative"}, "y": {"field":"y","type":"quantitative"}},
                "datasets": {"data": [{"x": x, "y": y} for x, y in [(1,2),(2,2.5),(3,3),(4,3.8),(5,5)]]},
                "description": "deepdive scatter"
            },
            tags=["correlation"],
            diagnostics={"hypothesis": "linear", "outlier_sensitive": True}
        ))
    if not sugg:
        sugg.append(DeepDiveSuggestion(title="分布の形状を確認", why="ヒストグラムで歪度や多峰性を確認"))
    return DeepDiveResponse(suggestions=sugg)


# --- H3: Charts save/list (MVP local JSON store) ---
class ChartSaveRequest(BaseModel):
    dataset_id: str
    chart_id: Optional[str] = None
    title: Optional[str] = None
    hint: Optional[str] = None
    # 片方あればOK（SVG優先）。vegaは application/json 相当。
    svg: Optional[str] = None
    vega: Optional[Dict[str, Any]] = None


class ChartSavedItem(BaseModel):
    id: str
    dataset_id: str
    chart_id: Optional[str] = None
    title: Optional[str] = None
    hint: Optional[str] = None
    svg: Optional[str] = None
    vega: Optional[Dict[str, Any]] = None
    created_at: str


@app.post("/api/charts/save", response_model=ChartSavedItem)
def charts_save(req: ChartSaveRequest) -> ChartSavedItem:
    if not (req.svg or req.vega):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="either svg or vega must be provided")
    from uuid import uuid4
    from datetime import datetime as _dt
    item = {
        "id": uuid4().hex[:12],
        "dataset_id": req.dataset_id,
        "chart_id": req.chart_id,
        "title": req.title,
        "hint": req.hint,
        "svg": req.svg,
        "vega": req.vega,
        "created_at": _dt.utcnow().isoformat() + "Z",
    }
    charts_store.add_item(item)
    log_event("ChartSaved", {"dataset_id": req.dataset_id, "chart_id": req.chart_id, "has_svg": bool(req.svg), "has_vega": bool(req.vega)})
    return ChartSavedItem(**item)


@app.get("/api/charts/list", response_model=List[ChartSavedItem])
def charts_list(dataset_id: Optional[str] = None) -> List[ChartSavedItem]:
    out = [ChartSavedItem(**it) for it in charts_store.list_items(dataset_id)]
    return out


@app.delete("/api/charts/{saved_id}")
def charts_delete(saved_id: str) -> Dict[str, Any]:
    ok = charts_store.delete_item(saved_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    log_event("ChartDeleted", {"id": saved_id})
    return {"deleted": True}
