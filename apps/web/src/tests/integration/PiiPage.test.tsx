import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PiiPage } from '../../pages/PiiPage';

describe('PiiPage', () => {
  it('shows PII scan result', async () => {
    render(
      <MemoryRouter initialEntries={["/pii/ds_001"]}>
        <Routes>
          <Route path="/pii/:datasetId" element={<PiiPage/>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/PII スキャン/)).toBeTruthy();
    expect(await screen.findByText(/検出:/)).toBeTruthy();
  });
});

