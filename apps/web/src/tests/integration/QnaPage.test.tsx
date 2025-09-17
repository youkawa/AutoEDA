import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QnaPage } from '../../pages/QnaPage';

describe('QnaPage', () => {
  it('asks a question and shows coverage', async () => {
    render(
      <MemoryRouter initialEntries={["/qna/ds_001"]}>
        <Routes>
          <Route path="/qna/:datasetId" element={<QnaPage/>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: '質問する' }));
    expect(await screen.findByRole('heading', { name: '回答' })).toBeTruthy();
    const coverageNodes = await screen.findAllByText(/引用被覆率/);
    expect(coverageNodes.length).toBeGreaterThanOrEqual(1);
    const text = coverageNodes[0].textContent || '';
    const match = text.match(/引用被覆率:\s*(\d+)%/);
    expect(match).toBeTruthy();
    const pct = Number(match?.[1] || '0');
    expect(pct).toBeGreaterThanOrEqual(80);
  });
});
