import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiMode = env.VITE_APP_MODE === 'api';
  const apiShopMode = apiMode || env.VITE_SHOP_MODE === 'api';
  const configuredPublicOrigin = env.VITE_PUBLIC_ORIGIN?.trim();
  if (mode === 'production' && !configuredPublicOrigin) {
    throw new Error('VITE_PUBLIC_ORIGIN is required for a production build.');
  }
  const publicOrigin = (configuredPublicOrigin || 'http://localhost:5173').replace(/\/$/, '');
  try {
    new URL(publicOrigin);
  } catch {
    throw new Error('VITE_PUBLIC_ORIGIN must be an absolute URL.');
  }
  const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      {
        name: 'public-origin-html',
        transformIndexHtml: (html: string) => html.replaceAll('__PUBLIC_ORIGIN__', publicOrigin),
      },
    ],
    resolve: {
      alias: [
        ...(apiMode ? [
          { find: /^@\/services\/authService$/, replacement: source('./src/services/runtime/authService.api.ts') },
          { find: /^@\/services\/sparkService$/, replacement: source('./src/services/runtime/sparkService.api.ts') },
        ] : []),
        ...(apiShopMode ? [
          { find: /^@\/services\/shopService$/, replacement: source('./src/services/runtime/shopService.api.ts') },
        ] : []),
        { find: '@', replacement: source('./src') },
      ],
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/recharts/') || id.includes('\\recharts\\') || id.includes('/victory-vendor/'))
              return 'performance-charts';
            return undefined;
          },
        },
      },
    },
  };
});
