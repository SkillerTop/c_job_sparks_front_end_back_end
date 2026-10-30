import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

const password = 'SparkDemo2026!';
const apiOrigin = 'http://127.0.0.1:3001';
const employeeId = 'aaaaaaaa-1001-4000-8000-000000000001';
const coordinatorId = 'aaaaaaaa-1002-4000-8000-000000000002';
const productId = '99999999-0002-4000-8000-000000000002';

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function api<T>(page: Page, method: 'GET' | 'POST', path: string, data?: unknown) {
  const response = await page.request.fetch(`${apiOrigin}${path}`, {
    method,
    data,
    headers: method === 'POST' ? { 'idempotency-key': `e2e-${randomUUID()}` } : undefined,
  });
  const body = await response.text();
  expect(response.ok(), `${method} ${path}: ${response.status()} ${body}`).toBe(true);
  return body ? JSON.parse(body) as T : undefined as T;
}

interface Category {
  id: string;
  spark_type: 'White' | 'Yellow' | 'Blue';
  usage_type: 'PeerRecognition' | 'Award';
  name: string;
}

test('all six roles complete their real server-backed business scenarios', async ({ page }) => {
  let recognitionId = '';
  const awardIds: string[] = [];

  await test.step('Employee recognizes, converts, disenchants and purchases', async () => {
    await signIn(page, 'alex.stone@c-job.test');
    const categories = await api<Category[]>(page, 'GET', '/api/v1/spark-categories');
    const peer = categories.find((item) => item.usage_type === 'PeerRecognition' && item.name === 'Communication Excellence');
    expect(peer).toBeTruthy();
    const recognition = await api<{ id: string; status: string }>(page, 'POST', '/api/v1/recognitions', {
      recipientId: coordinatorId,
      categoryId: peer!.id,
      description: 'E2E: clear and useful project communication.',
    });
    recognitionId = recognition.id;
    expect(recognition.status).toBe('Pending');
    await api(page, 'POST', '/api/v1/conversions', { from: 'White', amount: 10 });
    await api(page, 'POST', '/api/v1/disenchant-requests', { sparkType: 'Yellow', amount: 1 });
    await api(page, 'POST', '/api/v1/shop/purchases', { productId, location: 'Ukraine' });
    await page.goto('/shop');
    await expect(page.locator('main')).toBeVisible();
  });

  await test.step('Coordinator submits a scoped Yellow request', async () => {
    await signIn(page, 'samuel.park@c-job.test');
    const categories = await api<Category[]>(page, 'GET', '/api/v1/spark-categories');
    const category = categories.find((item) => item.usage_type === 'Award' && item.spark_type === 'Yellow' &&
      item.name === 'Critical delivery deadline rescue');
    expect(category).toBeTruthy();
    const award = await api<{ id: string; status: string }>(page, 'POST', '/api/v1/awards', {
      recipientId: employeeId,
      categoryId: category!.id,
      description: 'E2E: recovered a critical delivery milestone.',
    });
    awardIds.push(award.id);
    expect(award.status).toBe('Pending');
    await page.goto('/award');
    await expect(page.locator('main')).toBeVisible();
  });

  await test.step('GPM submits a scoped White request', async () => {
    await signIn(page, 'elena.volkova@c-job.test');
    const categories = await api<Category[]>(page, 'GET', '/api/v1/spark-categories');
    const category = categories.find((item) => item.usage_type === 'Award' && item.spark_type === 'White' &&
      item.name === 'Documentation Hero');
    expect(category).toBeTruthy();
    const award = await api<{ id: string; status: string }>(page, 'POST', '/api/v1/awards', {
      recipientId: coordinatorId,
      categoryId: category!.id,
      description: 'E2E: created reusable project documentation.',
    });
    awardIds.push(award.id);
    expect(award.status).toBe('Pending');
    await page.goto('/team');
    await expect(page.locator('main')).toBeVisible();
  });

  await test.step('Head approves pending work and grants a direct award', async () => {
    await signIn(page, 'maya.chen@c-job.test');
    await api(page, 'POST', `/api/v1/recognitions/${recognitionId}/decision`, { decision: 'Approved', reason: '' });
    for (const id of awardIds)
      await api(page, 'POST', `/api/v1/award-requests/${id}/decision`, { decision: 'Approved', reason: '' });
    const categories = await api<Category[]>(page, 'GET', '/api/v1/spark-categories');
    const category = categories.find((item) => item.usage_type === 'Award' && item.spark_type === 'Yellow' &&
      item.name === 'Named positive client feedback');
    expect(category).toBeTruthy();
    const award = await api<{ status: string }>(page, 'POST', '/api/v1/awards', {
      recipientId: coordinatorId,
      categoryId: category!.id,
      description: 'E2E: client explicitly praised the employee contribution.',
    });
    expect(award.status).toBe('Approved');
    await page.goto('/approvals');
    await expect(page.locator('main')).toBeVisible();
  });

  await test.step('Top Management grants a fulfilled Radiant award', async () => {
    await signIn(page, 'victor.hale@c-job.test');
    const contacts = await api<Array<{ id: string }>>(page, 'GET', '/api/v1/reward-fulfillment-contacts');
    expect(contacts.length).toBeGreaterThan(0);
    const award = await api<{ status: string; sparkType: string }>(page, 'POST', '/api/v1/awards', {
      recipientId: employeeId,
      description: 'E2E: exceptional company-wide impact.',
      radiantReason: 'Company-wide impact',
      fulfillmentContactId: contacts[0]!.id,
      radiantRewardKind: 'RadiantAcrylic',
      valuablePrizeDescription: 'Annual leadership-selected prize',
    });
    expect(award).toMatchObject({ status: 'Approved', sparkType: 'Radiant' });
    await page.goto('/award');
    await expect(page.locator('main')).toBeVisible();
  });

  await test.step('Administrator performs an audited adjustment and pages audit history', async () => {
    await signIn(page, 'ida.novak@c-job.test');
    await api(page, 'POST', '/api/v1/admin/balance-adjustments', {
      employeeId,
      sparkType: 'White',
      amount: 1,
      reason: 'E2E administrative adjustment',
    });
    const audit = await api<{ items: unknown[]; nextCursor: string | null; hasNext: boolean }>(
      page, 'GET', '/api/v1/admin/audit-events?limit=2',
    );
    expect(audit.items).toHaveLength(2);
    expect(audit.hasNext).toBe(true);
    expect(audit.nextCursor).toEqual(expect.any(String));
    const next = await api<{ items: unknown[] }>(
      page, 'GET', `/api/v1/admin/audit-events?limit=2&cursor=${encodeURIComponent(audit.nextCursor!)}`,
    );
    expect(next.items.length).toBeGreaterThan(0);
    await page.goto('/admin');
    await expect(page.locator('main')).toBeVisible();
  });
});
