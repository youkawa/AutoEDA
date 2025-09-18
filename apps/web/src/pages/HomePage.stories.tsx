import type { Meta, StoryObj } from '@storybook/react-vite';
import { HomePage } from './HomePage';
import { createDefaultHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';

const meta: Meta<typeof HomePage> = {
  title: 'Pages/HomePage',
  component: HomePage,
  decorators: [withAppProviders],
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
    reactRouter: {
      routing: {
        path: '/',
        initialEntries: ['/'],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof HomePage>;

export const Default: Story = {};
