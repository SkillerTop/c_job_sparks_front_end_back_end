import { fileURLToPath } from 'node:url';
import react from 'file:///C:/Users/A.Hryshyn/Documents/Codex/2026-08-28/new-chat/outputs/c-job-sparks-contrast-fix/node_modules/@vitejs/plugin-react/dist/index.js';
import { defineConfig } from 'file:///C:/Users/A.Hryshyn/Documents/Codex/2026-08-28/new-chat/outputs/c-job-sparks-contrast-fix/node_modules/vite/dist/node/index.js';
import { sites } from 'file:///C:/Users/A.Hryshyn/Documents/Codex/2026-08-28/new-chat/outputs/c-job-sparks-contrast-fix/node_modules/@openai/sites-vite-plugin/dist/index.js';
import transformReactJsx from 'file:///C:/Users/A.Hryshyn/Documents/Codex/2026-08-28/new-chat/outputs/c-job-sparks-contrast-fix/node_modules/@babel/plugin-transform-react-jsx/lib/index.js';
import transformTypeScript from 'file:///C:/Users/A.Hryshyn/Documents/Codex/2026-08-28/new-chat/outputs/c-job-sparks-contrast-fix/node_modules/@babel/plugin-transform-typescript/lib/index.js';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  esbuild: false,
  plugins: [
    {
      name: 'verify:restricted-build-transform',
      enforce: 'pre',
      transform(code) {
        if (!code.includes('process.env.NODE_ENV')) return null;
        return {
          code: code.replace(/(?:globalThis\.|global\.)?process\.env\.NODE_ENV/g, JSON.stringify('production')),
          map: null,
        };
      },
    },
    react({
      babel: {
        plugins: [
          [transformTypeScript, { allExtensions: true, isTSX: true }],
          [transformReactJsx, { runtime: 'automatic' }],
        ],
      },
    }),
    sites(),
    {
      name: 'verify:restricted-build-config',
      enforce: 'post',
      config: () => ({ esbuild: false }),
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  build: { outDir: 'dist', minify: false },
});
