import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sessionRevalidationDelay } from '../src/utils/sessionRevalidation.ts';

test('session revalidation never creates a tight loop when expiry metadata is missing or stale', () => {
  assert.equal(sessionRevalidationDelay(null, 10_000), null);
  assert.equal(sessionRevalidationDelay(Number.NaN, 10_000), null);
  assert.equal(sessionRevalidationDelay(9_000, 10_000), 60_000);
  assert.equal(sessionRevalidationDelay(20_000, 10_000), 10_050);
});

test('workspace refresh effects depend on a stable identity key instead of the user object', async () => {
  const source = await readFile(new URL('../src/controllers/SparkContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /const workspaceIdentity = user \?/);
  assert.doesNotMatch(source, /\[section, user\]/);
  assert.doesNotMatch(source, /\[user\]/);
});

test('a stale Vite chunk never triggers an automatic browser reload', async () => {
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /vite:preloadError/);
  assert.doesNotMatch(source, /window\.location\.reload\(\)/);
  assert.doesNotMatch(source, /sessionStorage/);
});

test('returning to a recently active tab does not revalidate or reload authentication', async () => {
  const source = await readFile(new URL('../src/controllers/AuthContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /AUTH_REVALIDATION_STALE_MS = 5 \* 60_000/);
  assert.match(source, /now - lastSuccessfulRefreshAt\.current < AUTH_REVALIDATION_STALE_MS/);
  assert.match(source, /now - lastBackgroundRevalidationAt\.current < AUTH_REVALIDATION_DEDUP_MS/);
  assert.doesNotMatch(source, /const revalidate = \(\) => void refreshAuth\(\)/);
});

test('transient auth revalidation errors do not clear the active user', async () => {
  const source = await readFile(new URL('../src/controllers/AuthContext.tsx', import.meta.url), 'utf8');
  const catchBranch = source.slice(source.indexOf('} catch (caught) {'), source.indexOf('} finally {'));
  assert.doesNotMatch(catchBranch, /setUser\(null\)/);
  assert.doesNotMatch(catchBranch, /setAccessState\(/);
  assert.match(catchBranch, /if \(!authenticatedUserRef\.current\)/);
});

test('Head approval badge uses the live queue while the Approval Center is active', async () => {
  const source = await readFile(new URL('../src/views/components/layout/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(source, /location\.pathname\.startsWith\('\/approvals'\)/);
  assert.match(source, /\? visibleApprovalQueueCount/);
  assert.match(source, /pendingRequests\.recognitions\.length \+ pendingRequests\.awards\.length/);
});

test('personal economy pages never derive an authoritative balance from paged Ledger rows', async () => {
  const files = [
    '../src/views/pages/ConversionPage.tsx',
    '../src/views/pages/DisenchantPage.tsx',
    '../src/controllers/useLedgerController.ts',
    '../src/controllers/useDashboardController.ts',
    '../src/views/components/layout/AppShell.tsx',
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /selectAuthoritativeBalances/);
    assert.doesNotMatch(source, /calculateBalances/);
  }
});

test('conversion and disenchant refresh the authoritative balance after mutation', async () => {
  const source = await readFile(new URL('../src/services/apiSparkService.ts', import.meta.url), 'utf8');
  assert.match(source, /apiRequest<SparkBalances>\('\/api\/v1\/me\/spark-balances'\)/);
  const convert = source.slice(source.indexOf('async convert('), source.indexOf('async disenchant('));
  const disenchant = source.slice(source.indexOf('async disenchant('), source.indexOf('async exportDisenchantRequests('));
  assert.match(convert, /workspaceWithFreshBalances\(\)/);
  assert.match(disenchant, /workspaceWithFreshBalances\(\)/);
});

test('conversion amount keeps a temporary empty string while the user edits it', async () => {
  const source = await readFile(new URL('../src/views/pages/ConversionPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /setAmountInput\(event\.target\.value\)/);
  assert.match(source, /normalizeConversionAmount\(current, rule\.ratio\)/);
  assert.doesNotMatch(source, /setAmount\(Number\(event\.target\.value\)\)/);
});
