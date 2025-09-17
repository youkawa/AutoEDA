import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LeakagePage } from '../../pages/LeakagePage';

describe('LeakagePage', () => {
  it('allows excluding flagged leakage columns', async () => {
    render(
      <MemoryRouter initialEntries={["/leakage/ds_001"]}>
        <Routes>
          <Route path="/leakage/:datasetId" element={<LeakagePage/>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/リーク検査/)).toBeTruthy();
    const checkbox = (await screen.findByRole('checkbox', { name: /target_next_month/ })) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    const excludeButton = (await screen.findByRole('button', { name: /除外して再計算/ })) as HTMLButtonElement;
    expect(excludeButton.disabled).toBe(false);
  });
});
