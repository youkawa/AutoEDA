import React from 'react';
import type { Decorator } from '@storybook/react';
import { LastDatasetProvider } from '../contexts/LastDatasetContext';

export const withAppProviders: Decorator = (Story) => (
  <LastDatasetProvider>
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <Story />
    </div>
  </LastDatasetProvider>
);
