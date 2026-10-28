import { existsSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const password = 'SparkDemo2026!';
const accounts = [
  ['employee', 'alex.stone@c-job.test'],
  ['coordinator', 'samuel.park@c-job.test'],
  ['gpm', 'elena.volkova@c-job.test'],
  ['head', 'maya.chen@c-job.test'],
  ['top-management', 'victor.hale@c-job.test'],
  ['administrator', 'ida.novak@c-job.test'],
] as const;

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

for (const [role, email] of accounts) {
  test(`${role} shell is visually stable and matches an approved baseline when present`, async ({ page }, testInfo) => {
    await signIn(page, email);
    await page.goto(role === 'administrator' ? '/admin?tab=access' : '/profile');
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');

    const screenshotName = `${role}-shell.png`;
    const options = { animations: 'disabled' as const, caret: 'hide' as const, fullPage: true };
    const first = await page.screenshot(options);
    await page.waitForTimeout(200);
    const second = await page.screenshot(options);

    // Detect reload loops, late layout shifts and other unstable rendering even
    // before the platform-specific approved baseline has been committed.
    expect(second.equals(first)).toBe(true);

    if (existsSync(testInfo.snapshotPath(screenshotName))) {
      await expect(page).toHaveScreenshot(screenshotName, options);
    } else {
      testInfo.annotations.push({
        type: 'visual-baseline',
        description: 'Approved baseline is not committed for this OS/project; screenshot attached for review.',
      });
      await testInfo.attach(screenshotName, { body: first, contentType: 'image/png' });
    }
  });
}
