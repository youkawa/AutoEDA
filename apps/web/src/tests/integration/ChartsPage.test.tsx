import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ChartsPage } from '../../pages/ChartsPage';

describe('ChartsPage', () => {
  it('shows suggested charts with consistency', async () => {
    render(
      <MemoryRouter initialEntries={["/charts/ds_001"]}>
        <Routes>
          <Route path="/charts/:datasetId" element={<ChartsPage/>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/チャート提案/)).toBeTruthy();
    // 高整合性チャートのバッジ
    expect(await screen.findByText('整合性チェック済み')).toBeTruthy();
    // 根拠の表示
    expect(await screen.findByText(/根拠:/)).toBeTruthy();
  });
});
