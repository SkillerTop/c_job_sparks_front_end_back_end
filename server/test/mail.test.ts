import assert from 'node:assert/strict';
import test from 'node:test';
import { createGraphMailClient, rewardFulfillmentMail } from '../src/mail.js';

test('reward fulfillment email contains operational details and sanitizes HTML', () => {
  const mail = rewardFulfillmentMail({
    sourceType: 'ShopPurchase',
    emailTo: ['A.Hryshyn@c-job.com', 'invalid', 'a.hryshyn@c-job.com'],
    recipientName: 'Alex <script>',
    recipientEmail: 'alex@c-job.test',
    productName: 'Monitor & Dock',
    fulfillmentKind: 'ITEquipment',
    deliveryMethod: 'InternalCoordination',
    assignedTo: { display_name: 'Artem Hryshyn (Test)', email: 'a.hryshyn@c-job.com' },
  }, 'https://sparks.c-job.com');
  assert.deepEqual(mail.recipients, ['a.hryshyn@c-job.com']);
  assert.match(mail.subject, /Monitor & Dock purchased by Alex/);
  assert.match(mail.text, /Artem Hryshyn/);
  assert.doesNotMatch(mail.html, /<script>/);
  assert.match(mail.html, /Alex &lt;script&gt;/);
});

test('Graph mail client uses client credentials and reuses the access token', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, ...(init ? { init } : {}) });
    if (url.includes('/oauth2/v2.0/token'))
      return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const client = createGraphMailClient({
    MICROSOFT_TENANT_ID: 'tenant-id',
    MICROSOFT_CLIENT_ID: '11111111-1111-4111-8111-111111111111',
    MICROSOFT_CLIENT_SECRET: 'secret-value',
    MAIL_SENDER_EMAIL: 'sparks@c-job-ua.com',
    MAIL_SENDER_USER_ID: 'sparks@c-job-ua.com',
    MAIL_SENDER_NAME: 'C-Job Sparks',
  }, fetcher);
  const message = { recipients: ['a.hryshyn@c-job.com'], subject: 'Test', text: 'Test', html: '<p>Test</p>' };
  await client.send(message);
  await client.send(message);
  assert.equal(calls.filter((call) => call.url.includes('/oauth2/v2.0/token')).length, 1);
  assert.equal(calls.filter((call) => call.url.includes('/sendMail')).length, 2);
  const send = calls.find((call) => call.url.includes('/sendMail'))!;
  assert.match(send.url, /users\/sparks%40c-job-ua\.com\/sendMail$/);
  assert.equal(new Headers(send.init?.headers).get('authorization'), 'Bearer test-access-token');
});
