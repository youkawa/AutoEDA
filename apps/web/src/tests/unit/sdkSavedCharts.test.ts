import { describe, it, expect, vi, afterEach } from 'vitest';
import { saveChart, listSavedCharts, deleteSavedChart, type SavedChart } from '@autoeda/client-sdk';

const okJson = (data: any) => Promise.resolve({ ok: true, json: async () => data } as Response as any);
const ok = () => Promise.resolve({ ok: true, json: async () => ({}) } as Response as any);
const notFound = () => Promise.resolve({ ok: false, status: 404 } as Response as any);

describe('client-sdk saved charts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('saveChart posts svg and returns SavedChart', async () => {
    const now = new Date().toISOString();
    const saved: SavedChart = { id: 'abc123', dataset_id: 'ds_001', chart_id: 'c1', title: 't', hint: 'bar', svg: '<svg/>', created_at: now };
    const spy = vi.spyOn(global, 'fetch' as any).mockImplementation((_input, init?: any) => {
      const body = JSON.parse(init?.body || '{}');
      expect(body.dataset_id).toBe('ds_001');
      expect(body.svg).toContain('<svg');
      return okJson(saved) as any;
    });
    const out = await saveChart('ds_001', { chartId: 'c1', title: 't', hint: 'bar', svg: '<svg/>' });
    expect(out).toEqual(saved);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('listSavedCharts returns [] on error', async () => {
    vi.spyOn(global, 'fetch' as any).mockImplementation(() => notFound() as any);
    const out = await listSavedCharts('ds_001');
    expect(out).toEqual([]);
  });

  it('deleteSavedChart throws on non-200', async () => {
    vi.spyOn(global, 'fetch' as any).mockImplementation(() => notFound() as any);
    await expect(deleteSavedChart('x')).rejects.toThrow(/404/);
  });
});

