import { http, HttpResponse } from 'msw';
import {
  DATASET_ID,
  datasets,
  edaReport,
  fallbackReferences,
  chartCandidates,
  qnaAnswer,
  prioritizedActions,
  piiResult,
  leakageResult,
  recipeResult,
  credentialsStatus,
  clone,
} from './data';

export function createDefaultHandlers() {
  return [
    http.get('/api/datasets', () => HttpResponse.json(clone(datasets))),
    http.post('/api/eda', () => HttpResponse.json(clone(edaReport))),
    http.post('/api/charts/suggest', () => HttpResponse.json({ charts: clone(chartCandidates) })),
    http.post('/api/qna', () => HttpResponse.json({ answers: [clone(qnaAnswer)], references: qnaAnswer.references })),
    http.post('/api/actions/prioritize', () => HttpResponse.json(clone(prioritizedActions))),
    http.post('/api/pii/scan', () => HttpResponse.json(clone(piiResult))),
    http.post('/api/pii/apply', async ({ request }) => {
      const body = (await request.json()) as { mask_policy?: string; columns?: string[] } | null;
      return HttpResponse.json({
        dataset_id: DATASET_ID,
        mask_policy: body?.mask_policy ?? 'MASK',
        masked_fields: body?.columns ?? [],
        updated_at: new Date().toISOString(),
      });
    }),
    http.post('/api/leakage/scan', () => HttpResponse.json(clone(leakageResult))),
    http.post('/api/leakage/resolve', async ({ request }) => {
      const body = (await request.json()) as { action?: 'exclude' | 'acknowledge' | 'reset'; columns?: string[] } | null;
      const action = body?.action ?? 'exclude';
      return HttpResponse.json({
        ...clone(leakageResult),
        flagged_columns: action === 'exclude' ? [] : clone(leakageResult.flagged_columns),
        excluded_columns: action === 'exclude' ? body?.columns ?? [] : leakageResult.excluded_columns,
      });
    }),
    http.post('/api/recipes/emit', () => HttpResponse.json(clone(recipeResult))),
    // H2: charts sparkline snapshots (24 points; include <80% to show red outline)
    http.get('/api/metrics/charts/snapshots', () => {
      const series = Array.from({ length: 24 }).map((_, i) => {
        const served = i % 5 === 0 ? 6 : 9; // force some low served
        const total = 10;
        const served_pct = Math.round((served / total) * 100);
        return {
          t: `2025-09-20T10:${String(i).padStart(2, '0')}:00Z`,
          served_pct,
          avg_wait_ms: i % 3 === 0 ? 120 : 60,
          served,
          total,
        };
      });
      return HttpResponse.json({ series });
    }),
    http.get('/api/credentials/llm', () => HttpResponse.json(clone(credentialsStatus))),
    http.post('/api/credentials/llm', () => new HttpResponse(null, { status: 204 })),
  ];
}

export function createFallbackHandlers() {
  return [
    http.get('/api/datasets', () => HttpResponse.json(clone(datasets))),
    http.post('/api/eda', () => HttpResponse.json({
      ...clone(edaReport),
      references: fallbackReferences,
    })),
    ...createDefaultHandlers().filter((handler) => handler.info.path !== '/api/datasets' && handler.info.path !== '/api/eda'),
  ];
}

export function createEmptyDatasetsHandlers() {
  return [
    http.get('/api/datasets', () => HttpResponse.json([])),
    ...createDefaultHandlers().filter((handler) => handler.info.path !== '/api/datasets'),
  ];
}
