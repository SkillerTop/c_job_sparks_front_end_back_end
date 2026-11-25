import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = readFileSync(fileURLToPath(new URL('../src/views/components/layout/AppShell.tsx', import.meta.url)), 'utf8');
const profileModel = readFileSync(fileURLToPath(new URL('../src/models/profile.ts', import.meta.url)), 'utf8');
const profileConstants = readFileSync(fileURLToPath(new URL('../src/constants/profile.ts', import.meta.url)), 'utf8');
const taskBoardBackend = readFileSync(fileURLToPath(new URL('../server/src/task-board.ts', import.meta.url)), 'utf8');

test('the notification indicator counts only unread notifications', () => {
  assert.match(source, /const notificationCount = notifications\.unread/);
  assert.doesNotMatch(source, /notificationCount = pending \+ notifications\.unread/);
});

test('viewed notifications remain readable until the panel closes and then disappear', () => {
  assert.match(source, /unreadNotifications = useMemo[\s\S]+!item\.read_at/);
  assert.match(source, /const openNotifications = \(\) => \{[\s\S]+setNotificationsOpen\(true\);[\s\S]+notifications\.reload\(\)/);
  assert.match(source, /onClick=\{openNotifications\}/);
  assert.match(source, /const closeNotifications = \(\) => \{[\s\S]+setNotificationsOpen\(false\);[\s\S]+notifications\.markAllRead\(\)/);
  assert.match(source, /unreadNotifications\.map/);
  assert.match(source, /onClose=\{closeNotifications\}/);
});

test('Task Board creation notifications have a saved user preference and server-side opt-out', () => {
  assert.match(profileModel, /taskBoard: boolean/);
  assert.match(profileConstants, /key: 'taskBoard'/);
  assert.match(profileConstants, /taskBoard: true/);
  assert.match(taskBoardBackend, /notification_settings->>'taskBoard'/);
  assert.match(taskBoardBackend, /'TaskCreated'/);
  assert.match(taskBoardBackend, /'\/task-board'/);
});

test('Task Board booking notifies the assignee department Head without duplicates', () => {
  assert.match(taskBoardBackend, /department\.id=assignee\.department_id AND department\.is_active/);
  assert.match(taskBoardBackend, /head\.id=department\.head_employee_id AND head\.is_active/);
  assert.match(taskBoardBackend, /head_user\.account_status='Approved'/);
  assert.match(taskBoardBackend, /head\.user_id<>\$2/);
  assert.match(taskBoardBackend, /head\.user_id<>\$3/);
  assert.match(taskBoardBackend, /notification_settings->>'taskBoard'/);
  assert.match(taskBoardBackend, /from \$\{recipient\.department_name\} booked the task/);
  assert.match(taskBoardBackend, /'TaskBooked'/);
});
