import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RecipesPage } from '../../pages/RecipesPage';

describe('RecipesPage', () => {
  it('shows artifact hash and files', async () => {
    render(
      <MemoryRouter initialEntries={["/recipes/ds_001"]}>
        <Routes>
          <Route path="/recipes/:datasetId" element={<RecipesPage/>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/artifact_hash/)).toBeTruthy();
    expect(await screen.findByText(/recipe.json/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '引用を確認' }));
    // 参照が列挙される（doc/tbl のどちらか）
    const refs = await screen.findAllByText(/(table: tbl:summary|doc: tool:fallback)/);
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});
