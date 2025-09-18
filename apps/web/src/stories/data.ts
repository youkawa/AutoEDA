import type { Dataset } from '@autoeda/client-sdk';
import type { EDAReport, ChartCandidate, Answer, PrioritizedAction, PIIScanResult, LeakageScanResult, RecipeEmitResult } from '@autoeda/schemas';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const DATASET_ID = 'ds_mock';

export const datasets: Dataset[] = [
  { id: DATASET_ID, name: 'sales.csv', rows: 1_000_000, cols: 48, updatedAt: '2025-09-17T10:30:00Z' },
  { id: 'ds_002', name: 'customers.csv', rows: 50_000, cols: 15, updatedAt: '2025-09-12T08:12:00Z' },
];

export const edaReport: EDAReport = {
  summary: {
    rows: 1_000_000,
    cols: 48,
    missing_rate: 0.12,
    type_mix: { int: 20, float: 10, cat: 18 },
  },
  distributions: [
    {
      column: 'price',
      dtype: 'float',
      count: 1_000_000,
      missing: 320_000,
      histogram: [120, 240, 560, 800, 280],
      source_ref: { kind: 'figure', locator: 'fig:price_hist' },
    },
    {
      column: 'quantity',
      dtype: 'int',
      count: 1_000_000,
      missing: 5_000,
      histogram: [150, 400, 700, 600, 250],
      source_ref: { kind: 'figure', locator: 'fig:quantity_hist' },
    },
  ],
  key_features: [
    'promotion_rate と売上の相関が高い (r=0.42)',
    'holiday_flag が平均注文数を 18% 押し上げ',
  ],
  outliers: [
    { column: 'sales', indices: [12, 45, 156, 789], evidence: { kind: 'table', locator: 'tbl:sales_outliers' } },
  ],
  data_quality_report: {
    issues: [
      {
        severity: 'high',
        column: 'price',
        description: '欠損率が 32% と高いため補完が必要',
        statistic: { missing_ratio: 0.32 },
        evidence: { kind: 'table', locator: 'tbl:price_missing' },
      },
      {
        severity: 'critical',
        column: 'date',
        description: '将来日付が 45 件含まれている',
        statistic: { future_dates: 45 },
        evidence: { kind: 'table', locator: 'tbl:date_future' },
      },
    ],
  },
  next_actions: [
    {
      title: 'price 列の欠損補完',
      reason: '高欠損列の補完でモデル安定性が向上',
      impact: 0.9,
      effort: 0.3,
      confidence: 0.85,
      score: 2.7,
      wsjf: 2.7,
      rice: 24.3,
      dependencies: ['impute_price_mean'],
    },
    {
      title: 'date 列の異常値処理',
      reason: '未来日付がリークリスクを誘発',
      impact: 0.85,
      effort: 0.4,
      confidence: 0.8,
      score: 2.1,
      wsjf: 2.1,
      rice: 18.9,
      dependencies: ['validate_date_source'],
    },
  ],
  references: [
    { kind: 'doc', locator: 'policy:pii' },
    { kind: 'table', locator: 'tbl:summary' },
  ],
};

export const fallbackReferences: EDAReport['references'] = [
  { kind: 'doc', locator: 'tool:fallback' },
];

export const chartCandidates: ChartCandidate[] = [
  {
    id: 'chart-1',
    type: 'bar',
    explanation: '月次売上と前年同期比を比較',
    source_ref: { kind: 'figure', locator: 'fig:monthly_sales' },
    consistency_score: 0.97,
    diagnostics: { trend: 'increasing', dominant_ratio: 0.62 },
  },
  {
    id: 'chart-2',
    type: 'line',
    explanation: 'holiday_flag 別の平均注文数',
    source_ref: { kind: 'figure', locator: 'fig:holiday' },
    consistency_score: 0.88,
    diagnostics: { trend: 'flat' },
  },
];

export const qnaAnswer: Answer = {
  text: '<strong>売上に効いている上位要因</strong>:\n1. promotion_rate (寄与 0.42)\n2. holiday_flag (寄与 0.31)\n3. seasonal_index (寄与 0.28)',
  references: [
    { kind: 'query', locator: 'q:correlation_analysis' },
    { kind: 'table', locator: 'tbl:promotion_metrics' },
  ],
  coverage: 0.86,
};

export const prioritizedActions: PrioritizedAction[] = edaReport.next_actions.map((action) => ({
  ...action,
}));

export const piiResult: PIIScanResult = {
  detected_fields: ['email', 'phone'],
  mask_policy: 'MASK',
  masked_fields: ['email'],
  updated_at: '2025-09-17T09:00:00Z',
};

export const leakageResult: LeakageScanResult = {
  flagged_columns: ['target_next_month', 'rolling_mean_7d'],
  rules_matched: ['time_causality', 'aggregation_trace'],
  excluded_columns: ['target_next_month'],
  acknowledged_columns: [],
  updated_at: '2025-09-17T11:20:00Z',
};

export const recipeResult: RecipeEmitResult = {
  artifact_hash: 'deadbeefcafebabe',
  files: [
    { name: 'recipe.json', path: '/recipes/recipe.json', size_bytes: 1_024 },
    { name: 'eda.ipynb', path: '/recipes/eda.ipynb', size_bytes: 4_096 },
    { name: 'sampling.sql', path: '/recipes/sampling.sql', size_bytes: 512 },
  ],
  summary: edaReport.summary,
  measured_summary: {
    rows: 998_000,
    cols: 48,
    missing_rate: 0.125,
  },
};

export const credentialsStatus = {
  provider: 'openai' as LlmProvider,
  configured: true,
  providers: {
    openai: { configured: true },
    gemini: { configured: false },
  },
};

export type LlmProvider = 'openai' | 'gemini';

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function merge<T>(value: T, overrides: DeepPartial<T>): T {
  return Object.assign({}, value, overrides);
}
