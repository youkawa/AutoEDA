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
    expect(await screen.findByText('LLMフォールバック: ツール要約のみ表示中')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '引用ビュー' }));
    expect(await screen.findByText('参照一覧')).toBeTruthy();
  });
});
