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

test('Admin category management exposes complete mobile cards and actions', async ({ page }) => {
  await signIn(page, 'ida.novak@c-job.test');
  await page.goto('/admin?tab=rules');
  await expect(page.getByRole('heading', { name: 'Category award amounts' })).toBeVisible();
  await expect(page.getByLabel('Search categories')).toBeVisible();
  await expect(page.getByRole('button', { name: /Delete category/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save amount' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
