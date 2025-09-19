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

// Deterministic visuals for VR:
// 1) Reduce motion (disable animations/transitions)
(() => {
  try {
    const style = document.createElement('style');
    style.setAttribute('data-autoeda', 'reduce-motion');
    style.innerHTML = '*{animation: none !important; transition: none !important;}';
    document.head.appendChild(style);
  } catch {}
})();

// 2) Prefer system font for more consistent rendering across environments
(() => {
  try {
    const style = document.createElement('style');
    style.setAttribute('data-autoeda', 'font-stack');
    style.innerHTML = 'body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica, Arial, sans-serif;}';
    document.head.appendChild(style);
  } catch {}
})();

// 3) Freeze Date.now() for reproducible timestamps in stories
(() => {
  const FIXED_NOW = Date.UTC(2024, 0, 1, 0, 0, 0); // 2024-01-01T00:00:00Z
  try {
    const originalNow = Date.now.bind(Date);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    Date.now = () => FIXED_NOW;
    // Expose a helper to restore if needed in specific stories
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.__AUTOEDA_RESTORE_DATE_NOW__ = () => (Date.now = originalNow);
  } catch {}
})();
