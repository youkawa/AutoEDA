import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from '../../components/navigation/Breadcrumbs';

function Mount({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Breadcrumbs />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Breadcrumbs', () => {
  it('renders for root', () => {
    render(<Mount path="/" />);
    expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
  });
  it('renders for charts with dataset id', () => {
    render(<Mount path="/charts/ds_001" />);
    expect(screen.getByText('チャート提案')).toBeInTheDocument();
    expect(screen.getByText('ds_001')).toBeInTheDocument();
  });
});

