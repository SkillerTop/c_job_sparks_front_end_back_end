import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedAwardTypes,
  canPurchase,
  canUseMemberEconomy,
  canViewShop,
  hasFullPersonalLedger,
  conversionFor,
  gpmWhiteQuota,
  peerRecognitionQuota,
  quarterBounds,
  quarterForDate,
  validateRuleSet,
  type EffectiveRuleSet,
} from '../src/domain.js';
import { MIN_PASSWORD_LENGTH, hashPassword, tokenHash, validatePassword, verifyPassword } from '../src/security.js';
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  performanceRewardFor,
  performanceThresholdsFromConfiguration,
} from '../src/performance-rules.js';
import { SEED_CATEGORY_CATALOG } from '../src/category-catalog.js';

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

test('personal economy and shop access follow the role policy', () => {
  assert.equal(canUseMemberEconomy('Employee'), true);
  assert.equal(canUseMemberEconomy('Coordinator'), true);
  assert.equal(canUseMemberEconomy('GPM'), false);
  assert.equal(canUseMemberEconomy('Head'), false);
  assert.equal(canPurchase('Top Management'), false);
  assert.equal(canViewShop('Top Management'), true);
  assert.equal(canViewShop('GPM'), false);
  assert.equal(hasFullPersonalLedger('Coordinator'), true);
  assert.equal(hasFullPersonalLedger('Head'), false);
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

test('performance rewards use the thresholds stored in the active rule version', () => {
  const thresholds = {
    kpi: [
      { minimum: 0.8, reward: 2 },
      { minimum: 1, reward: 4 },
      { minimum: 1.2, reward: 7 },
    ],
    personalCards: [
      { minimum: 2.5, reward: 1 },
      { minimum: 3.5, reward: 3 },
      { minimum: 4.5, reward: 6 },
    ],
  };
  assert.deepEqual(performanceThresholdsFromConfiguration({ performanceThresholds: thresholds }), thresholds);
  assert.equal(performanceRewardFor('KPI', 1.1, thresholds), 4);
  assert.equal(performanceRewardFor('Evaluation', 4.7, thresholds), 6);
  assert.deepEqual(performanceThresholdsFromConfiguration({ performanceThresholds: { kpi: [] } }),
    DEFAULT_PERFORMANCE_THRESHOLDS);
});

test('the server catalog contains every configured recognition and award category', () => {
  const count = (sparkType: string, usageType: string) =>
    SEED_CATEGORY_CATALOG.filter((category) =>
      category.sparkType === sparkType && category.usageType === usageType).length;
  assert.equal(count('White', 'PeerRecognition'), 11);
  assert.equal(count('White', 'Award'), 11);
  assert.equal(count('Yellow', 'Award'), 10);
  assert.equal(count('Blue', 'Award'), 6);
  assert.equal(new Set(SEED_CATEGORY_CATALOG.map((category) => category.code)).size,
    SEED_CATEGORY_CATALOG.length);
  assert.equal(new Set(SEED_CATEGORY_CATALOG.map((category) => category.id)).size,
    SEED_CATEGORY_CATALOG.length);
  assert.equal(new Set(SEED_CATEGORY_CATALOG.map((category) => category.seedVersionId)).size,
    SEED_CATEGORY_CATALOG.length);
  assert.ok(SEED_CATEGORY_CATALOG.every((category) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(category.id) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(category.seedVersionId)));
  assert.ok(SEED_CATEGORY_CATALOG.every((category) => category.description.length > 20));
});

test('passwords use Argon2id and tokens are stored as digests', async () => {
  const password = 'SparkDemo2026!';
  assert.equal(MIN_PASSWORD_LENGTH, 10);
  assert.deepEqual(validatePassword('Aa123456').issues, ['Use at least 10 characters.']);
  assert.deepEqual(validatePassword('Aa1234567').issues, ['Use at least 10 characters.']);
  assert.equal(validatePassword(password).valid, true);
  const digest = await hashPassword(password);
  assert.match(digest, /^\$argon2id\$/);
  assert.equal(await verifyPassword(digest, password), true);
  assert.equal(await verifyPassword(digest, 'wrong password'), false);
  assert.equal(tokenHash('secret'), tokenHash('secret'));
  assert.notEqual(tokenHash('secret'), 'secret');
});
