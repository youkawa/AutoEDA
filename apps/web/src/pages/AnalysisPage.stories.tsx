import type { Meta, StoryObj } from '@storybook/react';
import { AnalysisPage } from './AnalysisPage';
import { withRouter } from 'storybook-addon-react-router-v6';
import { http, HttpResponse } from 'msw';
import { createDefaultHandlers } from '../stories/handlers';

const DATASET_ID = 'ds_001';

const meta: Meta<typeof AnalysisPage> = {
  title: 'Pages/AnalysisPage',
  component: AnalysisPage,
  decorators: [withRouter],
  parameters: {
    layout: 'fullscreen',
    reactRouter: {
      routePath: '/analysis/:datasetId',
      routeParams: { datasetId: DATASET_ID },
      initialEntries: [`/analysis/${DATASET_ID}`],
    },
    msw: {
      handlers: [
        ...createDefaultHandlers().filter((h) => !(h.info.method === 'POST' && (h.info.path === '/api/analysis/deepdive' || h.info.path === '/api/exec/run'))),
        http.post('/api/analysis/deepdive', async () => {
          return HttpResponse.json({
            suggestions: [
              {
                title: '時系列の推移を検証',
                why: 'トレンド/季節性の有無を確認',
                spec: {
                  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
                  mark: 'line',
                  data: { name: 'data' },
                  encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } },
                  datasets: { data: Array.from({ length: 10 }, (_, i) => ({ x: i, y: (i % 5) + 1 })) },
                },
              },
            ],
          });
        }),
        http.post('/api/exec/run', async () => {
          const spec = {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            mark: 'line',
            data: { name: 'data' },
            encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } },
            datasets: { data: Array.from({ length: 10 }, (_, i) => ({ x: i, y: (i % 5) + 1 })) },
          };
          return HttpResponse.json({ task_id: 'adhoc', status: 'succeeded', logs: [], outputs: [{ type: 'vega', mime: 'application/json', content: spec }] });
        }),
      ],
    },
  },
};

export default meta;

type Story = StoryObj<typeof AnalysisPage>;

export const Default: Story = {};

