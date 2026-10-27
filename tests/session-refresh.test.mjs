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

test('a stale Vite chunk can trigger at most one automatic reload per browser tab', async () => {
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const preloadHandler = source.slice(
    source.indexOf("window.addEventListener('vite:preloadError'"),
    source.indexOf("createRoot(document.getElementById('root')"),
  );

  assert.match(preloadHandler, /event\.preventDefault\(\)/);
  assert.match(preloadHandler, /sessionStorage\.getItem\(PRELOAD_RECOVERY_KEY\)/);
  assert.match(preloadHandler, /window\.location\.reload\(\)/);
  assert.doesNotMatch(preloadHandler, /removeItem\(PRELOAD_RECOVERY_KEY\)/);
  assert.doesNotMatch(preloadHandler, /setTimeout/);
});

test('transient auth revalidation errors do not clear the active user', async () => {
  const source = await readFile(new URL('../src/controllers/AuthContext.tsx', import.meta.url), 'utf8');
  const catchBranch = source.slice(source.indexOf('} catch (caught) {'), source.indexOf('} finally {'));
  assert.doesNotMatch(catchBranch, /setUser\(null\)/);
  assert.doesNotMatch(catchBranch, /setAccessState\(/);
  assert.match(catchBranch, /if \(!authenticatedUserRef\.current\)/);
});
