import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { PiiPage } from '../../pages/PiiPage';

describe('PiiPage', () => {
  it('allows applying mask policy', async () => {
    render(
      <MemoryRouter initialEntries={["/pii/ds_001"]}>
        <Routes>
          <Route path="/pii/:datasetId" element={<PiiPage/>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/PII スキャン/)).toBeTruthy();
    const checkbox = (await screen.findByRole('checkbox', { name: /email/ })) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    // マスクポリシーはカードボタンで選択（デフォルト: マスク）
    expect(await screen.findByText('マスク')).toBeTruthy();
    const button = (await screen.findByRole('button', { name: /マスクを適用して再計算/ })) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
