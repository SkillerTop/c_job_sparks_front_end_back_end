import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
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
import { departmentScopeIds, hasDepartmentScope } from '../src/authorization.js';
import { listEligibleRecipients } from '../src/recognition.js';
import {
  calculateLeaderboardScore,
  createLeaderboardResponse,
  LEADERBOARD_SPARK_WEIGHTS,
} from '../shared/leaderboard-contract.js';

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

test('leaderboard applies configured Spark weights and excludes Radiant', () => {
  assert.deepEqual(LEADERBOARD_SPARK_WEIGHTS, { White: 1, Yellow: 10, Blue: 100, Radiant: 0 });
  assert.equal(calculateLeaderboardScore({ White: 4, Yellow: 3, Blue: 2, Radiant: 999 }), 234);
});

test('leaderboard ranks deterministically and reports monthly movement', () => {
  const result = createLeaderboardResponse([
    { employeeId: 'current', name: 'Current User', title: 'Engineer', departmentId: 'dep-a', amount: 7, previousAmount: 3 },
    { employeeId: 'leader', name: 'A Leader', title: 'Lead', departmentId: 'dep-b', amount: 12, previousAmount: 12 },
    { employeeId: 'peer-b', name: 'Beta Peer', title: 'Engineer', departmentId: 'dep-a', amount: 7, previousAmount: 8 },
    { employeeId: 'peer-a', name: 'Alpha Peer', title: 'Engineer', departmentId: 'dep-a', amount: 7, previousAmount: 2 },
  ], 'current', null, [], '2026-11-27T00:00:00.000Z');

  assert.deepEqual(result.topTen.map((entry) => entry.employeeId), ['leader', 'peer-a', 'peer-b', 'current']);
  assert.equal(result.currentUser?.rank, 4);
  assert.equal(result.currentUser?.rankChange, -1);
  assert.deepEqual(result.aroundCurrentUser.map((entry) => entry.rank), [3, 4]);
  assert.equal(result.totalUsers, 4);
  assert.equal(result.topTenThreshold, 0);
});

test('leaderboard handles a department that does not contain the current employee', () => {
  const result = createLeaderboardResponse([
    { employeeId: 'peer', name: 'Department Peer', title: 'Engineer', departmentId: 'dep-b', amount: 2, previousAmount: 2 },
  ], 'current', 'dep-b');

  assert.equal(result.currentUser, null);
  assert.deepEqual(result.aroundCurrentUser, []);
  assert.equal(result.topTen[0]?.rank, 1);
});

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
  assert.equal(canViewShop('GPM'), true);
  assert.equal(canViewShop('Head'), true);
  assert.equal(canViewShop('Office Manager'), true);
  assert.equal(canViewShop('Administrator'), true);
  assert.equal(canPurchase('Office Manager'), false);
  assert.equal(hasFullPersonalLedger('Coordinator'), true);
  assert.equal(hasFullPersonalLedger('Head'), false);
});

test('department authorization accepts every explicit Head scope without widening it to the primary membership', () => {
  const principal = {
    userId: 'user-head',
    accountId: 'user-head',
    employeeId: 'employee-head',
    email: 'head@example.test',
    role: 'Head' as const,
    departmentId: 'department-primary',
    departmentIds: ['department-one', 'department-two'],
    sessionId: 'session-head',
  };
  assert.deepEqual(departmentScopeIds(principal), ['department-one', 'department-two']);
  assert.equal(hasDepartmentScope(principal, 'department-one'), true);
  assert.equal(hasDepartmentScope(principal, 'department-two'), true);
  assert.equal(hasDepartmentScope(principal, 'department-primary'), false);
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

test('award eligibility is independent from previous rejected requests', async () => {
  let queryText = '';
  const db = {
    async query(text: string) {
      queryText = text;
      return {
        rowCount: 1,
        rows: [{
          id: 'employee-recipient',
          departmentId: 'department-one',
          departmentIds: ['department-one'],
          name: 'Eligible Recipient',
          title: 'Engineer',
          role: 'Employee',
        }],
      };
    },
  } as unknown as PoolClient;
  const recipients = await listEligibleRecipients(db, {
    userId: 'user-coordinator',
    accountId: 'user-coordinator',
    employeeId: 'employee-coordinator',
    email: 'coordinator@example.test',
    role: 'Coordinator',
    departmentId: 'department-one',
    departmentIds: ['department-one'],
    sessionId: 'session-coordinator',
  }, 'award');

  assert.deepEqual(recipients, [{
    id: 'employee-recipient',
    departmentId: 'department-one',
    departmentIds: ['department-one'],
    name: 'Eligible Recipient',
    title: 'Engineer',
    role: 'Employee',
  }]);
  assert.doesNotMatch(queryText, /award_requests|quota_reservations/i);
});
