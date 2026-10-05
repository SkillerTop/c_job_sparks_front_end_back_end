import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { DEMO_PASSWORD } from '../src/data/mockAuthData.ts';
import { AuthServiceError, authService, normalizeEmail, validatePassword } from '../src/services/authService.ts';
import { sparkService } from '../src/services/sparkService.ts';

const ADMIN_EMAIL = 'ida.novak@c-job.test';

beforeEach(() => {
  sparkService.reset();
  authService.resetForTesting();
});

test('email normalization and password rules are deterministic', () => {
  assert.equal(normalizeEmail('  Nora.Ibrahim@C-JOB.TEST '), 'nora.ibrahim@c-job.test');
  assert.equal(validatePassword('weak').valid, false);
  assert.equal(validatePassword('Strong2026').valid, true);
  assert.equal(validatePassword(`Aa1${'x'.repeat(126)}`).valid, false);
});

test('seeded demo accounts are approved and never expose password records', async () => {
  await authService.initialize();
  await authService.login({ email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  const state = await authService.getAccessState();
  const admin = state.accounts.find((account) => account.email === ADMIN_EMAIL);
  assert.equal(admin?.status, 'Approved');
  assert.equal(admin?.source, 'Seed');
  assert.equal(Object.hasOwn(admin ?? {}, 'passwordHash'), false);
  assert.equal(Object.hasOwn(admin ?? {}, 'passwordSalt'), false);
});

test('registration remains pending until an administrator approves it', async () => {
  const registration = await authService.register({
    email: ' Nora.Ibrahim@C-JOB.TEST ',
    password: 'NoraPass2026',
    confirmPassword: 'NoraPass2026',
  });
  assert.equal(registration.status, 'Pending');
  assert.equal(registration.employeeId, 'emp-nora');
  assert.equal((await authService.login({ email: registration.email, password: 'NoraPass2026' })).status, 'Pending');
  assert.equal(await authService.restoreSession(), null);

  await authService.login({ email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  const approved = await authService.reviewRegistration(registration.id, 'Approved');
  assert.equal(approved.status, 'Approved');
  authService.logout();

  await authService.login({ email: registration.email, password: 'NoraPass2026' });
  const user = await authService.restoreSession();
  assert.equal(user?.employeeId, 'emp-nora');
  assert.equal(user?.role, 'Employee');
});

test('rejection requires a reason and a rejected employee can resubmit', async () => {
  const registration = await authService.register({
    email: 'daniel.reed@c-job.test',
    password: 'Daniel2026',
    confirmPassword: 'Daniel2026',
  });
  await authService.login({ email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  await assert.rejects(
    authService.reviewRegistration(registration.id, 'Rejected', 'no'),
    (error) => error instanceof AuthServiceError && error.code === 'INVALID_REVIEW',
  );
  const snapshot = await sparkService.getSnapshot();
  const daniel = snapshot.employees.find((employee) => employee.id === 'emp-daniel');
  await sparkService.saveReference('emp-ida', {
    kind: 'employees',
    data: { ...daniel, active: false },
  });
  const rejected = await authService.reviewRegistration(registration.id, 'Rejected', 'Confirm your directory details.');
  assert.equal(rejected.status, 'Rejected');
  await sparkService.saveReference('emp-ida', {
    kind: 'employees',
    data: { ...daniel, active: true },
  });
  authService.logout();

  await assert.rejects(
    authService.register({
      email: 'daniel.reed@c-job.test',
      password: 'Updated2026',
      confirmPassword: 'Updated2026',
    }),
    (error) => error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );
  const resubmitted = await authService.register({
    email: 'daniel.reed@c-job.test',
    password: 'Daniel2026',
    confirmPassword: 'Daniel2026',
  });
  assert.equal(resubmitted.status, 'Pending');
  assert.equal(resubmitted.rejectionReason, undefined);
  await authService.login({ email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  const actions = (await authService.getAccessState()).auditEvents.map((event) => event.action);
  assert.ok(actions.includes('REGISTRATION_REJECTED'));
  assert.ok(actions.includes('REGISTRATION_RESUBMITTED'));
});

test('a pending request only reopens with its original password', async () => {
  const original = await authService.register({
    email: 'nora.ibrahim@c-job.test',
    password: 'NoraPass2026',
    confirmPassword: 'NoraPass2026',
  });
  await assert.rejects(
    authService.register({
      email: original.email,
      password: 'Different2026',
      confirmPassword: 'Different2026',
    }),
    (error) => error instanceof AuthServiceError && error.code === 'REQUEST_PENDING',
  );
  const reopened = await authService.register({
    email: original.email,
    password: 'NoraPass2026',
    confirmPassword: 'NoraPass2026',
  });
  assert.equal(reopened.id, original.id);
  assert.equal(reopened.status, 'Pending');
});

test('concurrent registrations preserve every request', async () => {
  const inputs = [
    { email: 'nora.ibrahim@c-job.test', password: 'NoraPass2026', confirmPassword: 'NoraPass2026' },
    { email: 'olivia.grant@c-job.test', password: 'Olivia2026', confirmPassword: 'Olivia2026' },
  ];
  const registrations = await Promise.all(inputs.map((input) => authService.register(input)));
  assert.equal(new Set(registrations.map((account) => account.id)).size, 2);

  await authService.login({ email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  const access = await authService.getAccessState();
  assert.equal(
    access.accounts.filter((account) => registrations.some((registration) => registration.id === account.id)).length,
    2,
  );
});

test('logging out while a session restore is running cannot revive the user', async () => {
  await authService.login({ email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  const restoring = authService.restoreSession();
  await new Promise((resolve) => setTimeout(resolve, 10));
  authService.logout();
  assert.equal(await restoring, null);
  assert.equal(await authService.restoreSession(), null);
});

test('an expired demo session fails closed', async () => {
  await authService.login({ email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  const expiry = authService.getSessionExpiry();
  assert.equal(typeof expiry, 'number');
  const realNow = Date.now;
  Date.now = () => expiry + 1;
  try {
    assert.equal(await authService.restoreSession(), null);
    await assert.rejects(
      authService.assertActiveSession('emp-ida'),
      (error) => error instanceof AuthServiceError && error.code === 'NOT_AUTHORIZED',
    );
  } finally {
    Date.now = realNow;
  }
});

test('access state requires an active administrator session', async () => {
  await authService.initialize();
  await assert.rejects(
    authService.getAccessState(),
    (error) => error instanceof AuthServiceError && error.code === 'NOT_AUTHORIZED',
  );
  await authService.login({ email: 'alex.stone@c-job.test', password: DEMO_PASSWORD });
  await assert.rejects(
    authService.getAccessState(),
    (error) => error instanceof AuthServiceError && error.code === 'NOT_AUTHORIZED',
  );
});

test('a directory email change fails closed instead of transferring the old password', async () => {
  const registration = await authService.register({
    email: 'nora.ibrahim@c-job.test',
    password: 'NoraPass2026',
    confirmPassword: 'NoraPass2026',
  });
  await authService.login({ email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  await authService.reviewRegistration(registration.id, 'Approved');
  let guardedSaveRan = false;
  await assert.rejects(
    authService.withEmployeeIdentityGuard(
      'emp-nora',
      'nora.updated@c-job.test',
      async () => {
        guardedSaveRan = true;
      },
    ),
    (error) => error instanceof AuthServiceError && error.code === 'INVALID_REVIEW',
  );
  assert.equal(guardedSaveRan, false);
  const snapshot = await sparkService.getSnapshot();
  const nora = snapshot.employees.find((employee) => employee.id === 'emp-nora');
  await sparkService.saveReference('emp-ida', {
    kind: 'employees',
    data: { ...nora, email: 'nora.updated@c-job.test' },
  });
  authService.logout();

  await assert.rejects(
    authService.login({ email: 'nora.ibrahim@c-job.test', password: 'NoraPass2026' }),
    (error) => error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );
  await assert.rejects(
    authService.login({ email: 'nora.updated@c-job.test', password: 'NoraPass2026' }),
    (error) => error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );
});

test('unknown directory emails and incorrect passwords are rejected', async () => {
  await assert.rejects(
    authService.register({
      email: 'outside@example.com',
      password: 'Outside2026',
      confirmPassword: 'Outside2026',
    }),
    (error) => error instanceof AuthServiceError && error.code === 'DIRECTORY_NOT_FOUND',
  );
  await assert.rejects(
    authService.login({ email: ADMIN_EMAIL, password: 'wrong-password' }),
    (error) => error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );
});

test('a signed-in employee can replace their password after current-password verification', async () => {
  await authService.login({ email: 'alex.stone@c-job.test', password: DEMO_PASSWORD });
  await assert.rejects(
    authService.changePassword('emp-alex', {
      currentPassword: 'Incorrect2026',
      newPassword: 'UpdatedPass2026',
      confirmPassword: 'UpdatedPass2026',
    }),
    (error) => error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );
  await authService.changePassword('emp-alex', {
    currentPassword: DEMO_PASSWORD,
    newPassword: 'UpdatedPass2026',
    confirmPassword: 'UpdatedPass2026',
  });
  authService.logout();
  await assert.rejects(
    authService.login({ email: 'alex.stone@c-job.test', password: DEMO_PASSWORD }),
    (error) => error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS',
  );
  assert.equal(
    (await authService.login({ email: 'alex.stone@c-job.test', password: 'UpdatedPass2026' })).status,
    'Approved',
  );
});
