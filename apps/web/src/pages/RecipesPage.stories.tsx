import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { RecipesPage } from './RecipesPage';
import { createDefaultHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';
import { DATASET_ID, recipeResult, clone } from '../stories/data';

const meta: Meta<typeof RecipesPage> = {
  title: 'Pages/RecipesPage',
  component: RecipesPage,
  decorators: [withAppProviders],
  parameters: {
    reactRouter: {
      routing: {
        path: '/recipes/:datasetId',
        initialEntries: [`/recipes/${DATASET_ID}`],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof RecipesPage>;

export const WithinTolerance: Story = {
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers().filter((handler) => !(handler.info.method === 'POST' && handler.info.path === '/api/recipes/emit')),
        http.post('/api/recipes/emit', () => HttpResponse.json(clone(recipeResult))),
      ],
    },
  },
};

export const ToleranceExceeded: Story = {
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers().filter((handler) => !(handler.info.method === 'POST' && handler.info.path === '/api/recipes/emit')),
        http.post('/api/recipes/emit', () => {
          const modified = clone(recipeResult);
          modified.measured_summary = {
            rows: modified.summary?.rows ? modified.summary.rows - 50_000 : 0,
            cols: modified.summary?.cols ?? 0,
            missing_rate: (modified.summary?.missing_rate ?? 0) + 0.05,
          };
          return HttpResponse.json(modified);
        }),
      ],
    },
  },
};
