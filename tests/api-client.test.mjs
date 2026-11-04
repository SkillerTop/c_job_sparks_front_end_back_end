import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { apiRequest } from '../src/services/apiClient.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('GET retries a transient lost response and then succeeds', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('connection reset');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  assert.deepEqual(await apiRequest('/fault/get', { retries: 1 }), { ok: true });
  assert.equal(calls, 2);
});

test('POST is never retried without an idempotency key', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError('response was lost');
  };
  await assert.rejects(apiRequest('/fault/post', { method: 'POST', body: '{}', retries: 2 }), /response was lost/);
  assert.equal(calls, 1);
});

test('idempotent POST preserves its key when a retryable response is repeated', async () => {
  const keys = [];
  globalThis.fetch = async (_url, init) => {
    keys.push(new Headers(init?.headers).get('idempotency-key'));
    if (keys.length === 1) return new Response(JSON.stringify({ message: 'busy' }), { status: 503 });
    return new Response(JSON.stringify({ operationId: 'one-operation' }), { status: 200 });
  };
  const result = await apiRequest('/fault/idempotent', {
    method: 'POST', body: '{}', idempotencyKey: 'stable-fault-test-key', retries: 1,
  });
  assert.deepEqual(result, { operationId: 'one-operation' });
  assert.deepEqual(keys, ['stable-fault-test-key', 'stable-fault-test-key']);
});

test('request timeout aborts a stalled request', async () => {
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });
  await assert.rejects(apiRequest('/fault/timeout', { timeoutMs: 5, retries: 0 }), /timeout|aborted/i);
});
