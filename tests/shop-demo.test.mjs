import assert from 'node:assert/strict';
import test from 'node:test';
import { demoShopService } from '../src/services/demoShopService.ts';
import { ShopServiceError } from '../src/services/shopErrors.ts';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
};

const employee = { id: 'emp-alex', email: 'alex.stone@c-job.test', role: 'Employee' };
const topManagement = { id: 'emp-victor', email: 'victor.hale@c-job.test', role: 'Top Management' };
const administrator = { id: 'emp-ida', email: 'ida.novak@c-job.test', role: 'Administrator' };

test('the standalone shop purchases and activates an item exactly once', async () => {
  values.clear();
  const initial = await demoShopService.getSnapshot(employee);
  assert.equal(initial.balances.White, 18);

  const first = await demoShopService.purchase('task-reroll', employee, 'request-1');
  assert.equal(first.balances.White, 14);
  assert.equal(first.purchase.pricePaid, 4);
  assert.equal(first.inventoryItem.status, 'Owned');

  const repeated = await demoShopService.purchase('task-reroll', employee, 'request-1');
  assert.equal(repeated.purchase.id, first.purchase.id);
  assert.equal(repeated.balances.White, 14);

  const activated = await demoShopService.activate(first.inventoryItem.id, employee);
  assert.equal(activated.inventory[0].status, 'Used');
});

test('role restrictions and balance adjustments use the API-compatible error model', async () => {
  values.clear();
  await assert.rejects(
    demoShopService.purchase('task-reroll', topManagement, 'request-top'),
    (error) => error instanceof ShopServiceError && error.code === 'FORBIDDEN',
  );

  const adjusted = await demoShopService.adjustBalance('emp-alex', 'Yellow', 2, 'Demo adjustment', administrator);
  assert.equal(adjusted.balances.find((entry) => entry.userId === 'emp-alex')?.balances.Yellow, 9);

  await assert.rejects(
    demoShopService.purchase('gold-profile-frame', { ...employee, id: 'unknown-user' }, 'request-poor'),
    (error) => error instanceof ShopServiceError && error.code === 'INSUFFICIENT_SPARKS',
  );
});
