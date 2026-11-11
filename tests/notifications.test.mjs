import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = readFileSync(fileURLToPath(new URL('../src/views/components/layout/AppShell.tsx', import.meta.url)), 'utf8');

test('the notification indicator counts only unread notifications', () => {
  assert.match(source, /const notificationCount = notifications\.unread/);
  assert.doesNotMatch(source, /notificationCount = pending \+ notifications\.unread/);
});

test('viewed notifications remain readable until the panel closes and then disappear', () => {
  assert.match(source, /unreadNotifications = useMemo[\s\S]+!item\.read_at/);
  assert.match(source, /onClick=\{\(\) => setNotificationsOpen\(true\)\}/);
  assert.match(source, /const closeNotifications = \(\) => \{[\s\S]+setNotificationsOpen\(false\);[\s\S]+notifications\.markAllRead\(\)/);
  assert.match(source, /unreadNotifications\.map/);
  assert.match(source, /onClose=\{closeNotifications\}/);
});
