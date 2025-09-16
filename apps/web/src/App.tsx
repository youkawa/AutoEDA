import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DatasetsPage } from './pages/DatasetsPage';
import { EdaPage } from './pages/EdaPage';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <nav style={{ width: 220, padding: 16, borderRight: '1px solid #e5e7eb' }}>
          <h3>AutoEDA</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/datasets">Datasets</Link></li>
          </ul>
        </nav>
        <main style={{ flex: 1, padding: 24 }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/eda/:datasetId" element={<EdaPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

