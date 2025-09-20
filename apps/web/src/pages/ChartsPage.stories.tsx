import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChartsPage } from './ChartsPage';
import { createDefaultHandlers } from '../stories/handlers';
import { http, HttpResponse } from 'msw';
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
        http.post('/api/charts/suggest', () => HttpResponse.json({ charts: [] })),
      ],
    },
  },
};

export const WithResult: Story = {
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers(),
        http.post('/api/charts/generate', async () => {
          const result = {
            job_id: 'job_story',
            status: 'succeeded',
            result: {
              language: 'python',
              library: 'vega',
              code: '{"mark":"bar"}',
              outputs: [
                { type: 'image', mime: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect x="10" y="30" width="20" height="40" fill="#60a5fa"/></svg>' },
              ],
              meta: { dataset_id: DATASET_ID, hint: 'bar' },
            },
          };
          return HttpResponse.json(result);
        }),
      ],
    },
  },
};

export const SparklineLowThreshold: Story = {
  name: 'Sparkline (Low Threshold Points)',
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers(),
        http.get('/api/metrics/charts/snapshots', () => {
          const series = Array.from({ length: 24 }).map((_, i) => {
            const served = i % 3 === 0 ? 5 : 9; // 多めに <80% を発生させる
            const total = 10;
            const served_pct = Math.round((served / total) * 100);
            return {
              t: `2025-09-20T11:${String(i).padStart(2, '0')}:00Z`,
              served_pct,
              avg_wait_ms: i % 2 === 0 ? 140 : 60,
              served,
              total,
            };
          });
          return HttpResponse.json({ series });
        }),
      ],
    },
  },
};

export const SparklineThresholdEmphasis: Story = {
  name: 'Sparkline (Threshold Emphasis)',
  parameters: {
    reactRouter: {
      routing: {
        path: '/charts/:datasetId',
        initialEntries: [`/charts/${DATASET_ID}?legend=1&th=1`],
      },
    },
  },
};

export const SparklineNoLegend: Story = {
  name: 'Sparkline (No Legend)',
  parameters: {
    reactRouter: {
      routing: {
        path: '/charts/:datasetId',
        initialEntries: [`/charts/${DATASET_ID}?legend=0&th=0`],
      },
    },
  },
};
