import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { buildApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';

const environment = parseEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  COOKIE_SECRET: 'test-cookie-secret-that-is-long-enough',
  CORS_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
});

const fakePool = {
  async query() {
    return { rows: [], rowCount: 0 };
  },
} as unknown as Pool;

test('the complete route graph registers and protected routes fail closed', async () => {
  const app = await buildApp({ environment, pool: fakePool });
  try {
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    assert.equal(live.statusCode, 200);
    assert.deepEqual(live.json(), { status: 'ok' });

    const protectedResponse = await app.inject({ method: 'GET', url: '/api/v1/me' });
    assert.equal(protectedResponse.statusCode, 401);
    assert.equal(protectedResponse.json().code, 'AUTHENTICATION_REQUIRED');
    assert.ok(protectedResponse.headers['x-request-id']);
  } finally {
    await app.close();
  }
});
