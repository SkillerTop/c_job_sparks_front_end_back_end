import assert from 'node:assert/strict';
import test from 'node:test';
import { SHOP_CATEGORIES } from '../src/constants/shop.ts';
import { demoShopService } from '../src/services/demoShopService.ts';
import { ShopServiceError } from '../src/services/shopErrors.ts';
import { readShopLocation, writeShopLocation } from '../src/utils/shopLocation.ts';

const productCategories = ['Merch', 'Subscription', 'Certificate', 'Tool', 'Service', 'Other'];

test('the shop exposes only the configured product categories', async () => {
  assert.deepEqual(
    SHOP_CATEGORIES.map((category) => category.value),
    ['All', ...productCategories],
  );

  values.clear();
  const snapshot = await demoShopService.getSnapshot(employee);
  assert.ok(snapshot.products.length > 0);
  assert.ok(snapshot.products.every((product) => productCategories.includes(product.category)));
});

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
  assert.equal(initial.fulfillmentContacts.length, 10);
  assert.deepEqual(
    initial.fulfillmentContacts.map((contact) => contact.email),
    [
      'a.zherebetsky@c-job.com.ua',
      'o.kalnauz@c-job.com.ua',
      'm.nazarenko@c-job.com.ua',
      'm.keranova@c-job.com.ua',
      'm.petrenko@c-job.com.ua',
      'm.balanovskiy@c-job.com.ua',
      'i.tatko@c-job.com.ua',
      'm.klimova@c-job.com.ua',
      'd.volik@c-job.com.ua',
      'y.petrashenko@c-job.com.ua',
    ],
  );

  const first = await demoShopService.purchase('task-reroll', employee, 'request-1', undefined, 'Ukraine');
  assert.equal(first.balances.White, 14);
  assert.equal(first.purchase.pricePaid, 4);
  assert.equal(first.inventoryItem.status, 'Owned');

  const repeated = await demoShopService.purchase('task-reroll', employee, 'request-1', undefined, 'Ukraine');
  assert.equal(repeated.purchase.id, first.purchase.id);
  assert.equal(repeated.balances.White, 14);

  const activated = await demoShopService.activate(first.inventoryItem.id, employee);
  assert.equal(activated.inventory[0].status, 'Used');
});

test('role restrictions and balance adjustments use the API-compatible error model', async () => {
  values.clear();
  await assert.rejects(
    demoShopService.purchase('task-reroll', topManagement, 'request-top', undefined, 'Ukraine'),
    (error) => error instanceof ShopServiceError && error.code === 'FORBIDDEN',
  );

  const adjusted = await demoShopService.adjustBalance('emp-alex', 'Yellow', 2, 'Demo adjustment', administrator);
  assert.equal(adjusted.balances.find((entry) => entry.userId === 'emp-alex')?.balances.Yellow, 9);

  await assert.rejects(
    demoShopService.purchase('gold-profile-frame', { ...employee, id: 'unknown-user' }, 'request-poor', undefined, 'Ukraine'),
    (error) => error instanceof ShopServiceError && error.code === 'INSUFFICIENT_SPARKS',
  );
});

test('an administrator can remove a product while purchase history stays intact', async () => {
  values.clear();
  const purchased = await demoShopService.purchase('task-reroll', employee, 'delete-history-request', undefined, 'Ukraine');
  const before = await demoShopService.getAdminState(administrator);
  assert.ok(before.products.some((product) => product.id === 'task-reroll'));

  const after = await demoShopService.deleteProduct('task-reroll', administrator);
  assert.ok(after.products.every((product) => product.id !== 'task-reroll'));
  assert.ok(after.purchases.some((purchase) => purchase.id === purchased.purchase.id));

  await assert.rejects(
    demoShopService.deleteProduct('gold-profile-frame', employee),
    (error) => error instanceof ShopServiceError && error.code === 'FORBIDDEN',
  );
});

test('shop location is remembered per account and filters the catalog', async () => {
  values.clear();
  assert.equal(readShopLocation(employee.id), null);
  writeShopLocation(employee.id, 'Poland');
  assert.equal(readShopLocation(employee.id), 'Poland');
  assert.equal(readShopLocation(topManagement.id), null);

  const bulgaria = await demoShopService.getSnapshot(employee, 'Bulgaria');
  assert.ok(bulgaria.products.every((product) => product.availableLocations.includes('Bulgaria')));
  assert.ok(bulgaria.products.some((product) => product.id === 'captains-mystery-crate'));

  const poland = await demoShopService.getSnapshot(employee, 'Poland');
  assert.ok(poland.products.every((product) => product.availableLocations.includes('Poland')));
  assert.ok(poland.products.every((product) => product.id !== 'captains-mystery-crate'));

  await assert.rejects(
    demoShopService.purchase('captains-mystery-crate', employee, 'wrong-location', undefined, 'Poland'),
    (error) => error instanceof ShopServiceError && error.code === 'PRODUCT_LOCATION_UNAVAILABLE',
  );
});
