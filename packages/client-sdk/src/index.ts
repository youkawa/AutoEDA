import type {
  EDAReport,
  ChartCandidate,
  Answer,
  PrioritizeItem,
  PrioritizedAction,
  PIIScanResult,
  PIIApplyResult,
  LeakageScanResult,
  RecipeEmitResult,
  Reference,
} from '@autoeda/schemas';

export type Dataset = { id: string; name: string; rows: number; cols: number; updatedAt?: string };

export async function listDatasets(): Promise<Dataset[]> {
  try {
    const res = await fetch(`${API_BASE ?? ''}/api/datasets`);
    if (res.ok) {
      const data = (await res.json()) as Dataset[];
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (_) {
    // fall through
  }
  // Fallback (dev/test)
  return [
    { id: 'ds_001', name: 'sales.csv', rows: 1_000_000, cols: 48, updatedAt: '2025-01-20T10:30:00Z' },
    { id: 'ds_002', name: 'customers.csv', rows: 50_000, cols: 15, updatedAt: '2025-01-19T14:22:00Z' },
  ];
}

const API_BASE: string | undefined = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) || undefined;

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE ?? ''}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function getJSON<T>(path: string): Promise<T> {
  const url = `${API_BASE ?? ''}${path}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
async function postFile<T>(path: string, file: File): Promise<T> {
  const url = `${API_BASE ?? ''}${path}`;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// Mock fallback used when fetch fails (dev/test without API)
function makeReference(locator: string, kind: Reference['kind'] = 'figure'): Reference {
  return { kind, locator };
}

function computePriorityMetrics(impact: number, effort: number, confidence: number, urgency = impact) {
  const normalizedImpact = Math.min(1, Math.max(0, impact));
  const normalizedConfidence = Math.min(1, Math.max(0, confidence));
  const eff = Math.min(1, Math.max(0.05, effort));
  const urg = Math.min(1, Math.max(0.1, urgency));
  const costOfDelay = (normalizedImpact * 0.6 + urg * 0.4) * normalizedConfidence;
  const wsjf = Number((costOfDelay / eff).toFixed(4));
  const reach = 1 + urg * 9;
  const rice = Number(((reach * normalizedImpact * normalizedConfidence) / eff).toFixed(2));
  return { score: wsjf, wsjf, rice };
}

function fallbackEDA(): EDAReport {
  return {
    summary: { rows: 1_000_000, cols: 48, missing_rate: 0.12, type_mix: { int: 20, float: 10, cat: 18 } },
    distributions: [
      { column: 'price', dtype: 'float', count: 1_000_000, missing: 320_000, histogram: [100, 200, 500, 800, 300], source_ref: makeReference('fig:price_hist') },
      { column: 'quantity', dtype: 'int', count: 1_000_000, missing: 5000, histogram: [150, 400, 700, 600, 250], source_ref: makeReference('fig:quantity_hist') },
    ],
    key_features: [
      'price × promotion_rate が強い関係（r=0.85）',
      'seasonal_index が売上に大きく影響',
      'customer_segment別の購買パターンが明確',
    ],
    outliers: [
      { column: 'sales', indices: [12, 45, 156, 789], evidence: makeReference('tbl:outliers_sales', 'table') },
      { column: 'discount', indices: [23, 67, 234], evidence: makeReference('tbl:outliers_discount', 'table') },
    ],
    data_quality_report: {
      issues: [
        { severity: 'high', column: 'price', description: '欠損が多い（32%）', statistic: { missing_ratio: 0.32 }, evidence: makeReference('tbl:price_quality', 'table') },
        { severity: 'critical', column: 'date', description: '将来日付が含まれている', statistic: { future_dates: 45 }, evidence: makeReference('tbl:date_future', 'table') },
        { severity: 'medium', column: 'category', description: '不明な値が存在', statistic: { unknown_values: 156 }, evidence: makeReference('tbl:category_unknown', 'table') },
      ],
    },
    next_actions: [
      {
        title: 'price 列の欠損補完',
        impact: 0.9,
        effort: 0.3,
        confidence: 0.8,
        reason: '重大な欠損により分析が阻害',
        dependencies: ['impute_price_mean'],
        ...computePriorityMetrics(0.9, 0.3, 0.8, 0.95),
      },
      {
        title: 'date 列の検証',
        impact: 0.8,
        effort: 0.4,
        confidence: 0.7,
        reason: '未来日付がターゲットリークを誘発',
        dependencies: ['validate_date_source'],
        ...computePriorityMetrics(0.8, 0.4, 0.7, 0.9),
      },
    ],
    references: [
      makeReference('tbl:summary'),
      makeReference('fig:price_hist'),
      makeReference('fig:quantity_hist'),
      makeReference('tool:fallback')
    ],
  };
}

export async function getEDAReport(datasetId: string): Promise<EDAReport> {
  try {
    return await postJSON<EDAReport>('/api/eda', { dataset_id: datasetId });
  } catch (_) {
    return fallbackEDA();
  }
}

export async function suggestCharts(datasetId: string, k = 5): Promise<ChartCandidate[]> {
  try {
    const res = await postJSON<any>('/api/charts/suggest', { dataset_id: datasetId, k });
    // サーバの設計準拠: { charts: ChartCandidate[] } に正規化（後方互換: 配列も許容）
    return Array.isArray(res) ? (res as ChartCandidate[]) : (res?.charts ?? []);
  } catch (_) {
    return [
      {
        id: 'c1',
        type: 'bar',
        explanation: '売上の季節性を示すバーチャート',
        source_ref: { kind: 'figure', locator: 'fig:sales_seasonality' },
        consistency_score: 0.97,
        diagnostics: { dominant_ratio: 0.6 },
      },
    ];
  }
}

// --- H: Chart Generation ---
import type { ChartResult, ChartJob } from '@autoeda/schemas';

type GenerateItem = {
  dataset_id: string;
  spec_hint?: string;
  columns?: string[];
  library?: 'vega' | 'altair' | 'matplotlib';
  seed?: number;
};

export async function generateChart(datasetId: string, specHint?: string, columns: string[] = []): Promise<ChartResult> {
  const job = await postJSON<ChartJob>('/api/charts/generate', {
    dataset_id: datasetId,
    spec_hint: specHint,
    columns,
  } as GenerateItem);
  if (job.status === 'succeeded' && job.result) return job.result;
  if (job.status === 'failed') throw new Error(job.error || 'chart generation failed');
  const res = await generateChartWithProgress(datasetId, specHint, columns);
  return res;
}

export async function generateChartWithProgress(
  datasetId: string,
  specHint?: string,
  columns: string[] = [],
  onProgress?: (s: { status: string; stage?: string }) => void,
): Promise<ChartResult> {
  const job = await postJSON<ChartJob>('/api/charts/generate', {
    dataset_id: datasetId,
    spec_hint: specHint,
    columns,
  } as GenerateItem);
  if (job.status === 'succeeded' && job.result) return job.result;
  if (job.status === 'failed') throw new Error(job.error || 'chart generation failed');
  const started = Date.now();
  const deadline = started + 10_000;
  let lastStage: string | undefined = (job as any).stage;
  if (onProgress) onProgress({ status: job.status, stage: lastStage });
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    const cur = await getJSON<any>(`/api/charts/jobs/${job.job_id}`);
    const curStage: string | undefined = cur.stage;
    if (onProgress && (curStage !== lastStage || cur.status !== job.status)) {
      onProgress({ status: cur.status, stage: curStage });
      lastStage = curStage;
    }
    if (cur.status === 'succeeded' && cur.result) return cur.result as ChartResult;
    if (cur.status === 'failed') throw new Error(cur.error || 'chart generation failed');
  }
  throw new Error('chart generation timeout');
}

export async function generateChartsBatch(datasetId: string, hints: string[]): Promise<ChartResult[]> {
  const items: GenerateItem[] = hints.map((h) => ({ dataset_id: datasetId, spec_hint: h }));
  const batch = await postJSON<any>('/api/charts/generate-batch', { dataset_id: datasetId, items });
  if (Array.isArray(batch.results)) return batch.results as ChartResult[];
  // async path: poll batches/{id}
  const batchId = (batch.batch_id as string) || '';
  if (!batchId) return [];
  const started = Date.now();
  const deadline = started + 15_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const st = await getJSON<any>(`/api/charts/batches/${batchId}`);
    if (Array.isArray(st.results)) return st.results as ChartResult[];
  }
  throw new Error('chart batch generation timeout');
}

// --- Helpers for UI-driven progress (explicit batch control) ---
export async function beginChartsBatch(datasetId: string, hints: string[]): Promise<string> {
  const items: GenerateItem[] = hints.map((h) => ({ dataset_id: datasetId, spec_hint: h }));
  const batch = await postJSON<any>('/api/charts/generate-batch', { dataset_id: datasetId, items });
  return (batch.batch_id as string) || '';
}

export async function getChartsBatchStatus(batchId: string): Promise<{ total: number; done: number; running: number; failed: number; results?: ChartResult[]; items: { job_id: string; status: string }[]; }> {
  return getJSON(`/api/charts/batches/${batchId}`);
}

// New helpers to retain chart-card mapping in batches
export type ChartGenPair = { chartId: string; hint: string };
export type ChartsBatchStatus = {
  total: number;
  done: number;
  running: number;
  failed: number;
  items: { job_id: string; status: string; chart_id?: string }[];
  results?: ChartResult[];
  results_map?: Record<string, ChartResult>;
};

export async function beginChartsBatchWithIds(datasetId: string, pairs: ChartGenPair[]): Promise<string> {
  const items = pairs.map((p) => ({ dataset_id: datasetId, spec_hint: p.hint, chart_id: p.chartId }));
  const batch = await postJSON<any>('/api/charts/generate-batch', { dataset_id: datasetId, items });
  return (batch.batch_id as string) || '';
}

export async function getChartsBatchStatusWithMap(batchId: string): Promise<ChartsBatchStatus> {
  return getJSON(`/api/charts/batches/${batchId}`);
}

// --- U: Dataset Upload ---
export type UploadResponse = { dataset_id: string };

export async function uploadDataset(file: File): Promise<UploadResponse> {
  return postFile<UploadResponse>('/api/datasets/upload', file);
}

export async function askQnA(datasetId: string, question: string): Promise<Answer[]> {
  try {
    const res = await postJSON<any>('/api/qna', { dataset_id: datasetId, question });
    // 設計準拠: { answers: Answer[], references: Reference[] }（後方互換: 配列も許容）
    return Array.isArray(res) ? (res as Answer[]) : (res?.answers ?? []);
  } catch (_) {
    return [{ text: 'モック回答', references: [{ kind: 'figure', locator: 'fig:mock' }], coverage: 0.8 }];
  }
}

export async function followup(datasetId: string, question: string): Promise<Answer[]> {
  try {
    const res = await postJSON<any>('/api/followup', { dataset_id: datasetId, question });
    return Array.isArray(res) ? (res as Answer[]) : (res?.answers ?? []);
  } catch (_) {
    return [{ text: 'フォローアップ (mock)', references: [{ kind: 'figure', locator: 'fig:mock' }], coverage: 0.85 }];
  }
}

export async function prioritizeActions(datasetId: string, next_actions: PrioritizeItem[]): Promise<PrioritizedAction[]> {
  try {
    return await postJSON<PrioritizedAction[]>('/api/actions/prioritize', { dataset_id: datasetId, next_actions });
  } catch (_) {
    return next_actions
      .map(a => {
        const metrics = computePriorityMetrics(a.impact, a.effort, a.confidence);
        return { ...a, ...metrics };
      })
      .sort((a, b) => b.score - a.score);
  }
}

export async function piiScan(datasetId: string, columns: string[]): Promise<PIIScanResult> {
  try {
    return await postJSON<PIIScanResult>('/api/pii/scan', { dataset_id: datasetId, columns });
  } catch (_) {
    const detected = columns.filter(c => ['email', 'phone', 'ssn'].includes(c));
    return { detected_fields: detected, mask_policy: 'MASK', masked_fields: detected, updated_at: new Date().toISOString() };
  }
}

export async function leakageScan(datasetId: string): Promise<LeakageScanResult> {
  try {
    return await postJSON<LeakageScanResult>('/api/leakage/scan', { dataset_id: datasetId });
  } catch (_) {
    return {
      flagged_columns: ['target_next_month'],
      rules_matched: ['time_causality'],
      excluded_columns: [],
      acknowledged_columns: [],
      updated_at: new Date().toISOString(),
    };
  }
}

export async function resolveLeakage(datasetId: string, action: 'exclude' | 'acknowledge' | 'reset', columns: string[]): Promise<LeakageScanResult> {
  try {
    return await postJSON<LeakageScanResult>('/api/leakage/resolve', { dataset_id: datasetId, action, columns });
  } catch (_) {
    const unique = Array.from(new Set(columns));
    return {
      flagged_columns: action === 'exclude' ? [] : unique,
      rules_matched: ['time_causality'],
      excluded_columns: action === 'exclude' ? unique : [],
      acknowledged_columns: action === 'acknowledge' ? unique : [],
      updated_at: new Date().toISOString(),
    };
  }
}

export async function emitRecipes(datasetId: string): Promise<RecipeEmitResult> {
  try {
    return await postJSON<RecipeEmitResult>('/api/recipes/emit', { dataset_id: datasetId });
  } catch (_) {
    return {
      artifact_hash: 'deadbeef',
      files: [
        { name: 'recipe.json', path: 'recipe.json', size_bytes: 0 },
        { name: 'eda.ipynb', path: 'eda.ipynb', size_bytes: 0 },
        { name: 'sampling.sql', path: 'sampling.sql', size_bytes: 0 },
      ],
      summary: undefined,
      measured_summary: undefined,
    };
  }
}

export async function applyPiiPolicy(datasetId: string, mask_policy: 'MASK' | 'HASH' | 'DROP', columns: string[]): Promise<PIIApplyResult> {
  try {
    return await postJSON<PIIApplyResult>('/api/pii/apply', { dataset_id: datasetId, mask_policy, columns });
  } catch (_) {
    return {
      dataset_id: datasetId,
      mask_policy,
      masked_fields: columns,
      updated_at: new Date().toISOString(),
    };
  }
}

export type LlmProvider = 'openai' | 'gemini';

export type LlmCredentialStatus = {
  provider: LlmProvider;
  configured: boolean;
  providers: Record<LlmProvider, { configured: boolean }>;
};

export async function getLlmCredentialStatus(): Promise<LlmCredentialStatus> {
  try {
    const res = await fetch(`${API_BASE ?? ''}/api/credentials/llm`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Partial<LlmCredentialStatus>;
    const provider = (body.provider as LlmProvider) ?? 'openai';
    const providers = body.providers as Record<LlmProvider, { configured: boolean }> | undefined;
    return {
      provider,
      configured: Boolean(body.configured),
      providers: providers ?? {
        openai: { configured: false },
        gemini: { configured: false },
      },
    };
  } catch (_) {
    return {
      provider: 'openai',
      configured: false,
      providers: {
        openai: { configured: false },
        gemini: { configured: false },
      },
    };
  }
}

export async function setLlmCredentials(provider: LlmProvider, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error('API key must not be empty');
  }
  const res = await fetch(`${API_BASE ?? ''}/api/credentials/llm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, api_key: trimmed }),
  });
  if (!res.ok) {
    let message = 'Failed to update API key';
    try {
      const payload: any = await res.json();
      const d = payload?.detail;
      if (typeof d === 'string') {
        message = d;
      } else if (Array.isArray(d)) {
        // FastAPI/Pydantic validation errors: array of {loc,msg,type}
        message = d.map((e: any) => e?.msg ?? JSON.stringify(e)).join('; ');
      } else if (d && typeof d === 'object') {
        message = JSON.stringify(d);
      }
    } catch (_) {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }
}

export async function setOpenAIApiKey(openaiApiKey: string): Promise<void> {
  await setLlmCredentials('openai', openaiApiKey);
}

export async function setLlmActiveProvider(provider: LlmProvider): Promise<void> {
  const res = await fetch(`${API_BASE ?? ''}/api/credentials/llm/provider`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  if (!res.ok) {
    let message = 'Failed to switch provider';
    try {
      const payload: any = await res.json();
      if (typeof payload?.detail === 'string') message = payload.detail;
    } catch (_) {}
    throw new Error(message);
  }
}
