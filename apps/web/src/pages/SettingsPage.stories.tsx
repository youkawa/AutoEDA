import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { SettingsPage } from './SettingsPage';
import { createDefaultHandlers } from '../stories/handlers';
import { withAppProviders } from '../stories/decorators';

const meta: Meta<typeof SettingsPage> = {
  title: 'Pages/SettingsPage',
  component: SettingsPage,
  decorators: [withAppProviders],
  parameters: {
    reactRouter: {
      routing: {
        path: '/settings',
        initialEntries: ['/settings'],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof SettingsPage>;

export const OpenAIConfigured: Story = {
  parameters: {
    msw: {
      handlers: createDefaultHandlers(),
    },
  },
};

export const GeminiConfigured: Story = {
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers().filter((handler) => !(handler.info.method === 'GET' && handler.info.path === '/api/credentials/llm')),
        http.get('/api/credentials/llm', () =>
          HttpResponse.json({
              provider: 'gemini',
              configured: true,
              providers: {
                openai: { configured: false },
                gemini: { configured: true },
              },
            },
          ),
        ),
      ],
    },
  },
};

export const Unconfigured: Story = {
  parameters: {
    msw: {
      handlers: [
        ...createDefaultHandlers().filter((handler) => !(handler.info.method === 'GET' && handler.info.path === '/api/credentials/llm')),
        http.get('/api/credentials/llm', () =>
          HttpResponse.json({
              provider: 'openai',
              configured: false,
              providers: {
                openai: { configured: false },
                gemini: { configured: false },
              },
            },
          ),
        ),
      ],
    },
  },
};
