import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LeakagePage } from '../../pages/LeakagePage';

describe('LeakagePage', () => {
  it('shows leakage flags', async () => {
    render(
      <MemoryRouter initialEntries={["/leakage/ds_001"]}>
        <Routes>
          <Route path="/leakage/:datasetId" element={<LeakagePage/>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/リーク検査/)).toBeTruthy();
    expect(await screen.findByText(/flagged:/)).toBeTruthy();
  });
});

