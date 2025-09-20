import { describe, it, expect, vi, afterEach } from 'vitest';
import { saveChart, listSavedCharts, deleteSavedChart, type SavedChart } from '@autoeda/client-sdk';

type Resp = { ok: boolean; json: () => Promise<unknown>; status?: number };
const okJson = (data: unknown): Promise<Response> => Promise.resolve(({ ok: true, json: async () => data } as Resp) as unknown as Response);
const notFound = (): Promise<Response> => Promise.resolve(({ ok: false, status: 404, json: async () => ({}) } as Resp) as unknown as Response);

describe('client-sdk saved charts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('saveChart posts svg and returns SavedChart', async () => {
    const now = new Date().toISOString();
    const saved: SavedChart = { id: 'abc123', dataset_id: 'ds_001', chart_id: 'c1', title: 't', hint: 'bar', svg: '<svg/>', created_at: now };
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) || '{}');
      expect(body.dataset_id).toBe('ds_001');
      expect(body.svg).toContain('<svg');
      return okJson(saved);
    });
    const out = await saveChart('ds_001', { chartId: 'c1', title: 't', hint: 'bar', svg: '<svg/>' });
    expect(out).toEqual(saved);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('listSavedCharts returns [] on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => notFound());
    const out = await listSavedCharts('ds_001');
    expect(out).toEqual([]);
  });

  it('deleteSavedChart throws on non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => notFound());
    await expect(deleteSavedChart('x')).rejects.toThrow(/404/);
  });
});
