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
    expect(await screen.findByText(/Charts 候補/)).toBeTruthy();
    const item = await screen.findByText(/consistency:/);
    const text = item.textContent || '';
    const match = text.match(/consistency:\s*(\d+)%/);
    expect(match).toBeTruthy();
    const pct = Number(match?.[1] || '0');
    expect(pct).toBeGreaterThanOrEqual(95);
  });
});
