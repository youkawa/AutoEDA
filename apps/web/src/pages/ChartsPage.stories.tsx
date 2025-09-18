import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChartsPage } from './ChartsPage';
import { createDefaultHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';
import { DATASET_ID } from '../stories/data';

const meta: Meta<typeof ChartsPage> = {
  title: 'Pages/ChartsPage',
  component: ChartsPage,
  decorators: [withAppProviders],
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
    reactRouter: {
      routing: {
        path: '/charts/:datasetId',
        initialEntries: [`/charts/${DATASET_ID}`],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof ChartsPage>;

export const ConsistentOnly: Story = {};

export const EmptyResults: Story = {
  name: 'Empty',
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers().filter((h) => !(h.info.method === 'POST' && h.info.path === '/api/charts/suggest')),
        // 空のチャート候補を返す
        {
          info: { path: '/api/charts/suggest', method: 'POST', type: 'rest' },
          resolver: () => new Response(JSON.stringify({ charts: [] }), { headers: { 'Content-Type': 'application/json' } }),
        } as any,
      ],
    },
  },
};
