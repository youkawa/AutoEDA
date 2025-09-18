import type { Preview } from '@storybook/react-vite';
import { initialize, mswDecorator } from 'msw-storybook-addon';
import { withRouter } from 'storybook-addon-react-router-v6';
import '../src/index.css';

initialize({ onUnhandledRequest: 'bypass' });

const preview: Preview = {
  decorators: [withRouter, mswDecorator],
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    msw: {
      handlers: [],
    },
    reactRouter: {
      routing: {
        path: '/',
      },
    },
  },
};

export default preview;
