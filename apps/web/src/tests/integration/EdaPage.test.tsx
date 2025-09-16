import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('読み込み中...')).toBeTruthy();
    const text = await screen.findByText(/欠損が多い/);
    expect(text).toBeTruthy();
  });
});

