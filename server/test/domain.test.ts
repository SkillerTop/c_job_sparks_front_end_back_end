import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedAwardTypes,
  conversionFor,
  gpmWhiteQuota,
  peerRecognitionQuota,
  quarterBounds,
  quarterForDate,
  validateRuleSet,
  type EffectiveRuleSet,
} from '../src/domain.js';
import { hashPassword, tokenHash, validatePassword, verifyPassword } from '../src/security.js';

const rules: EffectiveRuleSet = {
  currentQuarter: 'Q4 2026',
  whiteToYellow: 10,
  yellowToBlue: 5,
  conversionFee: 1,
  yellowQuarterlyLimit: 10,
  peerBaseLimit: 3,
  coordinatorTeamMultiplier: 5,
  disenchantRate: 0.8,
  currency: 'EUR',
  sparkMoneyValues: { White: 1, Yellow: 10, Blue: 50 },
};

test('conversion applies a fee per output bundle', () => {
  assert.deepEqual(conversionFor('White', 20, rules), {
    from: 'White',
    to: 'Yellow',
    amount: 20,
    output: 2,
    fee: 2,
    totalDebit: 22,
  });
  assert.throws(() => conversionFor('White', 11, rules));
  assert.throws(() => conversionFor('Radiant', 1, rules));
});

test('quota formulas preserve the frontend business contract', () => {
  assert.equal(peerRecognitionQuota('Employee', 3, 100, 5), 3);
  assert.equal(peerRecognitionQuota('Coordinator', 3, 12, 5), 5);
  assert.equal(gpmWhiteQuota(0, 5), 0);
  assert.equal(gpmWhiteQuota(11, 5), 3);
});

test('roles determine award type on the server', () => {
  assert.deepEqual(allowedAwardTypes('Coordinator'), ['Yellow']);
  assert.deepEqual(allowedAwardTypes('GPM'), ['White', 'Yellow']);
  assert.deepEqual(allowedAwardTypes('Head'), ['White', 'Yellow', 'Blue']);
  assert.deepEqual(allowedAwardTypes('Top Management'), ['Radiant']);
  assert.deepEqual(allowedAwardTypes('Administrator'), []);
});

test('quarters use UTC calendar boundaries', () => {
  assert.equal(quarterForDate('2026-10-05T00:00:00.000Z'), 'Q4 2026');
  const bounds = quarterBounds('Q4 2026');
  assert.equal(bounds.start.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('rule set validation rejects unsafe values', () => {
  assert.equal(validateRuleSet(rules), rules);
  assert.throws(() => validateRuleSet({ ...rules, conversionFee: -1 }));
  assert.throws(() => validateRuleSet({ ...rules, disenchantRate: 1.1 }));
});

test('passwords use Argon2id and tokens are stored as digests', async () => {
  const password = 'SparkDemo2026!';
  assert.equal(validatePassword(password).valid, true);
  const digest = await hashPassword(password);
  assert.match(digest, /^\$argon2id\$/);
  assert.equal(await verifyPassword(digest, password), true);
  assert.equal(await verifyPassword(digest, 'wrong password'), false);
  assert.equal(tokenHash('secret'), tokenHash('secret'));
  assert.notEqual(tokenHash('secret'), 'secret');
});
