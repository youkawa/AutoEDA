import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { withAppProviders } from '../../stories/decorators';
import { createDefaultHandlers } from '../../stories/handlers';
import { DATASET_ID } from '../../stories/data';

// Pages
import { HomePage } from '../../pages/HomePage';
import { DatasetsPage } from '../../pages/DatasetsPage';
import { EdaPage } from '../../pages/EdaPage';
import { ChartsPage } from '../../pages/ChartsPage';
import { QnaPage } from '../../pages/QnaPage';
import { ActionsPage } from '../../pages/ActionsPage';
import { PiiPage } from '../../pages/PiiPage';
import { LeakagePage } from '../../pages/LeakagePage';
import { RecipesPage } from '../../pages/RecipesPage';
import { SettingsPage } from '../../pages/SettingsPage';

const ensureDataset = () => {
  try {
    window.localStorage.setItem(
      'autoeda:last-dataset',
      JSON.stringify({ id: DATASET_ID, name: 'Retail Sales v1' })
    );
  } catch {}
};

const clearDataset = () => {
  try {
    window.localStorage.removeItem('autoeda:last-dataset');
  } catch {}
};

const RouterWithLayout = ({ initialEntries = ['/'] }: { initialEntries?: string[] }) => (
  <MemoryRouter initialEntries={initialEntries}>
    <Routes>
      <Route element={<AppLayout />}> 
        <Route path="/" element={<HomePage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/eda/:datasetId" element={<EdaPage />} />
        <Route path="/charts/:datasetId" element={<ChartsPage />} />
        <Route path="/qna/:datasetId" element={<QnaPage />} />
        <Route path="/actions/:datasetId" element={<ActionsPage />} />
        <Route path="/pii/:datasetId" element={<PiiPage />} />
        <Route path="/leakage/:datasetId" element={<LeakagePage />} />
        <Route path="/recipes/:datasetId" element={<RecipesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const meta: Meta<typeof AppLayout> = {
  title: 'Layout/AppLayout',
  component: AppLayout,
  decorators: [
    (Story) => {
      ensureDataset();
      return withAppProviders(Story);
    },
  ],
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof AppLayout>;

export const WithDataset: Story = {
  render: () => <RouterWithLayout initialEntries={[`/eda/${DATASET_ID}`]} />,
  parameters: {
    reactRouter: {
      routing: {
        path: '/eda/:datasetId',
        initialEntries: [`/eda/${DATASET_ID}`],
      },
    },
  },
};

export const NoDataset: Story = {
  render: () => {
    clearDataset();
    return <RouterWithLayout initialEntries={['/']} />;
  },
  parameters: {
    reactRouter: {
      routing: {
        path: '/',
        initialEntries: ['/'],
      },
    },
  },
};

