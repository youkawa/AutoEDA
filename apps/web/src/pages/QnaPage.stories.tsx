import type { Meta, StoryObj } from '@storybook/react-vite';
import { QnaPage } from './QnaPage';
import { createDefaultHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';
import { DATASET_ID } from '../stories/data';

const meta: Meta<typeof QnaPage> = {
  title: 'Pages/QnaPage',
  component: QnaPage,
  decorators: [withAppProviders],
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
    reactRouter: {
      routing: {
        path: '/qna/:datasetId',
        initialEntries: [`/qna/${DATASET_ID}`],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof QnaPage>;

export const Default: Story = {};
