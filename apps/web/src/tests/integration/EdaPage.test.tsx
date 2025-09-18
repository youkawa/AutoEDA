import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EdaPage } from '../../pages/EdaPage';

describe('EdaPage', () => {
  it('renders loading then content', async () => {
    render(
      <MemoryRouter initialEntries={["/eda/ds_001"]}>
        <Routes>
          <Route path="/eda/:datasetId" element={<EdaPage/>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByLabelText('loading')).toBeTruthy();
    // コンテンツ表示後の主要セクション
    expect(await screen.findByText('データ品質トリアージ')).toBeTruthy();
    // 引用ビューに切り替え、参照ソースの一部（テーブル要約）を確認
    fireEvent.click(screen.getByRole('button', { name: '引用ビュー' }));
    expect(await screen.findByText(/tbl:summary/)).toBeTruthy();
  });
});
