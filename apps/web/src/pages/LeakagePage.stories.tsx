import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { LeakagePage } from './LeakagePage';
import { createDefaultHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';
import { DATASET_ID } from '../stories/data';

const meta: Meta<typeof LeakagePage> = {
  title: 'Pages/LeakagePage',
  component: LeakagePage,
  decorators: [withAppProviders],
  parameters: {
    reactRouter: {
      routing: {
        path: '/leakage/:datasetId',
        initialEntries: [`/leakage/${DATASET_ID}`],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof LeakagePage>;

export const Flagged: Story = {
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
  },
};

export const Clean: Story = {
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers().filter((handler) => !(handler.info.method === 'POST' && handler.info.path === '/api/leakage/scan')),
        http.post('/api/leakage/scan', () =>
          HttpResponse.json({
            flagged_columns: [],
            excluded_columns: [],
            acknowledged_columns: [],
            rules_matched: [],
            updated_at: new Date().toISOString(),
          }),
        ),
      ],
    },
  },
};
