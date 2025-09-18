import type { Meta, StoryObj } from '@storybook/react-vite';
import { DatasetsPage } from './DatasetsPage';
import { createDefaultHandlers, createEmptyDatasetsHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';

const meta: Meta<typeof DatasetsPage> = {
  title: 'Pages/DatasetsPage',
  component: DatasetsPage,
  decorators: [withAppProviders],
  parameters: {
    reactRouter: {
      routing: {
        path: '/datasets',
        initialEntries: ['/datasets'],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof DatasetsPage>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: createEmptyDatasetsHandlers(),
    },
  },
};
