import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = (relative) => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

test('Task Board requires the two explicit approval stages before publication', () => {
  const page = source('src/views/pages/TaskBoardPage.tsx');
  const service = source('src/services/taskBoardService.ts');
  assert.match(page, /ATTENTION! The reward for every Task Board task must be agreed/);
  assert.match(page, /Has the task definitely, definitely been agreed with the directors/);
  assert.match(page, /confirmFirst/);
  assert.match(page, /confirmSecond/);
  assert.match(service, /confirm-first/);
  assert.match(service, /confirm-second/);
});

test('Task Board exposes every required view and management action', () => {
  const page = source('src/views/pages/TaskBoardPage.tsx');
  for (const label of [
    'Active', 'Booked', 'Completed', 'Created by me', 'Booked by me',
    'Take task', 'Unassign employee', 'Confirm completion', 'Task history',
  ]) assert.match(page, new RegExp(label));
});

test('Task Board composes rewards from the same spendable Spark types as the shop', () => {
  const page = source('src/views/pages/TaskBoardPage.tsx');
  const backend = source('server/src/task-board.ts');
  assert.match(page, /SPENDABLE_SPARK_TYPES/);
  assert.match(page, /SparkPrice components=\{item\.rewardComponents\}/);
  assert.match(backend, /entries: rewardComponents\.map/);
  assert.match(backend, /rewardOrder: SpendableSparkType\[\] = \['White', 'Yellow', 'Blue'\]/);
});

test('Task Board reuses the shared page, card, form and action visual system', () => {
  const page = source('src/views/pages/TaskBoardPage.tsx');
  assert.match(page, /appStyles\.panel/);
  assert.match(page, /appStyles\.segmented/);
  assert.match(page, /appStyles\.formField/);
  assert.match(page, /appStyles\.accentButton/);
  assert.match(page, /<StatusBadge/);
});

test('Task Board is a private route available to every existing role', () => {
  assert.match(source('src/app/AppRouter.tsx'), /path="task-board"[\s\S]+roles=\{ALL_ROLES\}/);
  assert.match(source('server/src/contracts.ts'), /'task-board': \['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Office Manager', 'Administrator'\]/);
});
