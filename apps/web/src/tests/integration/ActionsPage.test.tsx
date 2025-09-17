import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
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
    const scores = await screen.findAllByText(/score:/);
    expect(scores.length).toBeGreaterThanOrEqual(1);
  });
});
