import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { sparkService } from '../src/services/sparkService.ts';
import { BLUE_CATEGORIES, RECOGNITION_CATEGORIES, YELLOW_CATEGORIES } from '../src/constants/app.ts';
import { calculateBalances, calculateLifetimeEarnings, conversionRule, evaluationReward, isQualityGateActive, kpiReward, performanceThresholdValidationIssue, recognitionQuota } from '../src/utils/sparkRules.ts';
import { isValidIsoDate, quarterForDate, quarterOrder } from '../src/utils/quarter.ts';
import { parseCsv } from '../src/utils/parseCsv.ts';
import { selectAwardTargets, selectPendingDepartmentDisenchantRequests, selectPendingRequests, selectTeamMembers } from '../src/models/selectors.ts';

const ADMIN = 'emp-ida';
const HEAD = 'emp-maya';
const NOW = new Date('2026-08-31T12:00:00.000Z');
const csv = (text) => ({ name: 'performance.csv', text: async () => text });
const snapshot = () => sparkService.getSnapshot();
const award = (employeeId, sparkType, category) => ({ employeeId, sparkType, category, description: 'A verified contribution with measurable impact.' });
const recognition = (recipientId = 'emp-nora') => ({ recipientId, category: RECOGNITION_CATEGORIES[0], description: 'Shared a useful engineering walkthrough.' });
let employeeSequence = 0;
async function addEmployee(overrides = {}) {
  employeeSequence += 1;
  const name = `Test Employee ${employeeSequence}`;
  const result = await sparkService.saveReference(ADMIN, { kind: 'employees', data: { id: '', name, initials: 'TE', title: 'Engineer', email: `test-${employeeSequence}@c-job.test`, departmentId: 'dep-eng', role: 'Employee', active: true, hasCoordinationExperience: false, ...overrides } });
  return result.employees.find((employee) => employee.name === (overrides.name ?? name));
}
async function updateEmployee(id, patch) {
  const state = await snapshot();
  return sparkService.saveReference(ADMIN, { kind: 'employees', data: { ...state.employees.find((employee) => employee.id === id), ...patch } });
}
async function updateCategory(id, patch) {
  const state = await snapshot();
  return sparkService.saveReference(ADMIN, { kind: 'categories', data: { ...state.categories.find((category) => category.id === id), ...patch } });
}

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: NOW });
  mock.method(globalThis, 'setTimeout', (callback) => { queueMicrotask(callback); return 0; });
  employeeSequence = 0;
  sparkService.reset();
});
afterEach(() => { mock.restoreAll(); mock.timers.reset(); });

