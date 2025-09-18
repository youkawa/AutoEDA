import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { PiiPage } from './PiiPage';
import { createDefaultHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';
import { DATASET_ID } from '../stories/data';

const meta: Meta<typeof PiiPage> = {
  title: 'Pages/PiiPage',
  component: PiiPage,
  decorators: [withAppProviders],
  parameters: {
    reactRouter: {
      routing: {
        path: '/pii/:datasetId',
        initialEntries: [`/pii/${DATASET_ID}`],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof PiiPage>;

export const Detected: Story = {
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
  },
};

export const None: Story = {
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers().filter((handler) => !(handler.info.method === 'POST' && handler.info.path === '/api/pii/scan')),
        http.post('/api/pii/scan', () =>
          HttpResponse.json({
            detected_fields: [],
            mask_policy: 'MASK',
            masked_fields: [],
            updated_at: new Date().toISOString(),
          }),
        ),
      ],
    },
  },
};
