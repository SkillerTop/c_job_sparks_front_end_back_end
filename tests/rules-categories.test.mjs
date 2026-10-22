import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRuleCategoryGroups } from '@/utils/ruleCategoryGroups';

const category = (id, usageType, sparkType, amount, active = true) => ({
  id,
  name: 'Shared name',
  description: `${usageType} description`,
  usageType,
  sparkType,
  amount,
  period: sparkType === 'Blue' ? 'Yearly' : usageType === 'Award' ? 'Quarterly' : 'Unrestricted',
  active,
});

test('Rules keeps Peer and Award categories separate and uses current configured amounts', () => {
  const groups = buildRuleCategoryGroups([
    category('peer', 'PeerRecognition', 'White', 2),
    category('award-white', 'Award', 'White', 3),
    category('award-yellow', 'Award', 'Yellow', 4),
    category('award-blue', 'Award', 'Blue', 5),
    category('inactive', 'Award', 'Yellow', 99, false),
    category('performance', 'Performance', 'White', 99),
  ]);

  assert.deepEqual(groups.map((group) => group.key), [
    'peer-white',
    'award-white',
    'award-yellow',
    'award-blue',
  ]);
  assert.deepEqual(groups.map((group) => group.categories.map(({ id, amount }) => ({ id, amount }))), [
    [{ id: 'peer', amount: 2 }],
    [{ id: 'award-white', amount: 3 }],
    [{ id: 'award-yellow', amount: 4 }],
    [{ id: 'award-blue', amount: 5 }],
  ]);
});