test('KPI thresholds retain exact boundary values', () => {
  assert.deepEqual([0, 1.019, 1.02, 1.069, 1.07, 1.119, 1.12, 2, NaN, Infinity, -1].map(kpiReward), [0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 0]);
});
test('Personal cards reward thresholds retain exact boundary values', () => {
  assert.deepEqual([0, 3.49, 3.5, 4.19, 4.2, 4.49, 4.5, 5, NaN, -1].map(evaluationReward), [0, 0, 1, 1, 2, 2, 3, 3, 0, 0]);
});
test('Performance reward helpers accept admin-configured thresholds', () => {
  const kpi = [
    { minimum: 0.8, reward: 2 },
    { minimum: 1, reward: 4 },
    { minimum: 1.2, reward: 7 },
  ];
  const personalCards = [
    { minimum: 2.5, reward: 1 },
    { minimum: 3.5, reward: 3 },
    { minimum: 4.5, reward: 6 },
  ];
  assert.equal(kpiReward(1.1, kpi), 4);
  assert.equal(evaluationReward(4.7, personalCards), 6);
});
test('Admin performance settings update the workspace snapshot and future CSV previews', async () => {
  const performanceThresholds = {
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
  const state = await sparkService.updateSettings(ADMIN, { performanceThresholds });
  assert.deepEqual(state.settings.performanceThresholds, performanceThresholds);
  const preview = await sparkService.previewImport('KPI', 'Q1 2032', csv('Name,KPI\nAlex Stone,1.10'), ADMIN);
  assert.equal(preview.rows[0].reward, 4);
});
test('Rules validation explains the exact descending reward tier', () => {
  assert.equal(performanceThresholdValidationIssue({
    kpi: [
      { minimum: 1.02, reward: 1 },
      { minimum: 1.07, reward: 15 },
      { minimum: 1.12, reward: 3 },
    ],
    personalCards: [
      { minimum: 3.5, reward: 1 },
      { minimum: 4.2, reward: 2 },
      { minimum: 4.5, reward: 3 },
    ],
  }), 'KPI Tier 3: White reward cannot be lower than Tier 2.');
});
test('Demo and API contracts expose the complete role-specific category catalog', async () => {
  const categories = (await snapshot()).categories;
  const count = (sparkType, usageType) => categories.filter((category) =>
    category.active && category.sparkType === sparkType && category.usageType === usageType).length;
  assert.equal(count('White', 'PeerRecognition'), 11);
  assert.equal(count('White', 'Award'), 11);
  assert.equal(count('Yellow', 'Award'), 10);
  assert.equal(count('Blue', 'Award'), 6);
});
test('Dates reject impossible days and quarters sort chronologically', () => {
  assert.equal(isValidIsoDate('2028-02-29'), true);
  for (const value of ['2026-02-29', '2026-02-31', '2026-99-99', '2026-1-01']) assert.equal(isValidIsoDate(value), false);
  assert.equal(quarterForDate('2026-09-30T23:59:59Z'), 'Q3 2026');
  assert.equal(quarterForDate('2026-10-01T00:00:00Z'), 'Q4 2026');
  assert.ok(quarterOrder('Q1 2027') > quarterOrder('Q4 2026'));
});
test('Quality Gate is inclusive and respects cancellation', () => {
  const gate = { employeeId: 'e', status: 'Active', startDate: '2026-08-20', endDate: '2026-08-31' };
  assert.equal(isQualityGateActive('e', [gate], '2026-08-20'), true);
  assert.equal(isQualityGateActive('e', [gate], '2026-08-31'), true);
  assert.equal(isQualityGateActive('e', [gate], '2026-09-01'), false);
  assert.equal(isQualityGateActive('e', [{ ...gate, status: 'Cancelled' }], '2026-08-25'), false);
});
test('CSV supports BOM, semicolons, quoted delimiters and escaped quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFName;KPI\r\n"Stone, Alex";1,09'), [['Name', 'KPI'], ['Stone, Alex', '1,09']]);
  assert.deepEqual(parseCsv('Name,KPI\n"Alex ""A"" Stone",1.12'), [['Name', 'KPI'], ['Alex "A" Stone', '1.12']]);
  assert.throws(() => parseCsv('Name,KPI\n"Alex,1.09'), /unclosed/);
  assert.throws(() => parseCsv('Name,KPI'), /at least one/);
});
test('Snapshot mutations never modify service data', async () => {
  const state = await snapshot();
  state.employees[0].name = 'Tampered';
  assert.equal((await snapshot()).employees[0].name, 'Alex Stone');
});
test('Seed balances use signed completed Ledger transactions', async () => {
  const state = await snapshot();
  assert.deepEqual(calculateBalances(state.transactions, 'emp-alex'), { White: 18, Yellow: 7, Blue: 2, Radiant: 1 });
  assert.deepEqual(state.departmentBalances['emp-alex'], { White: 18, Yellow: 7, Blue: 2, Radiant: 1 });
});
test('Reward Shop debits sync into the existing Spark ledger exactly once', async () => {
  const transaction = {
    id: 'transaction-native-sparks-test',
    sparkType: 'White',
    amount: -4,
    transactionType: 'purchase',
    relatedPurchaseId: 'purchase-native-sparks-test',
    description: 'Purchase: Mission Reroll',
    createdAt: '2026-08-30T10:30:00.000Z',
  };
  await sparkService.syncShopTransactions('emp-alex', [transaction]);
  const state = await sparkService.syncShopTransactions('emp-alex', [transaction]);
  assert.equal(calculateBalances(state.transactions, 'emp-alex').White, 14);
  assert.equal(state.transactions.filter((item) => item.id === `shop-${transaction.id}`).length, 1);
  assert.equal(state.transactions.find((item) => item.id === `shop-${transaction.id}`).source, 'Reward Shop');
});
test('Award categories contain explicit criteria while Radiant uses a free reason', async () => {
  const state = await snapshot();
  const yellow = state.categories.filter((category) => category.sparkType === 'Yellow');
  const blue = state.categories.filter((category) => category.sparkType === 'Blue');
  assert.equal(yellow.length, 10);
  assert.equal(new Set(yellow.map((category) => category.description)).size, yellow.length);
  assert.match(yellow.find((category) => category.id === 'yellow-checklist').description, /project folder.*at least one month/i);
  assert.equal(blue.length, 6);
  assert.equal(blue.find((category) => category.name === 'Cross-department System / Process / Toolkit').amount, 2);
  assert.equal(state.categories.some((category) => category.sparkType === 'Radiant'), false);
  await assert.rejects(
    sparkService.saveReference(ADMIN, {
      kind: 'categories',
      data: { id: '', name: 'Fixed Radiant reason', description: '', sparkType: 'Radiant', amount: 1, period: 'Unrestricted', active: true },
    }),
    /valid Spark type/i,
  );
});
test('Administrator category amounts affect future awards without rewriting earlier rewards', async () => {
  const category = BLUE_CATEGORIES.find((name) => name === 'International Conference Representation');
  const first = await sparkService.createAward(HEAD, 'Head', award('emp-alex', 'Blue', category));
  const definition = (await snapshot()).categories.find(
    (item) => item.sparkType === 'Blue' && item.name === category,
  );
  await updateCategory(definition.id, { amount: 3 });
  const second = await sparkService.createAward(HEAD, 'Head', award('emp-nora', 'Blue', category));
  assert.equal(first.request.amount, 1);
  assert.equal(second.request.amount, 3);
  assert.equal((await snapshot()).awardRequests.find((request) => request.id === first.request.id).amount, 1);
  await assert.rejects(updateCategory(definition.id, { amount: 101 }), /1 to 100/);

  const peerDefinition = (await snapshot()).categories.find(
    (item) => item.sparkType === 'White' && item.usageType === 'PeerRecognition',
  );
  await updateCategory(peerDefinition.id, { amount: 2 });

  const whiteCategory = RECOGNITION_CATEGORIES[0];
  const firstWhiteRecipient = await addEmployee();
  const secondWhiteRecipient = await addEmployee();
  const firstWhite = await sparkService.createAward(
    HEAD,
    'Head',
    award(firstWhiteRecipient.id, 'White', whiteCategory),
  );
  const whiteDefinition = (await snapshot()).categories.find(
    (item) => item.sparkType === 'White' && item.usageType === 'Award' && item.name === whiteCategory,
  );
  await updateCategory(whiteDefinition.id, { amount: 2 });
  const secondWhite = await sparkService.createAward(
    HEAD,
    'Head',
    award(secondWhiteRecipient.id, 'White', whiteCategory),
  );
  assert.equal(firstWhite.request.amount, 1);
  assert.equal(secondWhite.request.amount, 2);
  assert.equal(
    (await snapshot()).awardRequests.find((request) => request.id === firstWhite.request.id).amount,
    1,
  );

  await sparkService.reviewRecognition('rec-002', 'Rejected', 'Replaced by a new request.', HEAD);
  const peerRecognition = await sparkService.createRecognition(
    'emp-alex',
    'Employee',
    recognition(secondWhiteRecipient.id),
  );
  const afterApproval = await sparkService.reviewRecognition(
    peerRecognition.recognition.id,
    'Approved',
    '',
    HEAD,
  );
  assert.equal(
    afterApproval.transactions.find(
      (transaction) => transaction.relatedRequestId === peerRecognition.recognition.id,
    ).amount,
    2,
  );
});
test('Lifetime earnings count recognition credits without double-counting conversions', async () => {
  const before = calculateLifetimeEarnings((await snapshot()).transactions, 'emp-alex');
  await sparkService.convert('emp-alex', 'White', 10);
  await sparkService.disenchant('emp-alex', 'Yellow', 1);
  assert.deepEqual(calculateLifetimeEarnings((await snapshot()).transactions, 'emp-alex'), before);
});
test('Lifetime earnings net append-only performance import corrections', () => {
  const rows = [
    { employeeId: 'e', sparkType: 'White', amount: 3, source: 'KPI', status: 'Completed' },
    { employeeId: 'e', sparkType: 'White', amount: -3, source: 'KPI Correction', status: 'Completed' },
    { employeeId: 'e', sparkType: 'White', amount: 1, source: 'KPI', status: 'Completed' },
  ];
  assert.deepEqual(calculateLifetimeEarnings(rows, 'e'), { White: 1, Yellow: 0, Blue: 0, Radiant: 0 });
});
test('Coordinator quota counts unique active colleagues in shared project teams only', async () => {
  let state = await snapshot();
  assert.equal(recognitionQuota('emp-sam', 'Coordinator', state.settings, state.employees, state.projectTeams), 2);
  await addEmployee({ departmentId: 'dep-ops' });
  state = await snapshot();
  assert.equal(recognitionQuota('emp-sam', 'Coordinator', state.settings, state.employees, state.projectTeams), 2);
  state = await updateEmployee('emp-nora', { active: false });
  assert.equal(recognitionQuota('emp-sam', 'Coordinator', state.settings, state.employees, state.projectTeams), 1);
});
test('Peer Recognition blocks self and Admin recipients but allows cross-department colleagues', async () => {
  await assert.rejects(sparkService.createRecognition('emp-alex', 'Employee', recognition('emp-alex')), /Self-recognition/);
  await assert.rejects(sparkService.createRecognition('emp-alex', 'Employee', recognition('emp-ida')), /eligible/);
  await assert.rejects(sparkService.createRecognition('emp-alex', 'Employee', recognition('emp-maya')), /eligible/);
  await assert.rejects(sparkService.createRecognition('emp-alex', 'Employee', recognition('emp-victor')), /eligible/);
  await sparkService.reviewRecognition('rec-002', 'Rejected', 'Needs a specific contribution.', HEAD);
  const result = await sparkService.createRecognition('emp-alex', 'Employee', recognition('emp-daniel'));
  assert.equal(result.recognition.status, 'Pending');
  assert.equal(Object.hasOwn(result.recognition, 'projectId'), false);
});
test('Head cannot create Peer Recognition and sees created department disenchant requests', async () => {
  await assert.rejects(
    sparkService.createRecognition(HEAD, 'Head', recognition('emp-alex')),
    /active role cannot perform this action/,
  );
  await sparkService.disenchant('emp-alex', 'White', 1);
  const state = await snapshot();
  const requests = selectPendingDepartmentDisenchantRequests(state, HEAD, 'Head');
  assert.ok(requests.length > 0);
  assert.ok(requests.every((request) => request.departmentId === 'dep-eng' && request.status === 'Created'));
  assert.equal(selectPendingDepartmentDisenchantRequests(state, 'emp-victor', 'GPM').length, 0);
});
test('Pending nominations reserve quota; rejection releases it', async () => {
  await assert.rejects(sparkService.createRecognition('emp-alex', 'Employee', recognition()), /allocation/);
  await sparkService.reviewRecognition('rec-002', 'Rejected', 'Needs a specific contribution.', HEAD);
  const result = await sparkService.createRecognition('emp-alex', 'Employee', recognition());
  assert.equal(result.recognition.status, 'Pending');
});
test('White approval under a Gate changes neither request nor Ledger', async () => {
  const before = await snapshot();
  await assert.rejects(sparkService.reviewRecognition('rec-002', 'Approved', '', HEAD), /Quality Gate/);
  assert.deepEqual(await snapshot(), before);
});
test('Approved recognition creates one Ledger row and an achievement exactly once', async () => {
  await sparkService.toggleQualityGate('emp-nora', HEAD);
  const before = await snapshot();
  const next = await sparkService.reviewRecognition('rec-002', 'Approved', '', HEAD);
  assert.equal(next.transactions.length, before.transactions.length + 1);
  assert.equal(next.achievements.length, before.achievements.length + 1);
  assert.equal(next.transactions[0].categoryId, next.recognitions.find((item) => item.id === 'rec-002').categoryId);
  await assert.rejects(sparkService.reviewRecognition('rec-002', 'Approved', '', HEAD), /no longer pending/);
});
test('Head can reject inactive-recipient requests and release their reservations', async () => {
  await updateEmployee('emp-nora', { active: false });
  const state = await sparkService.reviewRecognition('rec-002', 'Rejected', 'Employee left the team.', HEAD);
  assert.equal(state.recognitions.find((item) => item.id === 'rec-002').status, 'Rejected');
});
test('Department and role scopes are checked in the service', async () => {
  await assert.rejects(sparkService.reviewRecognition('rec-002', 'Approved', '', 'emp-olivia'), /department scope/);
  await assert.rejects(sparkService.createAward(ADMIN, 'Head', award('emp-alex', 'White', RECOGNITION_CATEGORIES[0])), /active role/);
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award('emp-daniel', 'Blue', BLUE_CATEGORIES[1])), /department/);
});
test('Award recipient selectors enforce economy roles, scope and no self-awards', async () => {
  const state = await snapshot();
  const coordinator = selectAwardTargets(state, 'emp-sam', 'Coordinator');
  assert.ok(coordinator.every((employee) => ['Employee', 'Coordinator'].includes(employee.role)));
  assert.equal(coordinator.some((employee) => employee.id === 'emp-sam'), false);
  assert.equal(coordinator.some((employee) => employee.id === 'emp-maya'), false);

  const gpm = selectAwardTargets(state, 'emp-elena', 'GPM');
  assert.ok(gpm.every((employee) => ['Employee', 'Coordinator'].includes(employee.role)));
  assert.equal(gpm.some((employee) => employee.id === 'emp-elena'), false);

  const head = selectAwardTargets(state, HEAD, 'Head');
  assert.ok(head.every((employee) =>
    employee.departmentId === 'dep-eng' && ['Employee', 'Coordinator'].includes(employee.role)));
  assert.equal(head.some((employee) => employee.id === HEAD), false);

  const top = selectAwardTargets(state, 'emp-victor', 'Top Management');
  assert.equal(top.some((employee) => employee.id === 'emp-victor'), false);
  assert.equal(top.some((employee) => employee.role === 'Administrator'), false);
  assert.equal(top.some((employee) => employee.role === 'Head'), true);
});
test('Calendar rollover resets quota selection without allowing unlimited submissions', async () => {
  mock.timers.setTime(new Date('2026-10-01T12:00:00Z').getTime());
  await sparkService.createRecognition('emp-sam', 'Coordinator', recognition('emp-alex'));
  await sparkService.createRecognition('emp-sam', 'Coordinator', recognition('emp-daniel'));
  await assert.rejects(sparkService.createRecognition('emp-sam', 'Coordinator', recognition('emp-alex')), /allocation/);
  assert.equal((await snapshot()).settings.currentQuarter, 'Q4 2026');
});
test('Direct Yellow cap is unchanged by spending or conversion', async () => {
  await sparkService.convert('emp-alex', 'White', 10);
  await sparkService.disenchant('emp-alex', 'Yellow', 8);
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award('emp-alex', 'Yellow', YELLOW_CATEGORIES[0].label)), /quarterly limit/);
});
test('Yellow request reserves its category and approval creates the configured amount', async () => {
  const employeeId = 'emp-nora';
  await sparkService.reviewAward('award-001', 'Rejected', 'Replace the seeded request for this test.', HEAD);
  const beforeYellow = calculateBalances((await snapshot()).transactions, employeeId).Yellow;
  const input = award(employeeId, 'Yellow', YELLOW_CATEGORIES[0].label);
  const result = await sparkService.createAward('emp-elena', 'GPM', input);
  assert.equal(result.request.status, 'Pending');
  await assert.rejects(sparkService.createAward('emp-elena', 'GPM', input), /already awarded or pending/);
  const state = await sparkService.reviewAward(result.request.id, 'Approved', '', HEAD);
  assert.equal(calculateBalances(state.transactions, employeeId).Yellow, beforeYellow + 1);
  assert.ok(state.achievements.some((item) => item.employeeId === employeeId && item.title === input.category));
});
test('Coordinator awards require a shared project with worked hours while the team view remains departmental', async () => {
  const employee = await addEmployee({ departmentId: 'dep-ops' });
  await assert.rejects(sparkService.createAward('emp-sam', 'Coordinator', award(employee.id, 'Yellow', YELLOW_CATEGORIES[0].label)), /shared active project/);
  await sparkService.reviewAward('award-001', 'Rejected', 'Replace the seeded request for this test.', HEAD);
  const projectColleague = await sparkService.createAward('emp-sam', 'Coordinator', award('emp-nora', 'Yellow', YELLOW_CATEGORIES[0].label));
  assert.equal(projectColleague.request.status, 'Pending');
  const state = await snapshot();
  assert.equal(selectTeamMembers(state, 'emp-sam', 'Coordinator').some((item) => item.id === employee.id), true);
  assert.equal(selectAwardTargets(state, 'emp-sam', 'Coordinator').some((item) => item.id === employee.id), false);
  assert.equal(selectAwardTargets(state, 'emp-sam', 'Coordinator').some((item) => item.id === 'emp-maya'), false);
  assert.equal(selectAwardTargets(state, 'emp-elena', 'GPM').some((item) => item.id === employee.id), false);
  await assert.rejects(
    sparkService.createAward('emp-elena', 'GPM', award(employee.id, 'Yellow', YELLOW_CATEGORIES[0].label)),
    /eligible|scope|target/i,
  );
  const result = await sparkService.createAward('emp-elena', 'GPM', award('emp-sam', 'Yellow', YELLOW_CATEGORIES[0].label));
  assert.equal(result.request.status, 'Pending');
});
test('GPM can request White awards using the controlled Coordinator quota', async () => {
  const first = await sparkService.createAward('emp-elena', 'GPM', award('emp-alex', 'White', RECOGNITION_CATEGORIES[0]));
  assert.equal(first.request.status, 'Pending');
  await assert.rejects(
    sparkService.createAward('emp-elena', 'GPM', award('emp-nora', 'White', RECOGNITION_CATEGORIES[1])),
    /allocation is used or reserved \(1\/1\)/,
  );
  await sparkService.reviewAward(first.request.id, 'Rejected', 'Use a stronger example.', HEAD);
  const released = await sparkService.createAward('emp-elena', 'GPM', award('emp-nora', 'White', RECOGNITION_CATEGORIES[1]));
  assert.equal(released.request.status, 'Pending');
});
test('First acting-lead award rejects prior coordination experience', async () => {
  const employee = await addEmployee({ hasCoordinationExperience: true });
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award(employee.id, 'Yellow', YELLOW_CATEGORIES[8].label)), /already has coordination/);
});
test('Stable Blue category IDs survive rename; a distinct category can reuse the old name', async () => {
  const employee = await addEmployee();
  const originalName = BLUE_CATEGORIES[3];
  await sparkService.createAward(HEAD, 'Head', award(employee.id, 'Blue', originalName));
  await updateCategory('blue-3', { name: 'Renamed engineering standards' });
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award(employee.id, 'Blue', 'Renamed engineering standards')), /already awarded/);
  await sparkService.saveReference(ADMIN, { kind: 'categories', data: { id: '', name: originalName, description: 'A distinct category', sparkType: 'Blue', amount: 1, period: 'Yearly', active: true } });
  const result = await sparkService.createAward(HEAD, 'Head', award(employee.id, 'Blue', originalName));
  assert.equal(calculateBalances(result.snapshot.transactions, employee.id).Blue, 2);
});
test('Blue quarterly, yearly and one-time periods use their configured window', async () => {
  const employee = await addEmployee();
  await updateCategory('blue-2', { period: 'Quarterly' });
  await sparkService.createAward(HEAD, 'Head', award(employee.id, 'Blue', BLUE_CATEGORIES[2]));
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award(employee.id, 'Blue', BLUE_CATEGORIES[2])), /quarterly/);
  mock.timers.setTime(new Date('2026-10-01T12:00:00Z').getTime());
  await sparkService.createAward(HEAD, 'Head', award(employee.id, 'Blue', BLUE_CATEGORIES[2]));
  await updateCategory('blue-2', { period: 'One-time' });
  mock.timers.setTime(new Date('2027-01-01T12:00:00Z').getTime());
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award(employee.id, 'Blue', BLUE_CATEGORIES[2])), /one-time/);
});
test('Employee of the Year has zero slots below ten active department employees', async () => {
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award('emp-nora', 'Blue', BLUE_CATEGORIES[0])), /quota is 0/);
});
test('Employee of the Year usage remains consumed after the recipient leaves', async () => {
  const people = [];
  for (let index = 0; index < 8; index += 1) people.push(await addEmployee());
  await sparkService.createAward(HEAD, 'Head', award(people[0].id, 'Blue', BLUE_CATEGORIES[0]));
  await updateEmployee(people[0].id, { active: false });
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award(people[1].id, 'Blue', BLUE_CATEGORIES[0])), /quota is 1/);
});
test('Radiant is Top Management only and cannot be converted or disenchanted', async () => {
  await assert.rejects(sparkService.createAward(HEAD, 'Head', award('emp-alex', 'Radiant', 'Exceptional Company Impact')), /reserved for Top/);
  const result = await sparkService.createAward('emp-victor', 'Top Management', award('emp-alex', 'Radiant', 'Exceptional Company Impact'));
  assert.equal(calculateBalances(result.snapshot.transactions, 'emp-alex').Radiant, 2);
  await assert.rejects(sparkService.createAward('emp-victor', 'Top Management', award('emp-alex', 'Radiant', '')), /reason/i);
  await assert.rejects(sparkService.convert('emp-alex', 'Radiant', 1), /cannot be converted|Only White/i);
  await assert.rejects(sparkService.disenchant('emp-alex', 'Radiant', 1), /Radiant|permanent/);
});
test('Conversion debits the requested exchange amount plus a separate fee', async () => {
  const result = await sparkService.convert('emp-alex', 'White', 10);
  assert.equal(result.output, 1);
  assert.equal(result.to, 'Yellow');
  assert.deepEqual(calculateBalances(result.snapshot.transactions, 'emp-alex'), { White: 7, Yellow: 8, Blue: 2, Radiant: 1 });
  const [credit, debit] = result.snapshot.transactions;
  assert.equal(credit.relatedRequestId, debit.relatedRequestId);
  assert.equal(credit.amount, 1);
  assert.equal(debit.amount, -11);
  assert.equal(result.fee, 1);
  assert.equal(result.totalDebited, 11);
  assert.match(debit.description, /10 White plus a 1 White fee/);
  await assert.rejects(sparkService.convert('emp-alex', 'White', 9), /multiple/);
  await assert.rejects(sparkService.convert('emp-alex', 'White', 20), /available/i);
});
test('Disenchant debits immediately and snapshots accounting terms', async () => {
  const result = await sparkService.disenchant('emp-alex', 'White', 2);
  assert.equal(result.request.moneyValue, 1.6);
  assert.equal(result.request.departmentId, 'dep-eng');
  assert.equal(result.request.accountingPeriod, '2026-08');
  assert.equal(calculateBalances(result.snapshot.transactions, 'emp-alex').White, 16);
  await sparkService.updateSettings(ADMIN, { disenchantRate: 0.5 });
  assert.equal((await snapshot()).disenchantRequests.find((item) => item.id === result.request.id).rate, 0.8);
  await assert.rejects(sparkService.disenchant('emp-alex', 'White', 0.5), /whole|integer/i);
});
test('Administrator exports created Disenchant requests and only then marks them paid', async () => {
  const created = await sparkService.disenchant('emp-alex', 'White', 1);
  const exported = await sparkService.exportDisenchantRequests(ADMIN, [created.request.id], 'QA-DEMO-EXPORT');
  assert.match(exported.csv, new RegExp(created.request.id));
  assert.equal(exported.snapshot.disenchantRequests.find((item) => item.id === created.request.id).status, 'Exported');
  const paid = await sparkService.markDisenchantPaid(ADMIN, created.request.id);
  assert.equal(paid.disenchantRequests.find((item) => item.id === created.request.id).status, 'Paid');
  await assert.rejects(sparkService.markDisenchantPaid(ADMIN, created.request.id), /Only an exported/);
});
test('Head can repeatedly export every department Disenchant request for a selected month', async () => {
  const created = await sparkService.disenchant('emp-alex', 'White', 1);
  const result = await sparkService.createMonthlyDisenchantReport(HEAD, '2026-08');
  assert.equal(result.report.reportMonth, '2026-08');
  assert.equal(result.report.itemCount, 1);
  assert.equal(result.report.lines[0].employeeName, 'Alex Stone');
  assert.equal(result.snapshot.disenchantRequests.find((item) => item.id === created.request.id).status, 'Exported');
  const repeated = await sparkService.createMonthlyDisenchantReport(HEAD, '2026-08');
  assert.equal(repeated.report.id, result.report.id);
  assert.equal(repeated.report.itemCount, 1);
  const next = await sparkService.disenchant('emp-alex', 'White', 1);
  const refreshed = await sparkService.createMonthlyDisenchantReport(HEAD, '2026-08');
  assert.equal(refreshed.report.id, result.report.id);
  assert.equal(refreshed.report.itemCount, 2);
  assert.equal(refreshed.snapshot.disenchantRequests.find((item) => item.id === next.request.id).status, 'Exported');
  await assert.rejects(sparkService.createMonthlyDisenchantReport(HEAD, '2026-09'), /future month/);
  await assert.rejects(sparkService.createMonthlyDisenchantReport('emp-alex', '2026-08'), /role cannot perform/i);
});
test('Quality Gates validate real dates and allow future scheduling', async () => {
  const employee = await addEmployee();
  await assert.rejects(sparkService.toggleQualityGate(employee.id, HEAD, { startDate: '2026-02-31', endDate: '2026-99-99', reason: 'Invalid period' }), /valid dates/);
  await assert.rejects(sparkService.toggleQualityGate(employee.id, HEAD, { startDate: '2026-08-30', endDate: '2026-09-05', reason: 'Retroactive review' }), /not in the past/);
  const state = await sparkService.toggleQualityGate(employee.id, HEAD, { startDate: '2026-09-01', endDate: '2026-09-05', reason: 'Planned review' });
  assert.equal(isQualityGateActive(employee.id, state.qualityGates), false);
  mock.timers.setTime(new Date('2026-09-01T12:00:00Z').getTime());
  assert.equal(isQualityGateActive(employee.id, state.qualityGates), true);
});
test('CSV preview uses uploaded content, exact raw thresholds and current Gates', async () => {
  const employee = await addEmployee();
  const preview = await sparkService.previewImport('KPI', 'Q3 2026', csv(`Name,KPI\n${employee.name},1.069\nNora Ibrahim,1.12`), ADMIN);
  assert.equal(preview.rows[0].reward, 1);
  assert.equal(preview.rows[0].value, 1.069);
  assert.equal(preview.rows[1].status, 'Blocked');
  const state = await sparkService.confirmImport(preview, ADMIN, false);
  assert.equal(calculateBalances(state.transactions, employee.id).White, 1);
  assert.equal(state.performance.find((item) => item.employeeId === 'emp-nora').kpi, 1.12);
  assert.equal(state.performance.find((item) => item.employeeId === 'emp-nora').kpiReward, 0);
});
test('CSV blocks unknown users, invalid values, duplicate employees and malformed row widths', async () => {
  const preview = await sparkService.previewImport('KPI', 'Q3 2026', csv('Name,KPI\nMissing Person,1.1\nAlex Stone,nope\nAlex Stone,1.12\nNora Ibrahim,1,09'), ADMIN);
  assert.equal(preview.employeesNotFound, 1);
  assert.equal(preview.invalidValues, 3);
  await assert.rejects(sparkService.confirmImport(preview, ADMIN, false), /blocking import errors/);
});
test('Personal cards reward imports reject values over five', async () => {
  const preview = await sparkService.previewImport('Evaluation', 'Q3 2026', csv('Name,Average Quarter Mark\nAlex Stone,5.1'), ADMIN);
  assert.equal(preview.invalidValues, 1);
});
test('Import previews cannot be tampered with or replayed', async () => {
  const employee = await addEmployee();
  const preview = await sparkService.previewImport('KPI', 'Q3 2026', csv(`Name,KPI\n${employee.name},1.07`), ADMIN);
  preview.rows[0].reward = 900;
  preview.rows[0].value = 99;
  const state = await sparkService.confirmImport(preview, ADMIN, false);
  assert.equal(calculateBalances(state.transactions, employee.id).White, 2);
  await assert.rejects(sparkService.confirmImport(preview, ADMIN, false), /already imported/);
});
test('Zero-reward imports still occupy Employee + Source + Quarter keys', async () => {
  const employee = await addEmployee();
  let preview = await sparkService.previewImport('KPI', 'Q3 2026', csv(`Name,KPI\n${employee.name},0`), ADMIN);
  await sparkService.confirmImport(preview, ADMIN, false);
  preview = await sparkService.previewImport('KPI', 'Q3 2026', csv(`Name,KPI\n${employee.name},0`), ADMIN);
  assert.equal(preview.duplicate, true);
  await assert.rejects(sparkService.confirmImport(preview, ADMIN, false), /already has KPI/);
});
test('Repeated replacement is append-only, idempotent by net reward and keeps source history', async () => {
  const employee = await addEmployee();
  const first = await sparkService.previewImport('KPI', 'Q3 2026', csv(`Name,KPI\n${employee.name},1.12`), ADMIN);
  const original = await sparkService.confirmImport(first, ADMIN, false);
  const originalRow = original.transactions[0];
  for (let index = 0; index < 2; index += 1) {
    const preview = await sparkService.previewImport('KPI', 'Q3 2026', csv(`Name,KPI\n${employee.name},1.07`), ADMIN);
    await sparkService.confirmImport(preview, ADMIN, true);
  }
  const state = await snapshot();
  assert.equal(calculateBalances(state.transactions, employee.id).White, 2);
  assert.deepEqual(state.transactions.find((item) => item.id === originalRow.id), originalRow);
  assert.equal(state.transactions.filter((item) => item.employeeId === employee.id && item.source === 'KPI Correction').length, 2);
});
test('A replacement that would make any employee negative leaves the entire batch unchanged', async () => {
  const a = await addEmployee();
  const b = await addEmployee();
  const first = await sparkService.previewImport('KPI', 'Q3 2026', csv(`Name,KPI\n${a.name},1.12\n${b.name},1.12`), ADMIN);
  await sparkService.confirmImport(first, ADMIN, false);
  await sparkService.disenchant(b.id, 'White', 3);
  const preview = await sparkService.previewImport('KPI', 'Q3 2026', csv(`Name,KPI\n${a.name},1.07\n${b.name},0`), ADMIN);
  const before = await snapshot();
  await assert.rejects(sparkService.confirmImport(preview, ADMIN, true), /already spent/);
  assert.deepEqual(await snapshot(), before);
});
test('Reference validation protects identity, unique emails, reporting cycles and department integrity', async () => {
  await assert.rejects(updateEmployee('emp-sam', { active: false }), /six demo identities/);
  await assert.rejects(addEmployee({ email: 'alex.stone@c-job.test' }), /email address is already/);
  const a = await addEmployee();
  const b = await addEmployee({ managerId: a.id });
  await assert.rejects(updateEmployee(a.id, { managerId: b.id }), /reporting cycle/);
  const state = await snapshot();
  await assert.rejects(sparkService.saveReference(ADMIN, { kind: 'departments', data: { ...state.departments[0], active: false } }), /active employees/);
});
test('Employees can be deleted while immutable history is preserved', async () => {
  const removable = await addEmployee();
  const removed = await sparkService.deleteEmployee(ADMIN, removable.id);
  assert.equal(removed.employees.some((item) => item.id === removable.id), false);

  const protectedEmployee = await addEmployee();
  const result = await sparkService.createAward(HEAD, 'Head', award(protectedEmployee.id, 'Blue', BLUE_CATEGORIES[2]));
  const history = result.snapshot.transactions.find((item) => item.employeeId === protectedEmployee.id);
  const state = await sparkService.deleteEmployee(ADMIN, protectedEmployee.id);
  assert.equal(state.employees.some((item) => item.id === protectedEmployee.id), false);
  assert.deepEqual(state.transactions.find((item) => item.id === history.id), history);
});
test('Settings validate all numeric and money values and drive conversion', async () => {
  await assert.rejects(sparkService.updateSettings(HEAD, { whiteToYellow: 5 }), /active role/);
  await assert.rejects(sparkService.updateSettings(ADMIN, { whiteToYellow: 0 }), /positive/);
  await assert.rejects(sparkService.updateSettings(ADMIN, { conversionFee: -1 }), /conversion fee/);
  await assert.rejects(sparkService.updateSettings(ADMIN, { sparkMoneyValues: { White: -1, Yellow: 10, Blue: 100 } }), /base value/);
  const state = await sparkService.updateSettings(ADMIN, { whiteToYellow: 5, conversionFee: 1 });
  assert.equal(conversionRule('White', state.settings).ratio, 5);
  assert.equal(conversionRule('White', state.settings).totalCost, 6);
  assert.equal((await sparkService.convert('emp-alex', 'White', 5)).output, 1);
});
test('Queue selectors expose Head department requests and no Admin approval queue', async () => {
  const state = await snapshot();
  const queue = selectPendingRequests(state, HEAD, 'Head');
  assert.ok(queue.recognitions.every((request) => state.employees.find((employee) => employee.id === request.recipientId).departmentId === 'dep-eng'));
  const admin = selectPendingRequests(state, ADMIN, 'Administrator');
  assert.equal(admin.recognitions.length + admin.awards.length, 0);
});
