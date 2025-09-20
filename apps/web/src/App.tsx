import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { SavedChartsPage } from './pages/SavedChartsPage';
import { DatasetsPage } from './pages/DatasetsPage';
import { EdaPage } from './pages/EdaPage';
import { ChartsPage } from './pages/ChartsPage';
import { QnaPage } from './pages/QnaPage';
import { ActionsPage } from './pages/ActionsPage';
import { PiiPage } from './pages/PiiPage';
import { LeakagePage } from './pages/LeakagePage';
import { RecipesPage } from './pages/RecipesPage';
import { SettingsPage } from './pages/SettingsPage';
import { PlanPage } from './pages/PlanPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { AppLayout } from './components/layout/AppLayout';
import { LastDatasetProvider } from './contexts/LastDatasetContext';
import { ToastProvider } from '@autoeda/ui-kit';

export default function App() {
  return (
    <BrowserRouter>
      <LastDatasetProvider>
        <ToastProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/datasets" element={<DatasetsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/eda/:datasetId" element={<EdaPage />} />
              <Route path="/charts/:datasetId" element={<ChartsPage />} />
              <Route path="/charts/saved/:datasetId" element={<SavedChartsPage />} />
              <Route path="/qna/:datasetId" element={<QnaPage />} />
              <Route path="/plan/:datasetId" element={<PlanPage />} />
              <Route path="/analysis/:datasetId" element={<AnalysisPage />} />
              <Route path="/actions/:datasetId" element={<ActionsPage />} />
              <Route path="/pii/:datasetId" element={<PiiPage />} />
              <Route path="/leakage/:datasetId" element={<LeakagePage />} />
              <Route path="/recipes/:datasetId" element={<RecipesPage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </LastDatasetProvider>
    </BrowserRouter>
  );
}
