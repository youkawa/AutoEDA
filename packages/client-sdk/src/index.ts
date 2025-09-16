import type { EDAReport } from '@autoeda/schemas';

export type Dataset = { id: string; name: string; rows: number; cols: number; updatedAt: string };

export async function listDatasets(): Promise<Dataset[]> {
  return [
    { id: 'ds_001', name: 'sales.csv', rows: 1_000_000, cols: 48, updatedAt: '2025-01-20T10:30:00Z' },
    { id: 'ds_002', name: 'customers.csv', rows: 50_000, cols: 15, updatedAt: '2025-01-19T14:22:00Z' },
  ];
}

export async function getEDAReport(datasetId: string): Promise<EDAReport> {
  void datasetId;
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

export type ChartCandidate = {
  id: string;
  type: 'bar' | 'line' | 'scatter';
  explanation: string;
  source_ref: { kind: 'figure'; locator: string };
  consistency_score: number;
};

export async function suggestCharts(datasetId: string, k = 5): Promise<ChartCandidate[]> {
  void datasetId; void k;
  return [
    { id: 'c1', type: 'bar', explanation: '売上の季節性を示すバーチャート', source_ref: { kind: 'figure', locator: 'fig:sales_seasonality' }, consistency_score: 0.97 },
  ];
}

