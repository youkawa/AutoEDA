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
    fireEvent.click(screen.getByRole('button', { name: '分析を実行' }));
    expect(await screen.findByRole('heading', { name: '回答' })).toBeTruthy();
    const coverage = await screen.findByText(/引用被覆率\s*\d+%/);
    expect(coverage).toBeTruthy();
    expect(await screen.findByText('引用')).toBeTruthy();
    // いずれかの参照（query/table）が表示される
    const refAny = await screen.findByText(/(query: q:|table: tbl:|figure: fig:)/);
    expect(refAny).toBeTruthy();
  });
});
