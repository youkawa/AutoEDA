import type {
  EDAReport,
  ChartCandidate,
  Answer,
  PrioritizeItem,
  PrioritizedAction,
  PIIScanResult,
  LeakageScanResult,
} from '@autoeda/schemas';

export type Dataset = { id: string; name: string; rows: number; cols: number; updatedAt: string };

export async function listDatasets(): Promise<Dataset[]> {
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

// Mock fallback used when fetch fails (dev/test without API)
function fallbackEDA(): EDAReport {
  return {
    summary: { rows: 1_000_000, cols: 48, missingRate: 0.12, typeMix: { int: 20, float: 10, cat: 18 } },
    issues: [
      { severity: 'high', column: 'price', description: '欠損が多い（32%）', statistic: { missing: 0.32 } },
      { severity: 'critical', column: 'date', description: '将来日付が含まれている', statistic: { future_dates: 45 } },
      { severity: 'medium', column: 'category', description: '不明な値が存在', statistic: { unknown_values: 156 } },
    ],
    distributions: [
      { column: 'price', dtype: 'float', count: 1_000_000, missing: 320_000, histogram: [100, 200, 500, 800, 300] },
      { column: 'quantity', dtype: 'int', count: 1_000_000, missing: 5000, histogram: [150, 400, 700, 600, 250] },
    ],
    keyFeatures: [
      'price × promotion_rate が強い関係（r=0.85）',
      'seasonal_index が売上に大きく影響',
      'customer_segment別の購買パターンが明確',
    ],
    outliers: [
      { column: 'sales', indices: [12, 45, 156, 789] },
      { column: 'discount', indices: [23, 67, 234] },
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
      { id: 'c1', type: 'bar', explanation: '売上の季節性を示すバーチャート', source_ref: { kind: 'figure', locator: 'fig:sales_seasonality' }, consistency_score: 0.97 },
    ];
  }
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

export async function prioritizeActions(datasetId: string, next_actions: PrioritizeItem[]): Promise<PrioritizedAction[]> {
  try {
    return await postJSON<PrioritizedAction[]>('/api/actions/prioritize', { dataset_id: datasetId, next_actions });
  } catch (_) {
    return next_actions.map(a => ({ ...a, score: (a.impact / Math.max(1, a.effort)) * a.confidence })).sort((a, b) => b.score - a.score);
  }
}

export async function piiScan(datasetId: string, columns: string[]): Promise<PIIScanResult> {
  try {
    return await postJSON<PIIScanResult>('/api/pii/scan', { dataset_id: datasetId, columns });
  } catch (_) {
    const detected = columns.filter(c => ['email', 'phone', 'ssn'].includes(c));
    return { detected_fields: detected, mask_policy: 'MASK' };
  }
}

export async function leakageScan(datasetId: string): Promise<LeakageScanResult> {
  try {
    return await postJSON<LeakageScanResult>('/api/leakage/scan', { dataset_id: datasetId });
  } catch (_) {
    return { flagged_columns: ['target_next_month'], rules_matched: ['time_causality'] };
  }
}

export type { RecipeEmitResult } from '@autoeda/schemas';
export async function emitRecipes(datasetId: string): Promise<{ artifact_hash: string; files: string[] }> {
  try {
    return await postJSON<{ artifact_hash: string; files: string[] }>('/api/recipes/emit', { dataset_id: datasetId });
  } catch (_) {
    return { artifact_hash: 'deadbeef', files: ['recipe.json', 'eda.ipynb', 'sampling.sql'] };
  }
}
