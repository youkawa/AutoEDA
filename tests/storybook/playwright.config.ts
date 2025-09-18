import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

export default defineConfig({
  testDir: __dirname,
  fullyParallel: false,
  reporter: [['html', { outputFolder: 'test-results/storybook' }]],
  use: {
    baseURL: 'http://127.0.0.1:6007',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx http-server ${resolve(__dirname, '../../apps/web/storybook-static')} -p 6007 -c-1 -s`,
    url: 'http://127.0.0.1:6007/iframe.html',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
