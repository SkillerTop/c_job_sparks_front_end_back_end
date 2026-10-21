import assert from 'node:assert/strict';
import { brotliDecompressSync } from 'node:zlib';
import test from 'node:test';
import type { Pool } from 'pg';
import { buildApp, redactEmailAddresses } from '../src/app.js';
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

test('application log sanitization removes employee email addresses', () => {
  assert.equal(
    redactEmailAddresses('Graph failed for employee.name@c-job.com.ua and MANAGER@C-JOB.COM'),
    'Graph failed for [REDACTED_EMAIL] and [REDACTED_EMAIL]',
  );
});

test('the complete route graph registers and protected routes fail closed', async () => {
  const app = await buildApp({ environment, pool: fakePool });
  try {
    app.get('/test/large-json', async () => ({ value: 'x'.repeat(4_096) }));
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    assert.equal(live.statusCode, 200);
    assert.deepEqual(live.json(), { status: 'ok' });

    const mailHealth = await app.inject({ method: 'GET', url: '/health/mail' });
    assert.equal(mailHealth.statusCode, 200);
    assert.deepEqual(mailHealth.json(), { status: 'disabled' });
    assert.equal(mailHealth.body.includes('error'), false);

    const protectedResponse = await app.inject({ method: 'GET', url: '/api/v1/me' });
    assert.equal(protectedResponse.statusCode, 401);
    assert.equal(protectedResponse.json().code, 'AUTHENTICATION_REQUIRED');
    assert.ok(protectedResponse.headers['x-request-id']);

    const microsoftConfig = await app.inject({ method: 'GET', url: '/api/v1/auth/microsoft/config' });
    assert.equal(microsoftConfig.statusCode, 200);
    assert.deepEqual(microsoftConfig.json(), { enabled: false, registrationEnabled: true });

    const microsoftStart = await app.inject({ method: 'GET', url: '/api/v1/auth/microsoft/start' });
    assert.equal(microsoftStart.statusCode, 503);
    assert.equal(microsoftStart.json().code, 'MICROSOFT_AUTH_DISABLED');

    let limitedResponse: Awaited<ReturnType<typeof app.inject>> | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({ method: 'GET', url: '/api/v1/auth/microsoft/start' });
      if (response.statusCode === 429) {
        limitedResponse = response;
        break;
      }
    }
    assert.ok(limitedResponse, 'The route-specific request limit must eventually return 429.');
    assert.equal(limitedResponse.statusCode, 429);
    assert.notEqual(limitedResponse.json().code, 'INTERNAL_ERROR');
    assert.ok(limitedResponse.headers['retry-after']);

    const compressed = await app.inject({
      method: 'GET',
      url: '/test/large-json',
      headers: { 'accept-encoding': 'br' },
    });
    assert.equal(compressed.statusCode, 200);
    assert.equal(compressed.headers['content-encoding'], 'br');
    assert.match(brotliDecompressSync(compressed.rawPayload).toString('utf8'), /"value"/);

    const forbiddenOrigin = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(forbiddenOrigin.statusCode, 403);
    assert.equal(forbiddenOrigin.json().code, 'ORIGIN_FORBIDDEN');
  } finally {
    await app.close();
  }
});

test('Microsoft sign-in configuration fails closed when credentials are incomplete', () => {
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
      COOKIE_SECRET: 'test-cookie-secret-that-is-long-enough',
      CORS_ORIGINS: 'http://localhost:5173',
      MICROSOFT_AUTH_ENABLED: 'true',
      MICROSOFT_TENANT_ID: 'tenant.example',
    }),
    /MICROSOFT_CLIENT_ID/,
  );
});

test('Graph mail configuration fails closed when sender or Entra credentials are incomplete', () => {
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
      COOKIE_SECRET: 'test-cookie-secret-that-is-long-enough',
      CORS_ORIGINS: 'http://localhost:5173',
      MAIL_ENABLED: 'true',
      MAIL_SENDER_EMAIL: 'sparks@c-job-ua.com',
    }),
    /MICROSOFT_TENANT_ID/,
  );
});
