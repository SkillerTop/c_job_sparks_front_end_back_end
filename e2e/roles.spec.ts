import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const password = 'SparkDemo2026!';
const roles = [
  { role: 'Employee', email: 'alex.stone@c-job.test', route: '/profile' },
  { role: 'Coordinator', email: 'samuel.park@c-job.test', route: '/team' },
  { role: 'GPM', email: 'elena.volkova@c-job.test', route: '/team' },
  { role: 'Head', email: 'maya.chen@c-job.test', route: '/approvals' },
  { role: 'Top Management', email: 'victor.hale@c-job.test', route: '/award' },
  { role: 'Administrator', email: 'ida.novak@c-job.test', route: '/admin' },
] as const;

for (const account of roles) {
  test(`${account.role} can sign in and open the expected workspace`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto(account.route);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('Access restricted')).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      accessibility.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? '')),
    ).toEqual([]);
  });
}

test('Profile does not load the Shop snapshot', async ({ page }) => {
  const shopRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/(v1\/)?shop(?:$|\?)/.test(request.url())) shopRequests.push(request.url());
  });
  await page.goto('/login');
  await page.getByLabel('Work email').fill('alex.stone@c-job.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: /Profile/i })).toBeVisible();
  await page.waitForTimeout(500);
  expect(shopRequests).toEqual([]);
});

test('protected pages publish noindex metadata', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.getByLabel('Work email').fill('alex.stone@c-job.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.goto('/profile');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
