import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';

const password = 'SparkDemo2026!';
const recognitionDescription = `UI E2E recognition ${randomUUID()}`;
const coordinatorAwardDescription = `UI E2E coordinator award ${randomUUID()}`;
const gpmAwardDescription = `UI E2E GPM award ${randomUUID()}`;

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function choose(page: Page, label: string, option: RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

async function approveCard(card: Locator) {
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });

test('Employee submits Peer Recognition through the form', async ({ page }) => {
  await signIn(page, 'alex.stone@c-job.test');
  await page.goto('/recognition');
  await choose(page, 'Recipient', /Samuel Park/);
  await choose(page, 'Recognition category', /Attention to Detail/);
  await page.getByLabel(/Reason \/ description/).fill(recognitionDescription);
  await page.getByRole('button', { name: 'Send recognition' }).click();
  await expect(page.getByText('Recognition sent to the Head for approval.')).toBeVisible();
});

test('Coordinator submits a scoped award through the form', async ({ page }) => {
  await signIn(page, 'samuel.park@c-job.test');
  await page.goto('/award');
  await choose(page, 'Employee', /Alex Stone/);
  await choose(page, 'Award category', /Recorded internal training/);
  await page.getByLabel(/^Description/).fill(coordinatorAwardDescription);
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText('Award request sent to the Head for approval.')).toBeVisible();
});

test('GPM submits a scoped Yellow award through the form', async ({ page }) => {
  await signIn(page, 'elena.volkova@c-job.test');
  await page.goto('/award');
  await choose(page, 'Employee', /Samuel Park/);
  await choose(page, 'Spark type', /^Yellow$/);
  await choose(page, 'Award category', /Successful employee referral/);
  await page.getByLabel(/^Description/).fill(gpmAwardDescription);
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText('Award request sent to the Head for approval.')).toBeVisible();
});

test('Head approves the three pending UI requests', async ({ page }) => {
  await signIn(page, 'maya.chen@c-job.test');
  await page.goto('/approvals');
  await approveCard(page.locator('article').filter({ hasText: recognitionDescription }));
  await approveCard(page.locator('article').filter({ hasText: coordinatorAwardDescription }));
  await approveCard(page.locator('article').filter({ hasText: gpmAwardDescription }));
});

test('Top Management grants a Radiant award through the form', async ({ page }) => {
  await signIn(page, 'victor.hale@c-job.test');
  await page.goto('/award');
  await choose(page, 'Employee', /Alex Stone/);
  await page.getByLabel(/^Reason/).fill(`Company-wide UI E2E impact ${randomUUID()}`);
  await page.getByRole('combobox', { name: 'Responsible for Radiant fulfillment' }).click();
  await page.getByRole('option').filter({ hasNotText: 'Select responsible person' }).first().click();
  await page.getByLabel(/Valuable prize selected by management/).fill('UI E2E annual prize');
  await page.getByLabel(/^Description/).fill('UI E2E verified exceptional company-wide contribution.');
  await page.getByRole('button', { name: 'Award Spark' }).click();
  await expect(page.getByText(/Radiant/i).first()).toBeVisible();
});

test('Administrator creates and removes a category through Admin Rules', async ({ page }) => {
  const categoryName = `UI E2E category ${randomUUID().slice(0, 8)}`;
  page.on('dialog', (dialog) => void dialog.accept());
  await signIn(page, 'ida.novak@c-job.test');
  await page.goto('/admin?tab=rules');
  await page.getByRole('button', { name: 'Add Peer category' }).click();
  await page.getByLabel(/^Name/).fill(categoryName);
  await page.getByLabel('Sparks awarded').fill('2');
  await page.getByLabel('Description').fill('UI E2E category lifecycle verification.');
  await page.getByRole('button', { name: 'Save record' }).click();
  await page.getByLabel('Search categories').fill(categoryName);
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Delete category ${categoryName}` }).click();
  await expect(page.getByText(categoryName, { exact: true })).toHaveCount(0);
});
