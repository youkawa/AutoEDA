import { http, HttpResponse } from 'msw';
import type { PrioritizeItem, PrioritizedAction } from '@autoeda/schemas';

function priorityMetrics(impact: number, effort: number, confidence: number, urgency = impact) {
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

export const handlers = [
  http.post('/api/eda', async () => {
    return HttpResponse.json({
      summary: { rows: 100, cols: 5, missing_rate: 0.1, type_mix: { int: 2, float: 1, cat: 2 } },
      distributions: [
        { column: 'x', dtype: 'int', count: 100, missing: 0, histogram: [1, 2, 3], source_ref: { kind: 'figure', locator: 'fig:x' } },
      ],
      key_features: ['MSW: 特徴A'],
      outliers: [],
      data_quality_report: {
        issues: [
          { severity: 'high', column: 'price', description: '欠損が多い（32%）', statistic: { missing_ratio: 0.32 }, evidence: { kind: 'table', locator: 'tbl:price_quality' } },
        ],
      },
      next_actions: [
        {
          title: '欠損補完',
          reason: '高い欠損率',
          impact: 0.9,
          effort: 0.3,
          confidence: 0.8,
          ...priorityMetrics(0.9, 0.3, 0.8, 0.95),
        },
      ],
      references: [{ kind: 'table', locator: 'tbl:summary' }],
    });
  }),
  http.post('/api/charts/suggest', async () => {
    return HttpResponse.json([
      { id: 'c1', type: 'bar', explanation: 'MSW: 提案例', source_ref: { kind: 'figure', locator: 'fig:msw' }, consistency_score: 0.96 },
    ]);
  }),
  http.post('/api/qna', async () => {
    return HttpResponse.json([
      { text: 'MSW: 回答', references: [{ kind: 'figure', locator: 'fig:msw' }], coverage: 0.9 },
    ]);
  }),
  http.post('/api/actions/prioritize', async ({ request }) => {
    const body = (await request.json()) as { next_actions: PrioritizeItem[] };
    const items: PrioritizeItem[] = body?.next_actions ?? [];
    const ranked: PrioritizedAction[] = items
      .map((a) => {
        const impact = Math.min(1, Math.max(0, a.impact));
        const effort = Math.min(1, Math.max(0.01, a.effort));
        const confidence = Math.min(1, Math.max(0, a.confidence));
        return { ...a, ...priorityMetrics(impact, effort, confidence) };
      })
      .sort((a, b) => b.score - a.score);
    return HttpResponse.json(ranked);
  }),
  http.post('/api/pii/scan', async () => {
    return HttpResponse.json({ detected_fields: ['email', 'phone'], mask_policy: 'MASK', masked_fields: ['email'], updated_at: new Date().toISOString() });
  }),
  http.post('/api/pii/apply', async ({ request }) => {
    const body = await request.json() as { dataset_id: string; mask_policy: 'MASK' | 'HASH' | 'DROP'; columns: string[] };
    return HttpResponse.json({
      dataset_id: body.dataset_id,
      mask_policy: body.mask_policy,
      masked_fields: body.columns,
      updated_at: new Date().toISOString(),
    });
  }),
  http.post('/api/leakage/scan', async () => {
    return HttpResponse.json({
      flagged_columns: ['target_next_month', 'rolling_mean_7d'],
      rules_matched: ['time_causality'],
      excluded_columns: ['leak_feature'],
      acknowledged_columns: [],
      updated_at: new Date().toISOString(),
    });
  }),
  http.post('/api/leakage/resolve', async ({ request }) => {
    const body = await request.json() as { dataset_id: string; action: 'exclude' | 'acknowledge' | 'reset'; columns: string[] };
    const remaining = body.action === 'exclude' ? ['rolling_mean_7d'] : ['target_next_month'];
    return HttpResponse.json({
      flagged_columns: remaining,
      rules_matched: ['time_causality'],
      excluded_columns: body.action === 'exclude' ? body.columns : [],
      acknowledged_columns: body.action === 'acknowledge' ? body.columns : [],
      updated_at: new Date().toISOString(),
    });
  }),
  http.post('/api/recipes/emit', async () => {
    return HttpResponse.json({
      artifact_hash: 'cafebabe',
      files: [
        { name: 'recipe.json', path: '/recipes/recipe.json', size_bytes: 2048 },
        { name: 'eda.ipynb', path: '/recipes/eda.ipynb', size_bytes: 4096 },
        { name: 'sampling.sql', path: '/recipes/sampling.sql', size_bytes: 512 },
      ],
      summary: { rows: 100, cols: 5, missing_rate: 0.1, type_mix: { int: 3 } },
      measured_summary: { rows: 100, cols: 5, missing_rate: 0.1 },
    });
  }),
];
