import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DatasetsPage } from './pages/DatasetsPage';
import { EdaPage } from './pages/EdaPage';
import { ChartsPage } from './pages/ChartsPage';
import { QnaPage } from './pages/QnaPage';
import { ActionsPage } from './pages/ActionsPage';
import { PiiPage } from './pages/PiiPage';
import { LeakagePage } from './pages/LeakagePage';
import { RecipesPage } from './pages/RecipesPage';

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
            <Route path="/charts/:datasetId" element={<ChartsPage />} />
            <Route path="/qna/:datasetId" element={<QnaPage />} />
            <Route path="/actions/:datasetId" element={<ActionsPage />} />
            <Route path="/pii/:datasetId" element={<PiiPage />} />
            <Route path="/leakage/:datasetId" element={<LeakagePage />} />
            <Route path="/recipes/:datasetId" element={<RecipesPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
