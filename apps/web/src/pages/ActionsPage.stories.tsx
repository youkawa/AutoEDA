import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActionsPage } from './ActionsPage';
import { createDefaultHandlers, createFallbackHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';
import { DATASET_ID } from '../stories/data';

const meta: Meta<typeof ActionsPage> = {
  title: 'Pages/ActionsPage',
  component: ActionsPage,
  decorators: [withAppProviders],
  parameters: {
    reactRouter: {
      routing: {
        path: '/actions/:datasetId',
        initialEntries: [`/actions/${DATASET_ID}`],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof ActionsPage>;

export const Standard: Story = {
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
  },
};

export const Fallback: Story = {
  parameters: {
    msw: {
      handlers: createFallbackHandlers(),
    },
  },
};
