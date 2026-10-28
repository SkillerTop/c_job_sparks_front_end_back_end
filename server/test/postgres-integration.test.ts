import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildApp } from '../src/app.js';
import { login as loginWithPassword } from '../src/auth.js';
import { parseEnvironment } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrations.js';
import { seedDevelopmentData } from '../src/db/seed.js';
import { withTransaction } from '../src/db/transaction.js';
import { GraphMailWorker } from '../src/mail.js';
import { completeMicrosoftLogin } from '../src/microsoft-auth.js';
import { tokenHash } from '../src/security.js';
import { ApiError } from '../src/errors.js';

const sourceDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!sourceDatabaseUrl) {
  test('PostgreSQL integration suite', { skip: 'Set TEST_DATABASE_URL or DATABASE_URL to run integration tests.' }, () => undefined);
} else {
  describe('PostgreSQL API integration', () => {
    const databaseName = `c_job_sparks_it_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const sourceUrl = new URL(sourceDatabaseUrl);
    const administratorUrl = new URL(sourceUrl);
    administratorUrl.pathname = '/postgres';
    const testDatabaseUrl = new URL(sourceUrl);
    testDatabaseUrl.pathname = `/${databaseName}`;
    const administratorPool = new Pool({ connectionString: administratorUrl.toString(), max: 2 });
    let databasePool: Pool;
    let app: FastifyInstance;
    const cookies = new Map<string, string>();
    interface TestResponse {
      statusCode: number;
      body: string;
      headers: Record<string, string | number | string[] | undefined>;
      json<T = unknown>(): T;
    }

    const employeeIds = {
      employee: 'aaaaaaaa-1001-4000-8000-000000000001',
      coordinator: 'aaaaaaaa-1002-4000-8000-000000000002',
      gpm: 'aaaaaaaa-1003-4000-8000-000000000003',
      head: 'aaaaaaaa-1004-4000-8000-000000000004',
    } as const;
    const categoryIds = {
      peer: '88888888-0001-4000-8000-000000000001',
      yellow: '88888888-0002-4000-8000-000000000002',
      yellowParallel: '88888888-0302-4000-8000-000000000302',
      whiteAward: '88888888-0003-4000-8000-000000000003',
    } as const;
    const productId = '99999999-0002-4000-8000-000000000002';

    const cookieHeader = (response: TestResponse) => {
      const header = response.headers['set-cookie'];
      const value = Array.isArray(header) ? header[0] : String(header ?? '');
      assert.ok(value, 'Login must return a session cookie.');
      return value.split(';', 1)[0]!;
    };

    const login = async (label: string, email: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'SparkDemo2026!' },
      });
      assert.equal(response.statusCode, 200, response.body);
      cookies.set(label, cookieHeader(response));
    };

    const authenticated = async (
      label: string,
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      payload?: unknown,
      idempotencyKey?: string,
    ) => {
      const options: Record<string, unknown> = {
        method,
        url,
        headers: {
        cookie: cookies.get(label)!,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
      };
      if (payload !== undefined) options.payload = payload;
      const inject = app.inject.bind(app) as unknown as (request: Record<string, unknown>) => Promise<TestResponse>;
      return await inject(options);
    };

    const count = async (sql: string, parameters: unknown[] = []) => {
      const result = await databasePool.query<{ count: string | number }>(sql, parameters);
      return Number(result.rows[0]!.count);
    };

    const multipart = (fields: Record<string, string>, fileName: string, contents: string) => {
      const boundary = `----cjobsparks${randomUUID().replaceAll('-', '')}`;
      const segments: string[] = [];
      for (const [name, value] of Object.entries(fields)) {
        segments.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
      }
      segments.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: text/csv\r\n\r\n${contents}\r\n--${boundary}--\r\n`,
      );
      return { boundary, payload: Buffer.from(segments.join(''), 'utf8') };
    };

    before(async () => {
      await administratorPool.query(`CREATE DATABASE "${databaseName}"`);
      databasePool = new Pool({ connectionString: testDatabaseUrl.toString(), max: 20 });
      const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');
      await runMigrations(databasePool, migrationsDirectory);
      await withTransaction(databasePool, seedDevelopmentData);
      const environment = parseEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: testDatabaseUrl.toString(),
        COOKIE_SECRET: 'postgres-integration-cookie-secret-2026',
        CORS_ORIGINS: 'http://localhost:5173',
        LOG_LEVEL: 'silent',
        DB_POOL_MAX: '20',
        MIGRATIONS_DIR: migrationsDirectory,
        MEDIA_ROOT: resolve(dirname(fileURLToPath(import.meta.url)), '../../.verify/integration-media'),
      });
      app = await buildApp({ environment, pool: databasePool });
      await Promise.all([
        login('Employee', 'alex.stone@c-job.test'),
        login('Coordinator', 'samuel.park@c-job.test'),
        login('GPM', 'elena.volkova@c-job.test'),
        login('Head', 'maya.chen@c-job.test'),
        login('Top Management', 'victor.hale@c-job.test'),
        login('Administrator', 'ida.novak@c-job.test'),
      ]);
    });

    after(async () => {
      if (app) await app.close();
      if (databasePool) await databasePool.end();
      await administratorPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,
        [databaseName],
      );
      await administratorPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await administratorPool.end();
    });

    test('Workspace exposes the complete role-specific category catalog', async () => {
      const response = await authenticated('Administrator', 'GET', '/api/v1/workspace');
      assert.equal(response.statusCode, 200, response.body);
      const categories = response.json<{ categories: Array<{
        name: string;
        description: string;
        sparkType: string;
        usageType: string;
        amount: number;
        active: boolean;
      }> }>().categories;
      const categoryCount = (sparkType: string, usageType: string) => categories.filter((category) =>
        category.active && category.sparkType === sparkType && category.usageType === usageType).length;
      assert.equal(categoryCount('White', 'PeerRecognition'), 11);
      assert.equal(categoryCount('White', 'Award'), 11);
      assert.equal(categoryCount('Yellow', 'Award'), 10);
      assert.equal(categoryCount('Blue', 'Award'), 6);
      assert.equal(categories.find((category) => category.name === 'Knowledge Sharing' &&
        category.usageType === 'Award')?.description,
      'Shares useful knowledge in a form colleagues can understand and reuse.');
      assert.ok(categories.filter((category) => category.usageType === 'PeerRecognition')
        .every((category) => category.amount === 1));
      const fulfillmentContacts = response.json<{ fulfillmentContacts: Array<{ email: string }> }>().fulfillmentContacts;
      assert.equal(fulfillmentContacts.length, 10);
      assert.deepEqual(fulfillmentContacts.map((contact) => contact.email), [
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
      ]);

      const layoutResponse = await authenticated('Employee', 'GET', '/api/v1/workspace/layout');
      assert.equal(layoutResponse.statusCode, 200, layoutResponse.body);
      const layout = layoutResponse.json<{ shell: { balances: Record<string, number> }; employees: unknown[] }>();
      assert.equal(layout.shell.balances.White, 100);
      assert.ok(layout.employees.length <= 2);

      const profileResponse = await authenticated('Employee', 'GET', '/api/v1/workspace?section=profile');
      assert.equal(profileResponse.statusCode, 200, profileResponse.body);
      const profile = profileResponse.json<{
        awardRequests: unknown[];
        auditEvents: unknown[];
        achievements: unknown[];
        performance: unknown[];
        employees: unknown[];
      }>();
      assert.deepEqual(profile.awardRequests, []);
      assert.deepEqual(profile.auditEvents, []);
      assert.deepEqual(profile.achievements, []);
      assert.deepEqual(profile.performance, []);
      assert.ok(profile.employees.length <= 2);

      const firstLedgerResponse = await authenticated('Employee', 'GET', '/api/v1/me/ledger?limit=1');
      assert.equal(firstLedgerResponse.statusCode, 200, firstLedgerResponse.body);
      const firstLedgerPage = firstLedgerResponse.json<{
        items: Array<{ id: string }>;
        nextCursor: string | null;
        hasNext: boolean;
      }>();
      assert.equal(firstLedgerPage.items.length, 1);
      assert.equal(firstLedgerPage.hasNext, true);
      assert.ok(firstLedgerPage.nextCursor);
      const secondLedgerResponse = await authenticated('Employee', 'GET',
        `/api/v1/me/ledger?limit=1&cursor=${encodeURIComponent(firstLedgerPage.nextCursor!)}`);
      assert.equal(secondLedgerResponse.statusCode, 200, secondLedgerResponse.body);
      const secondLedgerPage = secondLedgerResponse.json<{ items: Array<{ id: string }> }>();
      assert.equal(secondLedgerPage.items.length, 1);
      assert.notEqual(secondLedgerPage.items[0]!.id, firstLedgerPage.items[0]!.id);

      const peer = categories.find((category) => category.usageType === 'PeerRecognition')!;
      const updatedPeerAmount = await authenticated('Administrator', 'PATCH',
        `/api/v1/admin/spark-categories/${encodeURIComponent(categoryIds.peer)}`, {
          id: categoryIds.peer,
          name: peer.name,
          description: peer.description,
          sparkType: 'White',
          usageType: 'PeerRecognition',
          amount: 2,
          period: 'Unrestricted',
          active: peer.active,
        });
      assert.equal(updatedPeerAmount.statusCode, 200, updatedPeerAmount.body);
      assert.equal(await count(`SELECT count(*) FROM app.spark_category_versions
        WHERE category_id=$1 AND amount=2 AND status='Active'`, [categoryIds.peer]), 1);

      const departmentName = `Department ${randomUUID()}`;
      const department = await authenticated('Administrator', 'POST', '/api/v1/admin/departments', {
        id: '', name: departmentName, headId: '', active: true,
      });
      assert.equal(department.statusCode, 200, department.body);
      const createdDepartmentId = department.json<{ id: string }>().id;
      assert.equal(await count(`SELECT count(*) FROM app.departments
        WHERE id=$1 AND name=$2 AND head_employee_id IS NULL`, [createdDepartmentId, departmentName]), 1);

      const removableCategoryName = `Temporary category ${randomUUID()}`;
      const removableCategory = await authenticated('Administrator', 'POST', '/api/v1/admin/spark-categories', {
        id: '',
        name: removableCategoryName,
        description: 'A temporary category used to verify safe administrative deletion.',
        sparkType: 'White',
        usageType: 'PeerRecognition',
        amount: 3,
        period: 'Unrestricted',
        active: true,
      });
      assert.equal(removableCategory.statusCode, 200, removableCategory.body);
      const removableCategoryId = removableCategory.json<{ id: string }>().id;
      const forbiddenDelete = await authenticated('Employee', 'DELETE',
        `/api/v1/admin/spark-categories/${encodeURIComponent(removableCategoryId)}`);
      assert.equal(forbiddenDelete.statusCode, 403, forbiddenDelete.body);
      const deletedCategory = await authenticated('Administrator', 'DELETE',
        `/api/v1/admin/spark-categories/${encodeURIComponent(removableCategoryId)}`);
      assert.equal(deletedCategory.statusCode, 204, deletedCategory.body);
      assert.equal(await count(`SELECT count(*) FROM app.spark_categories
        WHERE id=$1 AND is_active=false`, [removableCategoryId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.spark_category_versions
        WHERE category_id=$1 AND status='Active'`, [removableCategoryId]), 0);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events
        WHERE entity_id=$1 AND action='CATEGORY_DELETED'`, [removableCategoryId]), 1);
    });

    test('Recognition persists audit, outbox and approval notification', async () => {
      const beforeLayoutResponse = await authenticated('Head', 'GET', '/api/v1/workspace/layout');
      assert.equal(beforeLayoutResponse.statusCode, 200, beforeLayoutResponse.body);
      const beforePending = beforeLayoutResponse.json<{ shell: { pendingApprovals: number } }>()
        .shell.pendingApprovals;
      const response = await authenticated('Employee', 'POST', '/api/v1/recognitions', {
        recipientId: employeeIds.coordinator,
        categoryId: categoryIds.peer,
        description: 'Shared a reusable engineering walkthrough.',
      }, `recognition-${randomUUID()}`);
      assert.equal(response.statusCode, 201, response.body);
      const recognition = response.json<{ id: string; status: string; amount: number }>();
      assert.equal(recognition.status, 'Pending');
      assert.equal(recognition.amount, 2);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events WHERE entity_type='Recognition' AND entity_id=$1`, [recognition.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.outbox_events WHERE aggregate_type='Recognition' AND aggregate_id=$1`, [recognition.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.notifications WHERE object_type='Recognition' AND object_id=$1`, [recognition.id]), 1);
      const pendingLayoutResponse = await authenticated('Head', 'GET', '/api/v1/workspace/layout');
      assert.equal(pendingLayoutResponse.statusCode, 200, pendingLayoutResponse.body);
      assert.equal(
        pendingLayoutResponse.json<{ shell: { pendingApprovals: number } }>().shell.pendingApprovals,
        beforePending + 1,
      );
      const decision = await authenticated('Head', 'POST', `/api/v1/recognitions/${recognition.id}/decision`, {
        decision: 'Approved', reason: '',
      }, `recognition-decision-${randomUUID()}`);
      assert.equal(decision.statusCode, 200, decision.body);
      assert.equal(await count(`SELECT count(*) FROM app.spark_ledger_entries
        WHERE source_type='Recognition' AND source_id=$1 AND amount=2`, [recognition.id]), 1);
      const approvedLayoutResponse = await authenticated('Head', 'GET', '/api/v1/workspace/layout');
      assert.equal(approvedLayoutResponse.statusCode, 200, approvedLayoutResponse.body);
      assert.equal(
        approvedLayoutResponse.json<{ shell: { pendingApprovals: number } }>().shell.pendingApprovals,
        beforePending,
      );
    });

    test('Award supports Coordinator, GPM, Head and Top Management scenarios', async () => {
      const scenarios = [
        {
          role: 'Coordinator', recipientId: employeeIds.employee, categoryId: categoryIds.yellow,
          description: 'Successful referral contribution.', expectedStatus: 'Pending', expectedType: 'Yellow',
        },
        {
          role: 'GPM', recipientId: employeeIds.coordinator, categoryId: categoryIds.whiteAward,
          description: 'Smart solution delivered by the coordinator.', expectedStatus: 'Pending', expectedType: 'White',
        },
        {
          role: 'Head', recipientId: employeeIds.employee, categoryId: categoryIds.whiteAward,
          description: 'Direct department award.', expectedStatus: 'Approved', expectedType: 'White',
        },
        {
          role: 'Top Management', recipientId: employeeIds.employee, radiantReason: 'Company-wide impact',
          description: 'Exceptional company-wide contribution.', expectedStatus: 'Approved', expectedType: 'Radiant',
        },
      ] as const;
      for (const scenario of scenarios) {
        const response = await authenticated(scenario.role, 'POST', '/api/v1/awards', {
          recipientId: scenario.recipientId,
          description: scenario.description,
          ...('categoryId' in scenario ? { categoryId: scenario.categoryId } : {}),
          ...('radiantReason' in scenario ? { radiantReason: scenario.radiantReason } : {}),
          ...('radiantReason' in scenario ? {
            fulfillmentContactId: 'd1000000-0000-4000-8000-000000000001',
            radiantRewardKind: 'RadiantAcrylic',
            valuablePrizeDescription: 'Annual management-selected valuable prize.',
          } : {}),
        }, `award-${scenario.role}-${randomUUID()}`);
        assert.equal(response.statusCode, 201, `${scenario.role}: ${response.body}`);
        const award = response.json<{ id: string; status: string; sparkType: string }>();
        assert.equal(award.status, scenario.expectedStatus);
        assert.equal(award.sparkType, scenario.expectedType);
        assert.equal(await count(`SELECT count(*) FROM app.audit_events WHERE entity_type='Award' AND entity_id=$1`, [award.id]), 1);
        if (scenario.role === 'Top Management') {
          assert.equal(await count(`SELECT count(*) FROM app.reward_fulfillments WHERE award_request_id=$1`, [award.id]), 1);
          assert.equal(await count(`SELECT count(*) FROM app.outbox_events
            WHERE event_type='RewardFulfillmentRequested' AND payload->>'awardId'=$1`, [award.id]), 1);
        }
      }
      const headWorkspace = await authenticated('Head', 'GET', '/api/v1/workspace');
      assert.equal(headWorkspace.statusCode, 200, headWorkspace.body);
      const headSnapshot = headWorkspace.json<{
        achievements: Array<{ employeeId: string }>;
        transactions: Array<{ sparkType: string }>;
        departmentBalances: Record<string, Record<string, number>>;
      }>();
      assert.ok(headSnapshot.achievements
        .some((achievement) => achievement.employeeId === employeeIds.employee));
      const employeeWhite = await databasePool.query<{ balance: string | number }>(
        `SELECT balance FROM app.spark_accounts WHERE employee_id=$1 AND spark_type='White'`,
        [employeeIds.employee],
      );
      assert.equal(headSnapshot.departmentBalances[employeeIds.employee]!.White,
        Number(employeeWhite.rows[0]!.balance));
      assert.ok(headSnapshot.transactions.every((transaction) => transaction.sparkType === 'Radiant'));

      const coordinatorRecipients = await authenticated('Coordinator', 'GET',
        '/api/v1/eligible-recipients?purpose=award');
      assert.equal(coordinatorRecipients.statusCode, 200, coordinatorRecipients.body);
      const eligible = coordinatorRecipients.json<Array<{ id: string; role: string }>>();
      assert.ok(eligible.every((recipient) => ['Employee', 'Coordinator'].includes(recipient.role)));
      assert.ok(eligible.every((recipient) => recipient.id !== employeeIds.coordinator));
      assert.equal(eligible.some((recipient) => recipient.id === employeeIds.gpm), false);
      assert.equal(eligible.some((recipient) => recipient.id === employeeIds.head), false);

      const invalidRecipient = await authenticated('Coordinator', 'POST', '/api/v1/awards', {
        recipientId: employeeIds.gpm,
        categoryId: categoryIds.yellow,
        description: 'This non-member-economy recipient must be rejected.',
      }, `invalid-recipient-${randomUUID()}`);
      assert.equal(invalidRecipient.statusCode, 403, invalidRecipient.body);
    });

    test('Convert and Disenchant use the ledger and Disenchant is camelCase', async () => {
      const conversion = await authenticated('Employee', 'POST', '/api/v1/conversions',
        { from: 'White', amount: 10 }, `conversion-${randomUUID()}`);
      assert.equal(conversion.statusCode, 201, conversion.body);
      assert.deepEqual(
        (({ output, to, fee, totalDebited }) => ({ output, to, fee, totalDebited }))(conversion.json()),
        { output: 1, to: 'Yellow', fee: 1, totalDebited: 11 },
      );

      const disenchant = await authenticated('Employee', 'POST', '/api/v1/disenchant-requests',
        { sparkType: 'White', amount: 1 }, `disenchant-${randomUUID()}`);
      assert.equal(disenchant.statusCode, 201, disenchant.body);
      const body = disenchant.json<Record<string, unknown>>();
      assert.equal(body.employeeId, employeeIds.employee);
      assert.equal(body.sparkType, 'White');
      assert.equal(body.amount, 1);
      assert.equal(body.moneyValue, 1);
      assert.equal(typeof body.createdAt, 'string');
      assert.equal('employee_id' in body, false);
      assert.equal('money_amount' in body, false);

      const requestId = String(body.id);
      const headWorkspace = await authenticated('Head', 'GET', '/api/v1/workspace');
      assert.equal(headWorkspace.statusCode, 200, headWorkspace.body);
      assert.equal(headWorkspace.json<{ disenchantRequests: Array<{ id: string; employeeName?: string }> }>()
        .disenchantRequests.find((request) => request.id === requestId)?.employeeName, 'Alex Stone');
      const exportResponse = await authenticated('Administrator', 'POST',
        '/api/v1/admin/disenchant-requests/export', {
          requestIds: [requestId],
          exportReference: 'QA-ACCOUNTING-EXPORT',
        }, `disenchant-export-${randomUUID()}`);
      assert.equal(exportResponse.statusCode, 200, exportResponse.body);
      const exported = exportResponse.json<{ csv: string; requestIds: string[]; status: string }>();
      assert.equal(exported.status, 'Exported');
      assert.deepEqual(exported.requestIds, [requestId]);
      assert.match(exported.csv, new RegExp(requestId));
      assert.equal(await count(`SELECT count(*) FROM app.disenchant_requests WHERE id=$1 AND status='Exported'`, [requestId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events WHERE action='DISENCHANT_EXPORTED' AND entity_id=$1`, [requestId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.outbox_events WHERE event_type='DisenchantExported' AND aggregate_id=$1`, [requestId]), 1);

      const paidResponse = await authenticated('Administrator', 'POST',
        `/api/v1/admin/disenchant-requests/${requestId}/status`, { status: 'Paid' },
        `disenchant-paid-${randomUUID()}`);
      assert.equal(paidResponse.statusCode, 200, paidResponse.body);
      assert.equal(paidResponse.json<{ status: string }>().status, 'Paid');
      assert.equal(await count(`SELECT count(*) FROM app.disenchant_requests WHERE id=$1 AND status='Paid'`, [requestId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.notifications WHERE object_type='Disenchant' AND object_id=$1`, [requestId]), 3);

      const monthlyRequest = await authenticated('Employee', 'POST', '/api/v1/disenchant-requests',
        { sparkType: 'White', amount: 1 }, `disenchant-monthly-${randomUUID()}`);
      assert.equal(monthlyRequest.statusCode, 201, monthlyRequest.body);
      const monthlyRequestId = monthlyRequest.json<{ id: string }>().id;

      const historicalRequest = await authenticated('Employee', 'POST', '/api/v1/disenchant-requests',
        { sparkType: 'White', amount: 1 }, `disenchant-historical-${randomUUID()}`);
      assert.equal(historicalRequest.statusCode, 201, historicalRequest.body);
      const historicalRequestId = historicalRequest.json<{ id: string }>().id;
      const now = new Date();
      const historicalMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
        .toISOString().slice(0, 7);
      await databasePool.query(`UPDATE app.disenchant_requests SET created_at=$2::timestamptz WHERE id=$1`,
        [historicalRequestId, `${historicalMonth}-15T12:00:00.000Z`]);

      const historicalReport = await authenticated('Head', 'POST',
        '/api/v1/department/disenchant-reports', { reportMonth: historicalMonth },
        `disenchant-report-${historicalMonth}-${randomUUID()}`);
      assert.equal(historicalReport.statusCode, 201, historicalReport.body);
      const historicalReportBody = historicalReport.json<{ id: string; reportMonth: string; itemCount: number }>();
      assert.equal(historicalReportBody.reportMonth, historicalMonth);
      assert.equal(historicalReportBody.itemCount, 1);
      assert.equal(await count(`SELECT count(*) FROM app.disenchant_report_items
        WHERE report_id=$1 AND disenchant_request_id=$2`, [historicalReportBody.id, historicalRequestId]), 1);

      const currentMonth = now.toISOString().slice(0, 7);
      const monthlyReport = await authenticated('Head', 'POST',
        '/api/v1/department/disenchant-reports', { reportMonth: currentMonth }, `disenchant-report-${randomUUID()}`);
      assert.equal(monthlyReport.statusCode, 201, monthlyReport.body);
      const report = monthlyReport.json<{ id: string; csv: string; itemCount: number; reportMonth: string }>();
      assert.equal(report.reportMonth, currentMonth);
      assert.equal(report.itemCount, 2);
      assert.match(report.csv, /Alex Stone/);
      assert.equal(await count(`SELECT count(*) FROM app.disenchant_report_items
        WHERE report_id=$1 AND disenchant_request_id=$2`, [report.id, monthlyRequestId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.disenchant_requests
        WHERE id=$1 AND status='Exported'`, [monthlyRequestId]), 1);
      const repeatedReport = await authenticated('Head', 'POST',
        '/api/v1/department/disenchant-reports', { reportMonth: currentMonth },
        `disenchant-report-repeat-${randomUUID()}`);
      assert.equal(repeatedReport.statusCode, 201, repeatedReport.body);
      assert.equal(repeatedReport.json<{ id: string; itemCount: number }>().id, report.id);
      assert.equal(repeatedReport.json<{ id: string; itemCount: number }>().itemCount, 2);

      const laterMonthlyRequest = await authenticated('Employee', 'POST', '/api/v1/disenchant-requests',
        { sparkType: 'White', amount: 1 }, `disenchant-monthly-later-${randomUUID()}`);
      assert.equal(laterMonthlyRequest.statusCode, 201, laterMonthlyRequest.body);
      const laterMonthlyRequestId = laterMonthlyRequest.json<{ id: string }>().id;
      const refreshedReport = await authenticated('Head', 'POST',
        '/api/v1/department/disenchant-reports', { reportMonth: currentMonth },
        `disenchant-report-refreshed-${randomUUID()}`);
      assert.equal(refreshedReport.statusCode, 201, refreshedReport.body);
      assert.equal(refreshedReport.json<{ id: string; itemCount: number }>().id, report.id);
      assert.equal(refreshedReport.json<{ id: string; itemCount: number }>().itemCount, 3);
      assert.equal(await count(`SELECT count(*) FROM app.disenchant_report_items
        WHERE report_id=$1 AND disenchant_request_id=$2`, [report.id, laterMonthlyRequestId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events
        WHERE action='DISENCHANT_MONTHLY_REPORT_EXPORTED' AND entity_id=$1`, [report.id]), 3);

      const employeeReport = await authenticated('Employee', 'POST',
        '/api/v1/department/disenchant-reports', { reportMonth: currentMonth },
        `disenchant-report-forbidden-${randomUUID()}`);
      assert.equal(employeeReport.statusCode, 403, employeeReport.body);
    });

    test('Purchase creates one ledger-backed purchase and inventory item', async () => {
      const missingContactResponse = await authenticated('Administrator', 'POST', '/api/shop/admin/products', {
        name: `QA Unassigned Physical Reward ${randomUUID()}`,
        description: 'Must be rejected without an administrator-selected responsible person',
        imageUrl: null,
        icon: 'gift',
        category: 'Exclusive',
        rarity: 'Common',
        price: 1,
        priceSparkType: 'White',
        productType: 'Permanent',
        fulfillmentKind: 'Physical',
        fulfillmentContactId: null,
        durationHours: null,
        stock: null,
        isActive: true,
        isFeatured: false,
        isLimited: false,
        availableFrom: null,
        availableUntil: null,
      }, `physical-product-missing-contact-${randomUUID()}`);
      assert.equal(missingContactResponse.statusCode, 400, missingContactResponse.body);
      assert.equal(missingContactResponse.json<{ code: string }>().code, 'FULFILLMENT_CONTACT_REQUIRED');

      const physicalProductName = `QA Physical Reward ${randomUUID()}`;
      const productResponse = await authenticated('Administrator', 'POST', '/api/shop/admin/products', {
        name: physicalProductName,
        description: 'Physical fulfillment integration test',
        imageUrl: null,
        icon: 'gift',
        category: 'Exclusive',
        rarity: 'Common',
        price: 1,
        priceSparkType: 'White',
        productType: 'Permanent',
        fulfillmentKind: 'Physical',
        fulfillmentContactId: 'd1000000-0000-4000-8000-000000000001',
        durationHours: null,
        stock: null,
        isActive: true,
        isFeatured: false,
        isLimited: false,
        availableFrom: null,
        availableUntil: null,
      }, `physical-product-${randomUUID()}`);
      assert.equal(productResponse.statusCode, 200, productResponse.body);
      const configuredProduct = productResponse.json<{
        products: Array<{ id: string; name: string; fulfillmentContactId: string | null }>;
      }>().products.find((product) => product.name === physicalProductName)!;
      assert.equal(configuredProduct.fulfillmentContactId, 'd1000000-0000-4000-8000-000000000001');
      const physicalProductId = configuredProduct.id;
      const response = await authenticated('Employee', 'POST', '/api/v1/shop/purchases',
        { productId: physicalProductId, fulfillment: {
          deliveryMethod: 'OfficePickup',
          officeName: 'Main office',
        } }, `purchase-${randomUUID()}`);
      assert.equal(response.statusCode, 201, response.body);
      const result = response.json<{ purchase: { id: string }; inventoryItem: { id: string } }>();
      assert.equal(await count(`SELECT count(*) FROM app.purchases WHERE id=$1`, [result.purchase.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.inventory_items WHERE id=$1`, [result.inventoryItem.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events WHERE entity_type='Purchase' AND entity_id=$1`, [result.purchase.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.reward_fulfillments
        WHERE purchase_id=$1 AND assigned_contact_id='d1000000-0000-4000-8000-000000000001'
          AND office_name='Main office'`, [result.purchase.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.outbox_events
        WHERE event_type='RewardFulfillmentRequested' AND payload->>'purchaseId'=$1`, [result.purchase.id]), 1);

      for (const role of ['GPM', 'Head'] as const) {
        const restricted = await authenticated(role, 'POST', '/api/v1/shop/purchases',
          { productId }, `restricted-purchase-${role}-${randomUUID()}`);
        assert.equal(restricted.statusCode, 403, restricted.body);
      }
      const gpmShop = await authenticated('GPM', 'GET', '/api/v1/shop');
      assert.equal(gpmShop.statusCode, 403, gpmShop.body);
      const topShop = await authenticated('Top Management', 'GET', '/api/v1/shop');
      assert.equal(topShop.statusCode, 200, topShop.body);
      assert.deepEqual(topShop.json<{ balances: Record<string, number> }>().balances,
        { White: 0, Yellow: 0, Blue: 0 });
      const topPurchase = await authenticated('Top Management', 'POST', '/api/v1/shop/purchases',
        { productId }, `restricted-purchase-top-${randomUUID()}`);
      assert.equal(topPurchase.statusCode, 403, topPurchase.body);

      const gpmBalances = await authenticated('GPM', 'GET', '/api/v1/me/spark-balances');
      assert.equal(gpmBalances.statusCode, 200, gpmBalances.body);
      const gpmBalanceBody = gpmBalances.json<Record<string, number>>();
      assert.equal(gpmBalanceBody.White, 0);
      assert.equal(gpmBalanceBody.Yellow, 0);
      assert.equal(gpmBalanceBody.Blue, 0);
      const headLedger = await authenticated('Head', 'GET', '/api/v1/me/ledger');
      assert.equal(headLedger.statusCode, 200, headLedger.body);
      assert.ok(headLedger.json<{ items: Array<{ spark_type: string }>; hasNext: boolean; nextCursor: string | null }>()
        .items.every((entry) => entry.spark_type === 'Radiant'));

      for (const endpoint of ['/api/v1/me/spark-balances', '/api/v1/me/ledger']) {
        const administratorLedger = await authenticated('Administrator', 'GET', endpoint);
        assert.equal(administratorLedger.statusCode, 403, administratorLedger.body);
        assert.equal(administratorLedger.json<{ code: string }>().code, 'FORBIDDEN');
      }

      const forbiddenDelete = await authenticated('Employee', 'DELETE',
        `/api/v1/admin/products/${physicalProductId}`);
      assert.equal(forbiddenDelete.statusCode, 403, forbiddenDelete.body);

      const deleted = await authenticated('Administrator', 'DELETE',
        `/api/v1/admin/products/${physicalProductId}`);
      assert.equal(deleted.statusCode, 200, deleted.body);
      assert.ok(deleted.json<{ products: Array<{ id: string }> }>().products
        .every((product) => product.id !== physicalProductId));
      assert.equal(await count(`SELECT count(*) FROM app.products
        WHERE id=$1 AND is_active=false AND deleted_at IS NOT NULL`, [physicalProductId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.purchases WHERE id=$1`, [result.purchase.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.inventory_items WHERE id=$1`, [result.inventoryItem.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events
        WHERE action='PRODUCT_DELETED' AND entity_id=$1`, [physicalProductId]), 1);

      const shopAfterDeletion = await authenticated('Employee', 'GET', '/api/v1/shop');
      assert.equal(shopAfterDeletion.statusCode, 200, shopAfterDeletion.body);
      assert.ok(shopAfterDeletion.json<{ products: Array<{ id: string }> }>().products
        .every((product) => product.id !== physicalProductId));

      const repeatedDelete = await authenticated('Administrator', 'DELETE',
        `/api/v1/admin/products/${physicalProductId}`);
      assert.equal(repeatedDelete.statusCode, 404, repeatedDelete.body);
    });

    test('Graph mail worker claims, sends and publishes reward fulfillment events', async () => {
      const eventId = randomUUID();
      const aggregateId = randomUUID();
      await databasePool.query(`INSERT INTO app.outbox_events
        (id,event_type,aggregate_type,aggregate_id,payload)
        VALUES ($1,'RewardFulfillmentRequested','RewardFulfillment',$2,$3::jsonb)`, [
        eventId,
        aggregateId,
        JSON.stringify({
          sourceType: 'ShopPurchase',
          emailTo: ['a.hryshyn@c-job.com'],
          recipientName: 'QA Employee',
          recipientEmail: 'qa.employee@c-job.test',
          productName: 'QA physical reward',
          fulfillmentKind: 'Physical',
          deliveryMethod: 'OfficePickup',
          officeName: 'Main office',
          assignedTo: { display_name: 'Artem Hryshyn (Test)', email: 'a.hryshyn@c-job.com' },
        }),
      ]);
      const requests: string[] = [];
      const fetcher = (async (input: string | URL | Request) => {
        const url = String(input);
        requests.push(url);
        return url.includes('/oauth2/v2.0/token')
          ? new Response(JSON.stringify({ access_token: 'integration-token', expires_in: 3600 }), {
              status: 200, headers: { 'content-type': 'application/json' },
            })
          : new Response(null, { status: 202 });
      }) as typeof fetch;
      const mailEnvironment = parseEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: testDatabaseUrl.toString(),
        COOKIE_SECRET: 'postgres-integration-cookie-secret-2026',
        CORS_ORIGINS: 'http://localhost:5173',
        FRONTEND_ORIGIN: 'http://localhost:5173',
        MAIL_ENABLED: 'true',
        MAIL_SENDER_EMAIL: 'sparks@c-job-ua.com',
        MICROSOFT_TENANT_ID: 'tenant-id',
        MICROSOFT_CLIENT_ID: '11111111-1111-4111-8111-111111111111',
        MICROSOFT_CLIENT_SECRET: 'integration-secret',
      });
      const logger = { info() {}, warn() {}, error() {} };
      const worker = new GraphMailWorker(databasePool, mailEnvironment, logger, fetcher);
      await worker.runOnce();
      const event = await databasePool.query<{ published_at: Date | null; failed_at: Date | null; attempts: number }>(
        `SELECT published_at,failed_at,attempts FROM app.outbox_events WHERE id=$1`, [eventId],
      );
      assert.ok(event.rows[0]!.published_at);
      assert.equal(event.rows[0]!.failed_at, null);
      assert.equal(Number(event.rows[0]!.attempts), 1);
      assert.ok(requests.some((url) => url.endsWith('/users/sparks%40c-job-ua.com/sendMail')));
    });

    test('Work email and profile photo cannot be changed locally', async () => {
      const emailChange = await authenticated('Employee', 'POST', '/api/v1/me/email-change', {
        email: `changed.${randomUUID().slice(0, 8)}@c-job.test`,
      });
      assert.equal(emailChange.statusCode, 403, emailChange.body);
      assert.equal(emailChange.json<{ code: string }>().code, 'WORK_EMAIL_IMMUTABLE');

      const avatarChange = await authenticated('Employee', 'POST', '/api/v1/me/avatar', {
        avatarDataUrl: 'data:image/png;base64,cGhvdG8=',
      });
      assert.equal(avatarChange.statusCode, 403, avatarChange.body);
      assert.equal(avatarChange.json<{ code: string }>().code, 'MICROSOFT_AVATAR_MANAGED');

      const invalidRouteLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'alex.stone@c-job.test', password: 'DefinitelyWrong2026!' },
      });
      assert.equal(invalidRouteLogin.statusCode, 401, invalidRouteLogin.body);
      assert.equal(invalidRouteLogin.json<{ code: string }>().code, 'AUTHENTICATION_REQUIRED');
      assert.equal(await count(`SELECT count(*) FROM app.users
        WHERE email='alex.stone@c-job.test' AND failed_login_attempts=1`), 1);
      await databasePool.query(`UPDATE app.users SET failed_login_attempts=0,locked_until=NULL
        WHERE email='alex.stone@c-job.test'`);

      const failedPasswordAttempt = () => withTransaction(databasePool, async (db) => {
        try {
          await loginWithPassword(db, {
            email: 'alex.stone@c-job.test',
            password: 'DefinitelyWrong2026!',
          }, { requestId: randomUUID() });
          return undefined;
        } catch (error) {
          if (error instanceof ApiError) return error;
          throw error;
        }
      });
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const failure = await failedPasswordAttempt();
        assert.equal(failure?.statusCode, 401);
      }
      const blocked = await failedPasswordAttempt();
      assert.equal(blocked?.statusCode, 429);
      assert.equal(blocked?.code, 'LOGIN_THROTTLED');
      const lockState = await databasePool.query<{ failed_login_attempts: number; locked_until: Date | null }>(
        `SELECT failed_login_attempts,locked_until FROM app.users WHERE email='alex.stone@c-job.test'`,
      );
      assert.equal(lockState.rows[0]!.failed_login_attempts, 5);
      assert.ok(lockState.rows[0]!.locked_until);
      assert.ok(lockState.rows[0]!.locked_until!.getTime() > Date.now());
      assert.equal(await count(`SELECT count(*) FROM app.login_events
        WHERE email='alex.stone@c-job.test' AND outcome='Blocked'`), 1);
      await databasePool.query(`UPDATE app.users SET failed_login_attempts=0,locked_until=NULL
        WHERE email='alex.stone@c-job.test'`);
    });

    test('A new work email requests access and Administrator creates its directory employee on approval', async () => {
      const email = `qa.access.${randomUUID().slice(0, 8)}@c-job.test`;
      const access = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/access-requests',
        payload: { email, password: 'QAIntegration2026!', confirmPassword: 'QAIntegration2026!' },
      });
      assert.equal(access.statusCode, 201, access.body);
      const account = access.json<{ id: string; employeeId?: string; status: string }>();
      assert.equal(account.employeeId, undefined);
      assert.equal(account.status, 'Pending');
      assert.equal(await count(`SELECT count(*) FROM app.employees WHERE lower(contact_email::text)=lower($1)`, [email]), 0);

      const approvals = await authenticated('Administrator', 'GET', '/api/v1/approvals');
      assert.equal(approvals.statusCode, 200, approvals.body);
      const approvalBody = approvals.json<{ accessRequests: Array<{ resulting_user_id: string; employee_name: string | null }> }>();
      assert.ok(approvalBody.accessRequests.some((item) => item.resulting_user_id === account.id && item.employee_name === null));

      const approval = await authenticated('Administrator', 'POST',
        `/api/v1/admin/access-requests/${account.id}/decision`, {
          decision: 'Approved',
          employee: {
            name: 'QA Access User',
            title: 'QA Engineer',
            departmentId: '11111111-1111-4111-8111-111111111111',
            role: 'Employee',
          },
        });
      assert.equal(approval.statusCode, 200, approval.body);
      const employeeId = approval.json<{ employeeId: string }>().employeeId;
      assert.ok(employeeId);
      assert.equal(await count(`SELECT count(*) FROM app.employees
        WHERE id=$1 AND user_id=$2 AND display_name='QA Access User' AND is_active`, [employeeId, account.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.spark_accounts WHERE employee_id=$1`, [employeeId]), 4);
      assert.equal(await count(`SELECT count(*) FROM app.role_assignments assignment
        JOIN app.roles role ON role.id=assignment.role_id
        WHERE assignment.user_id=$1 AND role.code='Employee' AND assignment.ends_at IS NULL`, [account.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events
        WHERE action='EMPLOYEE_CREATED_ON_ACCESS_APPROVAL' AND entity_id=$1`, [employeeId]), 1);

      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login',
        payload: { email, password: 'QAIntegration2026!' } });
      assert.equal(login.statusCode, 200, login.body);
      const cookie = login.headers['set-cookie'];
      const workspace = await app.inject({ method: 'GET', url: '/api/v1/workspace',
        headers: { cookie: Array.isArray(cookie) ? cookie[0]! : cookie! } });
      assert.equal(workspace.statusCode, 200, workspace.body);
      assert.ok(workspace.json<{ employees: Array<{ id: string }> }>().employees.some((item) => item.id === employeeId));

      const adjustment = await authenticated('Administrator', 'POST', '/api/v1/admin/balance-adjustments', {
        employeeId,
        sparkType: 'White',
        amount: 1,
        reason: 'Create immutable history before deletion test',
      }, `delete-history-${randomUUID()}`);
      assert.equal(adjustment.statusCode, 201, adjustment.body);

      const deletion = await authenticated('Administrator', 'DELETE', `/api/v1/admin/employees/${employeeId}`);
      assert.equal(deletion.statusCode, 204, deletion.body);
      assert.equal(await count(`SELECT count(*) FROM app.employees
        WHERE id=$1 AND user_id IS NULL AND NOT is_active AND contact_email IS NULL
          AND display_name LIKE 'Deleted employee %'`, [employeeId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.spark_accounts account
        JOIN app.spark_ledger_entries entry ON entry.account_id=account.id
        WHERE account.employee_id=$1`, [employeeId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.users
        WHERE id=$1 AND account_status='Disabled' AND email::text LIKE 'deleted.%@invalid.local'`, [account.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events
        WHERE action='EMPLOYEE_DELETED' AND entity_id=$1`, [employeeId]), 1);
      const workspaceAfterDeletion = await authenticated('Administrator', 'GET', '/api/v1/workspace');
      assert.equal(workspaceAfterDeletion.statusCode, 200, workspaceAfterDeletion.body);
      assert.ok(!workspaceAfterDeletion.json<{ employees: Array<{ id: string }> }>().employees
        .some((item) => item.id === employeeId));
    });

    test('Microsoft identity can request access, sync its photo and sign in after approval', async () => {
      const email = `qa.microsoft.${randomUUID().slice(0, 8)}@c-job.test`;
      const microsoftDepartment = `Microsoft QA ${randomUUID().slice(0, 8)}`;
      const identity = {
        appRoles: ['CJob.Coordinator'],
        businessRole: 'Coordinator' as const,
        department: microsoftDepartment,
        email,
        givenName: 'QA',
        jobTitle: 'Senior QA Engineer',
        manager: {
          displayName: 'Maya Chen',
          email: 'maya.chen@c-job.test',
          id: randomUUID(),
        },
        name: 'QA Microsoft User',
        surname: 'Microsoft User',
        subject: randomUUID(),
        tenantId: randomUUID(),
      };
      const insertAttempt = async (state: string) => {
        await databasePool.query(`INSERT INTO app.microsoft_auth_requests
          (state_hash,nonce,code_verifier,return_path,expires_at)
          VALUES ($1,$2,$3,'/',clock_timestamp()+interval '10 minutes')`,
        [tokenHash(state), 'n'.repeat(32), 'v'.repeat(43)]);
      };

      const firstState = `state-${randomUUID()}`;
      await insertAttempt(firstState);
      const pending = await withTransaction(databasePool, (db) => completeMicrosoftLogin(
        db,
        firstState,
        identity,
        'data:image/png;base64,cGhvdG8=',
        { requestId: randomUUID(), ip: '127.0.0.1', userAgent: 'integration-test' },
        168,
      ));
      assert.equal(pending.status, 'Pending');
      const account = await databasePool.query<{ id: string; auth_provider: string; password_hash: string | null }>(
        `SELECT id,auth_provider,password_hash FROM app.users WHERE lower(email::text)=lower($1)`, [email]);
      assert.equal(account.rows[0]!.auth_provider, 'entra');
      assert.equal(account.rows[0]!.password_hash, null);
      assert.equal(await count(`SELECT count(*) FROM app.access_requests WHERE resulting_user_id=$1 AND status='Pending'`, [account.rows[0]!.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.external_identities WHERE user_id=$1`, [account.rows[0]!.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.external_identities
        WHERE user_id=$1 AND claims->>'jobTitle'='Senior QA Engineer'
          AND claims->>'department'=$2
          AND claims->>'businessRole'='Coordinator'
          AND claims#>>'{manager,email}'='maya.chen@c-job.test'`, [account.rows[0]!.id, microsoftDepartment]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.user_preferences
        WHERE user_id=$1 AND accessibility_settings->>'avatarSource'='microsoft'
          AND accessibility_settings->>'avatarDataUrl' IS NOT NULL`, [account.rows[0]!.id]), 1);
      const accessQueue = await authenticated('Administrator', 'GET', '/api/v1/admin/access-requests');
      assert.equal(accessQueue.statusCode, 200, accessQueue.body);
      const accessQueueBody = accessQueue.json<{ accounts: Array<{
        id: string;
        requestedDepartmentId?: string;
        suggestedDepartmentName?: string;
        suggestedJobTitle?: string;
        suggestedManagerId?: string;
        suggestedManagerName?: string;
        suggestedRole?: string;
      }>; auditEvents: Array<{
        accountLabel: string;
        actorLabel: string;
        details: string;
      }> }>();
      const microsoftRequest = accessQueueBody.accounts.find((item) => item.id === account.rows[0]!.id);
      assert.ok(accessQueueBody.auditEvents.some((event) =>
        event.accountLabel === email && event.actorLabel.length > 0 && event.details.length > 0));
      assert.ok(accessQueueBody.auditEvents.every((event) =>
        !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(event.accountLabel) &&
        !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(event.actorLabel)));
      assert.equal(microsoftRequest?.suggestedJobTitle, 'Senior QA Engineer');
      assert.equal(microsoftRequest?.suggestedDepartmentName, microsoftDepartment);
      assert.ok(microsoftRequest?.requestedDepartmentId);
      assert.equal(await count(`SELECT count(*) FROM app.departments
        WHERE id=$1 AND name=$2 AND is_active`, [microsoftRequest!.requestedDepartmentId, microsoftDepartment]), 1);
      assert.equal(microsoftRequest?.suggestedManagerId, 'aaaaaaaa-1004-4000-8000-000000000004');
      assert.equal(microsoftRequest?.suggestedManagerName, 'Maya Chen');
      assert.equal(microsoftRequest?.suggestedRole, 'Coordinator');

      const approval = await authenticated('Administrator', 'POST',
        `/api/v1/admin/access-requests/${account.rows[0]!.id}/decision`, {
          decision: 'Approved',
          employee: {
            name: 'QA Microsoft User',
            title: 'Senior QA Engineer',
            departmentId: microsoftRequest!.requestedDepartmentId!,
            managerId: 'aaaaaaaa-1004-4000-8000-000000000004',
            role: 'Coordinator',
          },
        });
      assert.equal(approval.statusCode, 200, approval.body);

      const secondState = `state-${randomUUID()}`;
      await insertAttempt(secondState);
      const authenticatedResult = await withTransaction(databasePool, (db) => completeMicrosoftLogin(
        db,
        secondState,
        { ...identity, jobTitle: 'Principal QA Engineer', name: 'QA Microsoft User Updated', surname: 'Microsoft User Updated' },
        null,
        { requestId: randomUUID(), ip: '127.0.0.1', userAgent: 'integration-test' },
        168,
      ));
      assert.equal(authenticatedResult.status, 'Authenticated');
      assert.ok('token' in authenticatedResult && authenticatedResult.token.length > 20);
      assert.equal(await count(`SELECT count(*) FROM app.employees employee
        JOIN app.positions position ON position.id=employee.position_id
        WHERE employee.user_id=$1 AND employee.display_name='QA Microsoft User Updated'
          AND position.title='Principal QA Engineer'
          AND employee.department_id=$2
          AND employee.manager_employee_id='aaaaaaaa-1004-4000-8000-000000000004'`,
      [account.rows[0]!.id, microsoftRequest!.requestedDepartmentId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events
        WHERE actor_user_id=$1 AND action='MICROSOFT_DIRECTORY_PROFILE_SYNCED'`, [account.rows[0]!.id]), 1);

      if (!('token' in authenticatedResult)) assert.fail('Microsoft login did not return a session token.');
      const microsoftWorkspace = await app.inject({
        method: 'GET',
        url: '/api/v1/workspace',
        headers: { cookie: `c_job_sparks_session=${authenticatedResult.token}` },
      });
      assert.equal(microsoftWorkspace.statusCode, 200, microsoftWorkspace.body);
      const microsoftEmployee = microsoftWorkspace.json<{ employees: Array<{
        email: string;
        managerId?: string;
        managerName?: string;
        managerEmail?: string;
      }> }>().employees.find((item) => item.email === email);
      assert.equal(microsoftEmployee?.managerId, 'aaaaaaaa-1004-4000-8000-000000000004');
      assert.equal(microsoftEmployee?.managerName, 'Maya Chen');
      assert.equal(microsoftEmployee?.managerEmail, 'maya.chen@c-job.test');

      await databasePool.query(`UPDATE app.employees SET is_active=false WHERE user_id=$1`, [account.rows[0]!.id]);
      await databasePool.query(`UPDATE app.users SET account_status='Disabled',disabled_at=clock_timestamp(),
        disabled_reason='Integration test' WHERE id=$1`, [account.rows[0]!.id]);
      const retryState = `state-${randomUUID()}`;
      await insertAttempt(retryState);
      const resubmitted = await withTransaction(databasePool, (db) => completeMicrosoftLogin(
        db,
        retryState,
        identity,
        null,
        { requestId: randomUUID(), ip: '127.0.0.1', userAgent: 'integration-test' },
        168,
      ));
      assert.equal(resubmitted.status, 'Pending');
      assert.equal(await count(`SELECT count(*) FROM app.access_requests
        WHERE resulting_user_id=$1 AND status='Pending'`, [account.rows[0]!.id]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.users WHERE id=$1 AND account_status='Pending'`,
        [account.rows[0]!.id]), 1);
    });

    test('Performance and Quality Gates emit audit, outbox and notifications', async () => {
      const now = new Date();
      const quarterNumber = Math.floor(now.getUTCMonth() / 3) + 1;
      const start = new Date(Date.UTC(now.getUTCFullYear(), (quarterNumber - 1) * 3, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(now.getUTCFullYear(), quarterNumber * 3, 0)).toISOString().slice(0, 10);
      const quarter = `Q${quarterNumber} ${now.getUTCFullYear()}`;
      const gateResponse = await authenticated('Head', 'POST', '/api/v1/quality-gates', {
        employeeId: employeeIds.coordinator,
        startDate: start,
        endDate: end,
        reason: 'Integration test gate',
      }, `quality-gate-${randomUUID()}`);
      assert.equal(gateResponse.statusCode, 201, gateResponse.body);
      const gateId = gateResponse.json<{ id: string }>().id;
      assert.equal(await count(`SELECT count(*) FROM app.audit_events WHERE action='QUALITY_GATE_CREATED' AND entity_id=$1`, [gateId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.outbox_events WHERE event_type='QualityGateCreated' AND aggregate_id=$1`, [gateId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.notifications WHERE object_type='QualityGate' AND object_id=$1`, [gateId]), 1);

      const kpiUpload = multipart({ kind: 'KPI', quarter }, 'KPI Systems.csv',
        'Resource;Efficiency,\r\nSamuel  Park;1,13\r\n,\r\n');
      const previewResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/performance-imports/preview',
        payload: kpiUpload.payload,
        headers: {
          cookie: cookies.get('Administrator')!,
          'content-type': `multipart/form-data; boundary=${kpiUpload.boundary}`,
        },
      });
      assert.equal(previewResponse.statusCode, 201, previewResponse.body);
      const preview = previewResponse.json<{ id: string; invalidValues: number; employeesNotFound: number; qualityGateActive: number; rows: unknown[] }>();
      assert.equal(preview.invalidValues, 0);
      assert.equal(preview.employeesNotFound, 0);
      assert.equal(preview.qualityGateActive, 1);
      assert.equal(preview.rows.length, 1);

      const commit = await authenticated('Administrator', 'POST',
        `/api/v1/admin/performance-imports/${preview.id}/commit`, { replace: false }, `performance-${randomUUID()}`);
      assert.equal(commit.statusCode, 200, commit.body);
      const performanceRecord = await databasePool.query<{ id: string }>(
        `SELECT id FROM app.performance_records WHERE import_row_id IN
          (SELECT id FROM app.performance_import_rows WHERE import_id=$1)`, [preview.id]);
      const performanceId = performanceRecord.rows[0]!.id;
      assert.equal(await count(`SELECT count(*) FROM app.audit_events WHERE action='PERFORMANCE_IMPORTED' AND entity_id=$1`, [performanceId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.outbox_events WHERE event_type='PerformanceRecorded' AND aggregate_id=$1`, [performanceId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.notifications WHERE object_type='PerformanceRecord' AND object_id=$1`, [performanceId]), 1);

      const workspace = await authenticated('Head', 'GET', '/api/v1/workspace');
      assert.equal(workspace.statusCode, 200, workspace.body);
      const gate = workspace.json<{ qualityGates: Array<{ id: string; startDate: string; endDate: string }> }>()
        .qualityGates.find((item) => item.id === gateId);
      assert.ok(gate);
      assert.equal(gate.startDate, start);
      assert.equal(gate.endDate, end);

      const personalCardsUpload = multipart({ kind: 'Evaluation', quarter: 'Q4 2030' }, 'Personal cards.csv',
        'Resource;Q4 personal cards,\r\nAlex Stone;5,00\r\n');
      const personalCardsPreview = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/performance-imports/preview',
        payload: personalCardsUpload.payload,
        headers: {
          cookie: cookies.get('Administrator')!,
          'content-type': `multipart/form-data; boundary=${personalCardsUpload.boundary}`,
        },
      });
      assert.equal(personalCardsPreview.statusCode, 201, personalCardsPreview.body);
      assert.equal(personalCardsPreview.json<{ invalidValues: number }>().invalidValues, 0);
      const personalCards = personalCardsPreview.json<{ id: string }>();
      const personalCardsCommit = await authenticated('Administrator', 'POST',
        `/api/v1/admin/performance-imports/${personalCards.id}/commit`, { replace: false }, `performance-pc-${randomUUID()}`);
      assert.equal(personalCardsCommit.statusCode, 200, personalCardsCommit.body);

      const combinedKpiUpload = multipart({ kind: 'KPI', quarter: 'Q4 2030' }, 'KPI Systems.csv',
        'Resource;Efficiency,\r\nAlex Stone;1,13\r\n');
      const combinedKpiPreview = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/performance-imports/preview',
        payload: combinedKpiUpload.payload,
        headers: {
          cookie: cookies.get('Administrator')!,
          'content-type': `multipart/form-data; boundary=${combinedKpiUpload.boundary}`,
        },
      });
      assert.equal(combinedKpiPreview.statusCode, 201, combinedKpiPreview.body);
      assert.equal(combinedKpiPreview.json<{ duplicate: boolean }>().duplicate, false);
      const combinedKpi = combinedKpiPreview.json<{ id: string }>();
      const combinedKpiCommit = await authenticated('Administrator', 'POST',
        `/api/v1/admin/performance-imports/${combinedKpi.id}/commit`, { replace: false }, `performance-kpi-${randomUUID()}`);
      assert.equal(combinedKpiCommit.statusCode, 200, combinedKpiCommit.body);

      const employeeWorkspace = await authenticated('Employee', 'GET', '/api/v1/workspace');
      assert.equal(employeeWorkspace.statusCode, 200, employeeWorkspace.body);
      const combined = employeeWorkspace.json<{
        performance: Array<{ quarter: string; kpi: number; evaluation: number; kpiReward: number; evaluationReward: number }>;
        achievements: Array<{ category: string }>;
      }>();
      const q4 = combined.performance.find((item) => item.quarter === 'Q4 2030');
      assert.ok(q4);
      assert.deepEqual(
        (({ quarter: valueQuarter, kpi, evaluation, kpiReward, evaluationReward }) =>
          ({ quarter: valueQuarter, kpi, evaluation, kpiReward, evaluationReward }))(q4),
        { quarter: 'Q4 2030', kpi: 1.13, evaluation: 5, kpiReward: 3, evaluationReward: 3 },
      );
      assert.equal(combined.achievements.filter((item) => item.category === 'Performance').length, 1);

      const companyWorkspace = await authenticated('Head', 'GET', '/api/v1/workspace');
      assert.equal(companyWorkspace.statusCode, 200, companyWorkspace.body);
      const companyAchievements = companyWorkspace.json<{
        achievements: Array<{ employeeId: string; category: string }>;
      }>().achievements;
      assert.equal(companyAchievements.filter((item) =>
        item.employeeId === employeeIds.employee && item.category === 'Performance').length, 1);

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
      const updatedRules = await authenticated('Administrator', 'POST', '/api/v1/admin/rule-sets', {
        performanceThresholds,
      });
      assert.equal(updatedRules.statusCode, 200, updatedRules.body);
      const ruleSetId = updatedRules.json<{ id: string }>().id;

      const updatedWorkspace = await authenticated('Administrator', 'GET', '/api/v1/workspace');
      assert.equal(updatedWorkspace.statusCode, 200, updatedWorkspace.body);
      assert.deepEqual(updatedWorkspace.json<{ settings: { performanceThresholds: typeof performanceThresholds } }>()
        .settings.performanceThresholds, performanceThresholds);

      const configuredUpload = multipart({ kind: 'KPI', quarter: 'Q3 2031' }, 'Configured KPI.csv',
        'Resource;Efficiency,\r\nAlex Stone;1,10\r\n');
      const configuredPreviewResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/performance-imports/preview',
        payload: configuredUpload.payload,
        headers: {
          cookie: cookies.get('Administrator')!,
          'content-type': `multipart/form-data; boundary=${configuredUpload.boundary}`,
        },
      });
      assert.equal(configuredPreviewResponse.statusCode, 201, configuredPreviewResponse.body);
      const configuredPreview = configuredPreviewResponse.json<{
        id: string;
        rows: Array<{ reward: number }>;
      }>();
      assert.equal(configuredPreview.rows[0]!.reward, 4);
      const storedImport = await databasePool.query<{ rule_set_version_id: string }>(
        `SELECT rule_set_version_id FROM app.performance_imports WHERE id=$1`, [configuredPreview.id]);
      assert.equal(storedImport.rows[0]!.rule_set_version_id, ruleSetId);

      const configuredCommit = await authenticated('Administrator', 'POST',
        `/api/v1/admin/performance-imports/${configuredPreview.id}/commit`, { replace: false },
        `configured-performance-${randomUUID()}`);
      assert.equal(configuredCommit.statusCode, 200, configuredCommit.body);
      const storedRecord = await databasePool.query<{ proposed_white_amount: number; rule_set_version_id: string }>(
        `SELECT proposed_white_amount,rule_set_version_id FROM app.performance_records
          WHERE import_row_id IN (SELECT id FROM app.performance_import_rows WHERE import_id=$1)`,
        [configuredPreview.id]);
      assert.equal(Number(storedRecord.rows[0]!.proposed_white_amount), 4);
      assert.equal(storedRecord.rows[0]!.rule_set_version_id, ruleSetId);

      const invalidRules = await authenticated('Administrator', 'POST', '/api/v1/admin/rule-sets', {
        performanceThresholds: {
          ...performanceThresholds,
          personalCards: [
            { minimum: 3, reward: 1 },
            { minimum: 5.1, reward: 2 },
            { minimum: 5.5, reward: 3 },
          ],
        },
      });
      assert.equal(invalidRules.statusCode, 400, invalidRules.body);

      const cancellation = await authenticated('Head', 'DELETE',
        `/api/v1/quality-gates/${employeeIds.coordinator}/active`, undefined, `quality-gate-cancel-${randomUUID()}`);
      assert.equal(cancellation.statusCode, 200, cancellation.body);
      assert.equal(await count(`SELECT count(*) FROM app.audit_events WHERE action='QUALITY_GATE_CANCELLED' AND entity_id=$1`, [gateId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.outbox_events WHERE event_type='QualityGateCancelled' AND aggregate_id=$1`, [gateId]), 1);
      assert.equal(await count(`SELECT count(*) FROM app.notifications WHERE notification_type='System' AND object_id=$1`, [gateId]), 2);
    });

    test('parallel Purchase, Convert and Award requests execute once per idempotency key', async () => {
      const parallel = async (label: string, url: string, payload: unknown, key: string) => {
        const responses = await Promise.all([
          authenticated(label, 'POST', url, payload, key),
          authenticated(label, 'POST', url, payload, key),
        ]);
        assert.deepEqual(responses.map((response) => response.statusCode), [201, 201]);
        assert.equal(responses.filter((response) => response.headers['idempotency-replayed'] === 'true').length, 1);
        return responses;
      };

      const purchaseKey = `parallel-purchase-${randomUUID()}`;
      const purchasesBefore = await count(`SELECT count(*) FROM app.purchases WHERE employee_id=$1`, [employeeIds.employee]);
      await parallel('Employee', '/api/v1/shop/purchases', { productId }, purchaseKey);
      assert.equal(await count(`SELECT count(*) FROM app.purchases WHERE employee_id=$1`, [employeeIds.employee]), purchasesBefore + 1);

      const conversionKey = `parallel-conversion-${randomUUID()}`;
      const conversionsBefore = await count(`SELECT count(*) FROM app.conversion_operations WHERE employee_id=$1`, [employeeIds.employee]);
      await parallel('Employee', '/api/v1/conversions', { from: 'White', amount: 10 }, conversionKey);
      assert.equal(await count(`SELECT count(*) FROM app.conversion_operations WHERE employee_id=$1`, [employeeIds.employee]), conversionsBefore + 1);

      const awardKey = `parallel-award-${randomUUID()}`;
      const awardsBefore = await count(`SELECT count(*) FROM app.award_requests WHERE requested_by_employee_id=$1`, [employeeIds.coordinator]);
      await parallel('Coordinator', '/api/v1/awards', {
        recipientId: employeeIds.employee,
        categoryId: categoryIds.yellowParallel,
        description: 'Parallel idempotency award.',
      }, awardKey);
      assert.equal(await count(`SELECT count(*) FROM app.award_requests WHERE requested_by_employee_id=$1`, [employeeIds.coordinator]), awardsBefore + 1);
    });

    test('eligible-recipient SQL remains set-based with a realistic directory volume', async () => {
      const total = 1_000;
      const userIds = Array.from({ length: total }, () => randomUUID());
      const employeeIdsBulk = Array.from({ length: total }, () => randomUUID());
      const ordinals = Array.from({ length: total }, (_, index) => index + 1);
      const department = await databasePool.query<{ department_id: string }>(
        `SELECT department_id FROM app.employees WHERE id=$1`, [employeeIds.employee]);
      const role = await databasePool.query<{ id: string }>(`SELECT id FROM app.roles WHERE code='Employee'`);
      await databasePool.query(`INSERT INTO app.users
        (id,email,password_hash,auth_provider,provider_subject,account_status)
        SELECT value.user_id,('load-' || value.ordinal || '@c-job.test')::citext,NULL,'entra',
               'load-' || value.ordinal,'Approved'
          FROM unnest($1::uuid[],$2::int[]) AS value(user_id,ordinal)`, [userIds, ordinals]);
      await databasePool.query(`INSERT INTO app.employees
        (id,user_id,employee_number,first_name,last_name,display_name,contact_email,department_id,provisioned_role_code)
        SELECT value.employee_id,value.user_id,'LOAD-' || value.ordinal,'Load','Employee ' || value.ordinal,
               'Load Employee ' || value.ordinal,('load-' || value.ordinal || '@c-job.test')::citext,$4,'Employee'
          FROM unnest($1::uuid[],$2::uuid[],$3::int[]) AS value(employee_id,user_id,ordinal)`,
      [employeeIdsBulk, userIds, ordinals, department.rows[0]!.department_id]);
      await databasePool.query(`INSERT INTO app.role_assignments (user_id,role_id)
        SELECT generated.user_id,$2
          FROM unnest($1::uuid[]) AS generated(user_id)`, [userIds, role.rows[0]!.id]);

      const startedAt = performance.now();
      const response = await authenticated('Employee', 'GET', '/api/v1/eligible-recipients?purpose=recognition');
      const elapsed = performance.now() - startedAt;
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(response.json<Array<{ id: string }>>().length >= total);
      assert.ok(elapsed < 2_000, `set-based recipient lookup took ${elapsed.toFixed(1)}ms`);
    });
  });
}
