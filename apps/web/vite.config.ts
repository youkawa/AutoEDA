import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@autoeda/ui-kit': path.resolve(__dirname, '../../packages/ui-kit/src/index.tsx'),
      '@autoeda/schemas': path.resolve(__dirname, '../../packages/schemas/src/index.ts'),
      '@autoeda/client-sdk': path.resolve(__dirname, '../../packages/client-sdk/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react', '@autoeda/schemas', '@autoeda/client-sdk', '@autoeda/ui-kit'],
  },
});
