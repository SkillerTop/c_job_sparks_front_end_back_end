import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/c_job_sparks_test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --dir server start',
      url: 'http://127.0.0.1:3001/health/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3001',
        DATABASE_URL: databaseUrl,
        COOKIE_SECRET: process.env.COOKIE_SECRET ?? 'e2e-cookie-secret-that-is-at-least-32-characters',
        CORS_ORIGINS: 'http://127.0.0.1:5173',
        FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
        MICROSOFT_AUTH_ENABLED: 'false',
        MAIL_ENABLED: 'false',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'pnpm dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173/login',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        VITE_APP_MODE: 'api',
        VITE_SHOP_MODE: 'api',
        VITE_API_BASE_URL: 'http://127.0.0.1:3001',
        VITE_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
      },
    },
  ],
});
