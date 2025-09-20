import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

// モジュール全体をモック（list/delete の挙動を差し替え）
vi.mock('@autoeda/client-sdk', () => {
  return {
    listSavedCharts: async () => [
      { id: 'a1', dataset_id: 'ds_001', chart_id: 'c1', title: '棒グラフ', hint: 'bar', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', created_at: new Date('2025-01-01T00:00:00Z').toISOString() },
      { id: 'a2', dataset_id: 'ds_001', chart_id: 'c2', title: '散布図', hint: 'scatter', vega: { mark: 'point', data: { values: [{ x: 1, y: 2 }] } }, created_at: new Date('2025-01-02T00:00:00Z').toISOString() },
    ],
    deleteSavedChart: async () => {},
    generateChartWithProgress: async () => ({ outputs: [{ mime: 'image/svg+xml', content: '<svg/>' }] }),
  };
});

// VegaView は vega-embed 依存があるため、テストでは単純なプレースホルダにモック
vi.mock('../../components/vis/VegaView', () => ({
  VegaView: (props: { spec: unknown; className?: string }) => (
    <div data-testid="vega-view">{JSON.stringify(props.spec).slice(0, 20)}</div>
  ),
}));

import { SavedChartsPage } from '../../pages/SavedChartsPage';

describe('SavedChartsPage', () => {
  it('renders saved items and allows delete', async () => {
    render(
      <MemoryRouter initialEntries={["/charts/saved/ds_001"]}>
        <Routes>
          <Route path="/charts/saved/:datasetId" element={<SavedChartsPage />} />
        </Routes>
      </MemoryRouter>
    );
    // 見出し
    expect(await screen.findByText('保存済みチャート')).toBeTruthy();
    // 2件表示される
    expect(await screen.findByText('棒グラフ')).toBeTruthy();
    expect(await screen.findByText('散布図')).toBeTruthy();
    // 削除ボタンが存在
    const del = await screen.findAllByRole('button', { name: '削除' });
    expect(del.length).toBeGreaterThanOrEqual(1);
  });
});
