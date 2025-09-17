import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ActionsPage } from '../../pages/ActionsPage';

describe('ActionsPage', () => {
  it('shows prioritized actions', async () => {
    render(
      <MemoryRouter initialEntries={["/actions/ds_001"]}>
        <Routes>
          <Route path="/actions/:datasetId" element={<ActionsPage/>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/Next Actions/)).toBeTruthy();
    expect(await screen.findByText('LLMフォールバック: ツール要約のみ表示中')).toBeTruthy();
    const metrics = await screen.findAllByText(/WSJF/);
    expect(metrics.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: '引用ビュー' }));
    expect(await screen.findByText('参照一覧')).toBeTruthy();
    expect(await screen.findByText(/tool:fallback/)).toBeTruthy();
  });
});
