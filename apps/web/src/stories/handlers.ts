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
