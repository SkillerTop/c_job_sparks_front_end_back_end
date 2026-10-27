import { expect, type Page, test } from '@playwright/test';

const password = 'SparkDemo2026!';

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test('Profile tabs use arrow-key navigation without horizontal page overflow', async ({ page }) => {
  await signIn(page, 'alex.stone@c-job.test');
  await page.goto('/profile');
  const profileTab = page.getByRole('tab', { name: 'Profile', exact: true });
  await profileTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Preferences', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Preferences', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Sessions', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Recognition keeps the selected category explanation next to the mobile form', async ({ page }) => {
  await signIn(page, 'alex.stone@c-job.test');
  await page.goto('/recognition');
  await page.getByRole('combobox', { name: 'Recognition category' }).click();
  await page.getByRole('option', { name: /Attention to Detail/ }).click();
  const categoryHeading = page.getByRole('heading', { name: 'Attention to Detail' }).filter({ visible: true });
  await expect(categoryHeading).toBeVisible();
  const categoryBox = await categoryHeading.boundingBox();
  const descriptionBox = await page.getByLabel(/Reason \/ description/).boundingBox();
  expect(categoryBox && descriptionBox && categoryBox.y < descriptionBox.y).toBe(true);
});

test('Closed selects leave no visible or focusable popup in the accessibility surface', async ({ page }) => {
  await signIn(page, 'alex.stone@c-job.test');
  await page.goto('/recognition');
  const category = page.getByRole('combobox', { name: 'Recognition category' });
  await category.click();
  await page.getByRole('option', { name: /Attention to Detail/ }).click();
  await expect(page.locator('[data-select-popup][data-closed]')).toBeHidden();
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('Invalid Recognition submit focuses the first field that needs attention', async ({ page }) => {
  await signIn(page, 'alex.stone@c-job.test');
  await page.goto('/recognition');
  await page.getByRole('button', { name: 'Send recognition' }).click();
  await expect(page.getByRole('combobox', { name: 'Recognition recipient' })).toBeFocused();
  await expect(page.getByText('Review the highlighted fields.')).toBeVisible();
});

test('Admin sections implement arrow-key tab navigation', async ({ page }) => {
  await signIn(page, 'ida.novak@c-job.test');
  await page.goto('/admin');
  const access = page.getByRole('tab', { name: 'Access', exact: true });
  await access.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Shop', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Shop', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Audit', exact: true })).toBeFocused();
});

test('Rules starts with collapsed categories and search progressively reveals matches', async ({ page }) => {
  await signIn(page, 'alex.stone@c-job.test');
  await page.goto('/rules');
  await expect(page.locator('details[open]')).toHaveCount(0);
  await page.getByLabel('Search award categories').fill('Attention to Detail');
  await expect(page.locator('details[open]')).toHaveCount(2);
  await expect(page.getByText('Attention to Detail', { exact: true })).toHaveCount(2);
});

test('Admin category management exposes complete mobile cards and actions', async ({ page }) => {
  await signIn(page, 'ida.novak@c-job.test');
  await page.goto('/admin?tab=rules');
  await expect(page.getByRole('heading', { name: 'Category award amounts' })).toBeVisible();
  await expect(page.getByLabel('Search categories')).toBeVisible();
  await expect(page.getByRole('button', { name: /Delete category/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save amount' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('session focus revalidation does not reload the workspace', async ({ page }) => {
  await signIn(page, 'alex.stone@c-job.test');
  await page.goto('/profile');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Alex Stone', exact: true })).toBeVisible();

  let layoutRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/workspace/layout') layoutRequests += 1;
  });

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(500);

  expect(layoutRequests).toBe(0);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Alex Stone', exact: true })).toBeVisible();
});
