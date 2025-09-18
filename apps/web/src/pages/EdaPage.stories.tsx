import type { Meta, StoryObj } from '@storybook/react-vite';
import { EdaPage } from './EdaPage';
import { createDefaultHandlers, createFallbackHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';
import { DATASET_ID } from '../stories/data';

const meta: Meta<typeof EdaPage> = {
  title: 'Pages/EdaPage',
  component: EdaPage,
  decorators: [withAppProviders],
  parameters: {
    reactRouter: {
      routing: {
        path: '/eda/:datasetId',
        initialEntries: [`/eda/${DATASET_ID}`],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof EdaPage>;

export const Default: Story = {
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
