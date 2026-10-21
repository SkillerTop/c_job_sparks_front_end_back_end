import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Environment } from './config/env.js';
import {
  authenticate,
  clearSessionCookie,
  createAccessRequest,
  listSessions,
  login,
  meResponse,
  publicUser,
  revokeSession,
  setSessionCookie,
} from './auth.js';
import { createNotification, writeAudit, enqueueOutbox } from './audit.js';
import { PERSONAL_LEDGER_ROLES, requireRole } from './authorization.js';
import { hasFullPersonalLedger } from './domain.js';
import { withTransaction } from './db/transaction.js';
import { createDisenchantRequest, convertSparks, disenchantResponse, effectiveRuleSet } from './economy.js';
import { ApiError, badRequest, conflict, notFound } from './errors.js';
import { withIdempotency } from './idempotency.js';
import { employeeBalances, postLedgerOperation } from './ledger.js';
import { loadImage, storeImage } from './media.js';
import { principalOf, requestMetadata } from './request.js';
import { commitPerformanceImport, previewPerformanceCsv } from './performance.js';
import { performanceThresholdsFromConfiguration } from './performance-rules.js';
import {
  createAward,
  createRecognition,
  decideAward,
  decideRecognition,
  listEligibleRecipients,
} from './recognition.js';
import { hashPassword, safeEqual, tokenHash, validatePassword, verifyPassword } from './security.js';
import {
  activateInventoryItem,
  deleteAdminProduct,
  purchaseProduct,
  saveAdminProduct,
  shopAdminSnapshot,
  shopSnapshot,
} from './shop.js';
import { maybeOne, one, rows } from './sql.js';
import { buildWorkspace, buildWorkspaceLayout, type WorkspaceSection } from './workspace.js';
import {
  createMonthlyDisenchantReport,
  createRadiantFulfillment,
  createShopFulfillment,
  listDepartmentDisenchantReports,
  listFulfillmentContacts,
  listRewardFulfillments,
} from './fulfillment.js';
import {
  MICROSOFT_STATE_COOKIE,
  completeMicrosoftLogin,
  createMicrosoftAuthorization,
  exchangeMicrosoftCode,
  findMicrosoftAuthRequest,
  safeReturnPath,
} from './microsoft-auth.js';

const emailSchema = z.string().email().max(320).transform((value) => value.trim().toLowerCase());
const idSchema = z.string().uuid();
const roleSchema = z.enum(['Employee','Coordinator','GPM','Head','Top Management','Administrator']);
const employeeInput = z.object({
  id: z.string().uuid().or(z.literal('')).optional(),
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  departmentId: idSchema,
  role: roleSchema,
  email: emailSchema,
  active: z.boolean(),
  hasCoordinationExperience: z.boolean().optional(),
  managerId: idSchema.optional(),
});
const accessApprovalEmployeeInput = employeeInput.pick({
  name: true,
  title: true,
  departmentId: true,
  role: true,
  managerId: true,
});
const performanceRewardTierSchema = z.object({
  minimum: z.number().finite().nonnegative().max(1000),
  reward: z.number().int().nonnegative().max(100),
});
const performanceThresholdsSchema = z.object({
  kpi: z.array(performanceRewardTierSchema).length(3),
  personalCards: z.array(performanceRewardTierSchema).length(3),
}).superRefine((thresholds, context) => {
  for (const [source, tiers] of Object.entries(thresholds)) {
    for (let index = 1; index < tiers.length; index += 1) {
      if (tiers[index]!.minimum <= tiers[index - 1]!.minimum)
        context.addIssue({ code: 'custom', path: [source, index, 'minimum'],
          message: 'Thresholds must be strictly increasing.' });
      if (tiers[index]!.reward < tiers[index - 1]!.reward)
        context.addIssue({ code: 'custom', path: [source, index, 'reward'],
          message: 'Rewards must not decrease at a higher threshold.' });
    }
  }
  if (thresholds.personalCards.some((tier) => tier.minimum > 5))
    context.addIssue({ code: 'custom', path: ['personalCards'],
      message: 'Personal Cards thresholds cannot exceed 5.' });
});
const idempotencyKey = (request: FastifyRequest) => {
  const value = request.headers['idempotency-key'];
  return Array.isArray(value) ? value[0] : value;
};

const jsonBody = <T extends z.ZodTypeAny>(schema: T, request: FastifyRequest) => schema.parse(request.body);

const pagination = (request: FastifyRequest, defaultLimit = 50) => {
  const result = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(defaultLimit),
    cursor: z.string().max(512).optional(),
  }).parse(request.query);
  let cursor: { value: string; id: string } | null = null;
  if (result.cursor) {
    try {
      cursor = z.object({ value: z.string().min(1), id: z.string().min(1) })
        .parse(JSON.parse(Buffer.from(result.cursor, 'base64url').toString('utf8')));
    } catch {
      throw badRequest('INVALID_CURSOR', 'The pagination cursor is invalid or expired.');
    }
  }
  return { limit: result.limit, cursor };
};

const cursorPage = <T extends Record<string, unknown>>(
  values: T[],
  limit: number,
  valueKey: keyof T,
  idKey: keyof T = 'id',
) => {
  const hasNext = values.length > limit;
  const items = hasNext ? values.slice(0, limit) : values;
  const last = items.at(-1);
  const cursorValue = last?.[valueKey];
  const nextCursor = hasNext && last
    ? Buffer.from(JSON.stringify({
        value: cursorValue instanceof Date ? cursorValue.toISOString() : String(cursorValue),
        id: String(last[idKey]),
      }), 'utf8').toString('base64url')
    : null;
  return { items, nextCursor, hasNext };
};

const cursorSlice = <T extends Record<string, unknown>>(
  values: T[],
  limit: number,
  cursor: { id: string } | null,
  valueKey: keyof T,
) => {
  const position = cursor ? values.findIndex((value) => String(value.id) === cursor.id) + 1 : 0;
  return cursorPage(values.slice(Math.max(0, position), Math.max(0, position) + limit + 1), limit, valueKey);
};

const sendIdempotent = <T>(reply: FastifyReply, result: { value: T; statusCode: number; replayed: boolean }) => {
  if (result.replayed) void reply.header('idempotency-replayed', 'true');
  return reply.status(result.statusCode).send(result.value);
};

export const registerRoutes = async (app: FastifyInstance, environment: Environment) => {
  const secureCookie = environment.NODE_ENV === 'production';

  app.get('/api/v1/auth/microsoft/config', async () => ({
    enabled: environment.MICROSOFT_AUTH_ENABLED,
    registrationEnabled: true,
  }));

  app.get(
    '/api/v1/auth/microsoft/start',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { returnTo } = z.object({ returnTo: z.string().optional() }).parse(request.query);
      const authorization = await createMicrosoftAuthorization(
        app.db,
        environment,
        returnTo,
        requestMetadata(request),
      );
      reply.setCookie(MICROSOFT_STATE_COOKIE, authorization.state, {
        path: '/api/v1/auth/microsoft/callback',
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'lax',
        maxAge: 10 * 60,
      });
      return reply.redirect(authorization.authorizationUrl);
    },
  );

  app.get(
    '/api/v1/auth/microsoft/callback',
    { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const query = z.object({
        code: z.string().min(1).optional(),
        state: z.string().min(20).optional(),
        error: z.string().optional(),
      }).parse(request.query);
      const stateCookie = request.cookies[MICROSOFT_STATE_COOKIE];
      const clearStateCookie = () => reply.clearCookie(MICROSOFT_STATE_COOKIE, {
        path: '/api/v1/auth/microsoft/callback',
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'lax',
      });
      const failureRedirect = (code: string) => {
        const url = new URL('/login', environment.FRONTEND_ORIGIN);
        url.searchParams.set('microsoftError', code);
        return url.toString();
      };
      try {
        if (!query.state || !stateCookie || !safeEqual(query.state, stateCookie))
          throw badRequest('MICROSOFT_STATE_INVALID', 'This Microsoft sign-in attempt is invalid or expired.');
        if (query.error || !query.code)
          throw badRequest('MICROSOFT_SIGN_IN_CANCELLED', 'Microsoft sign-in was cancelled.');
        const authRequest = await findMicrosoftAuthRequest(app.db, query.state);
        if (!authRequest) throw badRequest('MICROSOFT_STATE_INVALID', 'This Microsoft sign-in attempt is invalid or expired.');
        const exchanged = await exchangeMicrosoftCode(query.code, authRequest, environment);
        const result = await withTransaction(app.db, (db) => completeMicrosoftLogin(
          db,
          query.state!,
          exchanged.identity,
          exchanged.avatarDataUrl,
          requestMetadata(request),
          environment.SESSION_TTL_HOURS,
        ));
        clearStateCookie();
        if (result.status === 'Pending') {
          const pendingUrl = new URL('/login', environment.FRONTEND_ORIGIN);
          pendingUrl.searchParams.set('microsoftStatus', 'Pending');
          pendingUrl.searchParams.set('email', result.email);
          return reply.redirect(pendingUrl.toString());
        }
        setSessionCookie(reply, result.token, result.expiresAt, secureCookie, environment.SESSION_COOKIE_NAME);
        return reply.redirect(new URL(safeReturnPath(result.returnPath), environment.FRONTEND_ORIGIN).toString());
      } catch (error) {
        clearStateCookie();
        const code = error instanceof ApiError ? error.code : 'MICROSOFT_SIGN_IN_FAILED';
        if (!(error instanceof ApiError)) request.log.error({ err: error }, 'Microsoft sign-in callback failed');
        return reply.redirect(failureRedirect(code));
      }
    },
  );

  app.post('/api/v1/auth/access-requests', async (request, reply) => {
    const input = jsonBody(
      z.object({ email: emailSchema, password: z.string().min(1).max(128), confirmPassword: z.string().min(1).max(128) }),
      request,
    );
    const account = await withTransaction(app.db, async (db) => {
      const created = await createAccessRequest(db, input, requestMetadata(request));
      const accountId = created.id;
      const requestRecord = await one<{ id: string }>(db, `SELECT id FROM app.access_requests
        WHERE resulting_user_id=$1 AND status='Pending' ORDER BY requested_at DESC LIMIT 1`, [accountId]);
      await writeAudit(db, { actorUserId: accountId, action: 'ACCESS_REQUESTED', objectType: 'AccessRequest',
        objectId: requestRecord.id, after: { email: input.email }, requestId: request.id, ip: request.ip,
        userAgent: request.headers['user-agent'] });
      const administrators = await rows<{ id: string }>(db, `SELECT DISTINCT account_user.id FROM app.users account_user
        JOIN app.role_assignments assignment ON assignment.user_id=account_user.id
        JOIN app.roles role ON role.id=assignment.role_id AND role.code='Administrator'
        WHERE account_user.account_status='Approved' AND assignment.ends_at IS NULL`);
      for (const administrator of administrators) await createNotification(db, administrator.id, 'ApprovalRequested',
        'New access request', `${input.email} requested access.`, 'AccessRequest', requestRecord.id);
      await enqueueOutbox(db, 'AccessRequested', 'AccessRequest', requestRecord.id, { accountId, email: input.email });
      return created;
    });
    return reply.status(201).send(account);
  });

  app.get('/api/v1/media/:id', async (request, reply) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const { width } = z.object({
      width: z.coerce.number().int().refine((value) => [320, 640, 960].includes(value)).optional(),
    }).parse(request.query);
    const asset = await loadImage(app.db, environment.MEDIA_ROOT, id, width);
    return reply.type(asset.contentType).header('cache-control', 'public, max-age=31536000, immutable').send(asset.contents);
  });

  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const input = jsonBody(z.object({ email: emailSchema, password: z.string().min(1).max(128) }), request);
      // Authentication failures are business outcomes: their counters and
      // login events must commit instead of being rolled back with the error.
      const attempt = await withTransaction(app.db, async (db) => {
        try {
          return { ok: true as const, result: await login(db, input, requestMetadata(request), environment.SESSION_TTL_HOURS) };
        } catch (error) {
          if (error instanceof ApiError) return { ok: false as const, error };
          throw error;
        }
      });
      if (!attempt.ok) throw attempt.error;
      const result = attempt.result;
      setSessionCookie(reply, result.token, result.expiresAt, secureCookie, environment.SESSION_COOKIE_NAME);
      const user = await publicUser(app.db, result.userId);
      return {
        account: {
          id: result.userId,
          accountId: result.userId,
          employeeId: user.employeeId,
          email: user.email,
          status: 'Approved',
          source: 'Seed',
          requestedAt: new Date().toISOString(),
        },
        user,
        session: { id: result.sessionId, expiresAt: result.expiresAt.toISOString() },
      };
    },
  );

  app.post('/api/v1/auth/password-reset/request', async (request, reply) => {
    const { email } = jsonBody(z.object({ email: emailSchema }), request);
    await withTransaction(app.db, async (db) => {
      const user = await maybeOne<{ id: string }>(db, `SELECT id FROM app.users WHERE lower(email::text)=lower($1)`, [email]);
      if (!user) return;
      const rawToken = randomUUID() + randomUUID();
      const tokenId = randomUUID();
      await db.query(
        `INSERT INTO app.password_reset_tokens (id,user_id,token_hash,expires_at,request_ip)
         VALUES ($1,$2,$3,clock_timestamp()+interval '30 minutes',$4)`,
        [tokenId, user.id, tokenHash(rawToken), request.ip],
      );
      await enqueueOutbox(db, 'PasswordResetRequested', 'PasswordReset', tokenId, { userId: user.id, token: rawToken });
    });
    return reply.status(202).send({ accepted: true });
  });

  app.post('/api/v1/auth/password-reset/confirm', async (request) => {
    const input = jsonBody(z.object({ token: z.string().min(20), password: z.string().max(128) }), request);
    const validation = validatePassword(input.password);
    if (!validation.valid) throw badRequest('INVALID_PASSWORD', 'Password does not meet requirements.', { issues: validation.issues });
    await withTransaction(app.db, async (db) => {
      const reset = await maybeOne<{ id: string; user_id: string }>(
        db,
        `SELECT id,user_id FROM app.password_reset_tokens
          WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,
        [tokenHash(input.token)],
      );
      if (!reset) throw badRequest('INVALID_RESET_TOKEN', 'This password reset link is invalid or expired.');
      await db.query(`UPDATE app.users SET password_hash=$2,password_changed_at=clock_timestamp() WHERE id=$1`, [
        reset.user_id,
        await hashPassword(input.password),
      ]);
      await db.query(`UPDATE app.password_reset_tokens SET consumed_at=clock_timestamp() WHERE id=$1`, [reset.id]);
      await db.query(`UPDATE app.sessions SET revoked_at=clock_timestamp(),revoked_reason='Password reset' WHERE user_id=$1 AND revoked_at IS NULL`, [reset.user_id]);
    });
    return { completed: true };
  });

  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', async (request) => {
      await authenticate(app.db, request, environment.SESSION_COOKIE_NAME);
    });

    protectedApp.get('/api/v1/me', async (request) => meResponse(app.db, principalOf(request)));

    protectedApp.post('/api/v1/auth/logout', async (request, reply) => {
      const principal = principalOf(request);
      await withTransaction(app.db, (db) => revokeSession(db, principal, principal.sessionId, 'User logged out.'));
      clearSessionCookie(reply, secureCookie, environment.SESSION_COOKIE_NAME);
      return reply.status(204).send();
    });

    protectedApp.post('/api/v1/auth/logout-all', async (request, reply) => {
      const principal = principalOf(request);
      await app.db.query(
        `UPDATE app.sessions SET revoked_at=clock_timestamp(),revoked_reason='Logout from all devices'
          WHERE user_id=$1 AND revoked_at IS NULL`,
        [principal.userId],
      );
      clearSessionCookie(reply, secureCookie, environment.SESSION_COOKIE_NAME);
      return reply.status(204).send();
    });

    protectedApp.get('/api/v1/me/sessions', async (request) => listSessions(app.db, principalOf(request)));
    protectedApp.delete('/api/v1/me/sessions/:id', async (request, reply) => {
      const principal = principalOf(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      await withTransaction(app.db, (db) => revokeSession(db, principal, id));
      if (id === principal.sessionId) clearSessionCookie(reply, secureCookie, environment.SESSION_COOKIE_NAME);
      return reply.status(204).send();
    });
    protectedApp.delete('/api/v1/me/sessions', async (request, reply) => {
      const principal = principalOf(request);
      await app.db.query(
        `UPDATE app.sessions SET revoked_at=clock_timestamp(),revoked_reason='User revoked all sessions'
          WHERE user_id=$1 AND revoked_at IS NULL`,
        [principal.userId],
      );
      clearSessionCookie(reply, secureCookie, environment.SESSION_COOKIE_NAME);
      return reply.status(204).send();
    });

    protectedApp.post('/api/v1/me/password', async (request, reply) => {
      const principal = principalOf(request);
      const input = jsonBody(
        z.object({ currentPassword: z.string(), newPassword: z.string().max(128), confirmPassword: z.string() }),
        request,
      );
      if (input.newPassword !== input.confirmPassword) throw badRequest('PASSWORD_MISMATCH', 'Passwords do not match.');
      const validation = validatePassword(input.newPassword);
      if (!validation.valid) throw badRequest('INVALID_PASSWORD', 'Password does not meet requirements.', { issues: validation.issues });
      await withTransaction(app.db, async (db) => {
        const user = await one<{ password_hash: string | null; auth_provider: 'local' | 'entra' }>(
          db,
          `SELECT password_hash,auth_provider FROM app.users WHERE id=$1 FOR UPDATE`,
          [principal.userId],
        );
        if (user.auth_provider === 'entra' || !user.password_hash)
          throw new ApiError(403, 'MICROSOFT_PASSWORD_MANAGED', 'Password changes are managed by Microsoft.');
        if (!(await verifyPassword(user.password_hash, input.currentPassword)))
          throw badRequest('INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
        await db.query(`UPDATE app.users SET password_hash=$2,password_changed_at=clock_timestamp() WHERE id=$1`, [
          principal.userId,
          await hashPassword(input.newPassword),
        ]);
        await db.query(
          `UPDATE app.sessions SET revoked_at=clock_timestamp(),revoked_reason='Password changed'
            WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`,
          [principal.userId, principal.sessionId],
        );
      });
      return reply.status(204).send();
    });

    protectedApp.get('/api/v1/me/preferences', async (request) => {
      const principal = principalOf(request);
      const row = await one<any>(
        app.db,
        `INSERT INTO app.user_preferences (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id
         RETURNING *`,
        [principal.userId],
      );
      return {
        employeeId: principal.employeeId,
        contactEmail: principal.email,
        language: row.language,
        notifications: {
          rewards: row.notification_settings.rewards ?? true,
          approvals: row.notification_settings.approvals ?? true,
          purchases: row.notification_settings.purchases ?? true,
          system: row.notification_settings.system ?? true,
        },
        avatarDataUrl: row.accessibility_settings.avatarDataUrl,
      };
    });

    protectedApp.patch('/api/v1/me/preferences', async (request) => {
      const principal = principalOf(request);
      const input = jsonBody(
        z.object({
          language: z.enum(['en', 'uk', 'ru']),
          notifications: z.object({ rewards: z.boolean(), approvals: z.boolean(), purchases: z.boolean(), system: z.boolean() }),
        }),
        request,
      );
      await app.db.query(
        `INSERT INTO app.user_preferences (user_id,language,notification_settings)
         VALUES ($1,$2,$3::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET language=EXCLUDED.language,notification_settings=EXCLUDED.notification_settings`,
        [principal.userId, input.language, JSON.stringify(input.notifications)],
      );
      return {
        employeeId: principal.employeeId,
        contactEmail: principal.email,
        language: input.language,
        notifications: input.notifications,
      };
    });

    protectedApp.post('/api/v1/me/avatar', async () => {
      throw new ApiError(403, 'MICROSOFT_AVATAR_MANAGED', 'Profile photos are synchronized from Microsoft accounts.');
    });
    protectedApp.delete('/api/v1/me/avatar', async () => {
      throw new ApiError(403, 'MICROSOFT_AVATAR_MANAGED', 'Profile photos are synchronized from Microsoft accounts.');
    });
    protectedApp.post('/api/v1/me/email-change', async () => {
      throw new ApiError(403, 'WORK_EMAIL_IMMUTABLE', 'The work email is managed by the employee directory and cannot be changed here.');
    });

    protectedApp.get('/api/v1/workspace', async (request, reply) => {
      const { section } = z.object({ section: z.enum([
        'dashboard','profile','sparks','recognition','achievements','company-achievements','shop','inventory',
        'convert','disenchant','team','award','approvals','admin','rules','all',
      ]).default('all') }).parse(request.query) as { section: WorkspaceSection };
      void reply.header('cache-control', 'private, no-store');
      return withTransaction(app.db, (db) => buildWorkspace(db, principalOf(request), section), { readOnly: true });
    });
    protectedApp.get('/api/v1/workspace/layout', async (request, reply) => {
      void reply.header('cache-control', 'private, no-store');
      return withTransaction(app.db, (db) => buildWorkspaceLayout(db, principalOf(request)), { readOnly: true });
    });
    protectedApp.post('/api/v1/telemetry/web-vitals', async (request, reply) => {
      const metric = jsonBody(z.object({
        path: z.string().startsWith('/').max(200),
        lcp: z.number().nonnegative().max(120_000),
        cls: z.number().nonnegative().max(100),
        inp: z.number().nonnegative().max(120_000),
        navigationType: z.string().max(40),
      }), request);
      request.log.info({ webVitals: metric }, 'Client Web Vitals');
      return reply.status(202).send({ accepted: true });
    });
    protectedApp.get('/api/v1/me/spark-balances', async (request) => {
      const principal = requireRole(principalOf(request), PERSONAL_LEDGER_ROLES);
      const balances = await withTransaction(app.db, (db) => employeeBalances(db, principal.employeeId), { readOnly: true });
      return hasFullPersonalLedger(principal.role)
        ? balances
        : { White: 0, Yellow: 0, Blue: 0, Radiant: balances.Radiant };
    });
    protectedApp.get('/api/v1/me/ledger', async (request) => {
      const principal = requireRole(principalOf(request), PERSONAL_LEDGER_ROLES);
      const query = pagination(request);
      const values = await rows<any>(
        app.db,
        `SELECT le.id,sa.spark_type,le.amount,le.entry_kind,le.description,le.occurred_at::text AS occurred_at,
                op.operation_type,op.source_type,op.source_id
           FROM app.spark_ledger_entries le JOIN app.spark_accounts sa ON sa.id=le.account_id
           JOIN app.spark_operations op ON op.id=le.operation_id
          WHERE sa.employee_id=$1 AND ($2 OR sa.spark_type='Radiant')
            AND ($3::timestamptz IS NULL OR (le.occurred_at,le.id)<($3::timestamptz,$4::bigint))
          ORDER BY le.occurred_at DESC,le.id DESC LIMIT $5`,
        [principal.employeeId, hasFullPersonalLedger(principal.role), query.cursor?.value ?? null,
          query.cursor?.id ?? null, query.limit + 1],
      );
      return cursorPage(values, query.limit, 'occurred_at');
    });
    protectedApp.get('/api/v1/spark-categories', async () =>
      rows<any>(app.db, `SELECT c.id,c.spark_type,c.usage_type,v.* FROM app.spark_categories c
        JOIN LATERAL (SELECT value.* FROM app.spark_category_versions value WHERE value.category_id=c.id
          AND value.status='Active' AND value.effective_from<=clock_timestamp()
          AND (value.effective_to IS NULL OR value.effective_to>clock_timestamp()) ORDER BY value.version DESC LIMIT 1) v ON true
        WHERE c.is_active ORDER BY c.spark_type,v.name`),
    );
    protectedApp.get('/api/v1/eligible-recipients', async (request) => {
      const principal = principalOf(request);
      const { purpose } = z.object({ purpose: z.enum(['recognition', 'award']) }).parse(request.query);
      return withTransaction(app.db, (db) => listEligibleRecipients(db, principal, purpose), { readOnly: true });
    });

    protectedApp.get('/api/v1/recognitions', async (request) => {
      const principal = principalOf(request);
      const query = pagination(request);
      const values = await rows<any>(app.db, `SELECT recognition.*,recognition.requested_at::text AS requested_at,
        version.name AS category,category.id AS category_id,
        nominator.display_name AS nominator_name,recipient.display_name AS recipient_name
        FROM app.recognitions recognition
        JOIN app.spark_category_versions version ON version.id=recognition.category_version_id
        JOIN app.spark_categories category ON category.id=version.category_id
        JOIN app.employees nominator ON nominator.id=recognition.nominator_employee_id
        JOIN app.employees recipient ON recipient.id=recognition.recipient_employee_id
        WHERE (recognition.nominator_employee_id=$1 OR recognition.recipient_employee_id=$1
          OR ($2='Head' AND recognition.recipient_department_id=$3))
          AND ($4::timestamptz IS NULL OR (recognition.requested_at,recognition.id)<($4::timestamptz,$5::uuid))
        ORDER BY recognition.requested_at DESC,recognition.id DESC LIMIT $6`,
      [principal.employeeId, principal.role, principal.departmentId, query.cursor?.value ?? null,
        query.cursor?.id ?? null, query.limit + 1]);
      return cursorPage(values, query.limit, 'requested_at');
    });
    protectedApp.get('/api/v1/award-requests', async (request) => {
      const principal = principalOf(request);
      const query = pagination(request);
      const values = await rows<any>(app.db, `SELECT award.*,award.requested_at::text AS requested_at,
        COALESCE(version.name,award.metadata->>'radiantReason',award.spark_type || ' Award') AS category,
        category.id AS category_id,requester.display_name AS requester_name,recipient.display_name AS recipient_name
        FROM app.award_requests award
        LEFT JOIN app.spark_category_versions version ON version.id=award.category_version_id
        LEFT JOIN app.spark_categories category ON category.id=version.category_id
        JOIN app.employees requester ON requester.id=award.requested_by_employee_id
        JOIN app.employees recipient ON recipient.id=award.recipient_employee_id
        WHERE (award.requested_by_employee_id=$1 OR award.recipient_employee_id=$1
          OR ($2='Head' AND award.recipient_department_id=$3))
          AND ($4::timestamptz IS NULL OR (award.requested_at,award.id)<($4::timestamptz,$5::uuid))
        ORDER BY award.requested_at DESC,award.id DESC LIMIT $6`,
      [principal.employeeId, principal.role, principal.departmentId, query.cursor?.value ?? null,
        query.cursor?.id ?? null, query.limit + 1]);
      return cursorPage(values, query.limit, 'requested_at');
    });
    protectedApp.get('/api/v1/approvals', async (request) => {
      const principal = principalOf(request);
      if (principal.role === 'Head') {
        const [recognitions, awards, disenchant] = await Promise.all([
          rows<any>(app.db, `SELECT recognition.*,version.name AS category,recipient.display_name AS recipient_name,
            nominator.display_name AS requester_name FROM app.recognitions recognition
            JOIN app.spark_category_versions version ON version.id=recognition.category_version_id
            JOIN app.employees recipient ON recipient.id=recognition.recipient_employee_id
            JOIN app.employees nominator ON nominator.id=recognition.nominator_employee_id
            WHERE recognition.status='Pending' AND recognition.recipient_department_id=$1 ORDER BY recognition.requested_at`, [principal.departmentId]),
          rows<any>(app.db, `SELECT award.*,COALESCE(version.name,award.spark_type || ' Award') AS category,
            recipient.display_name AS recipient_name,requester.display_name AS requester_name
            FROM app.award_requests award LEFT JOIN app.spark_category_versions version ON version.id=award.category_version_id
            JOIN app.employees recipient ON recipient.id=award.recipient_employee_id
            JOIN app.employees requester ON requester.id=award.requested_by_employee_id
            WHERE award.status='Pending' AND award.recipient_department_id=$1 ORDER BY award.requested_at`, [principal.departmentId]),
          rows<any>(app.db, `SELECT request.*,employee.display_name AS employee_name
            FROM app.disenchant_requests request JOIN app.employees employee ON employee.id=request.employee_id
            WHERE request.department_id=$1 AND request.status IN ('Created','Exported') ORDER BY request.created_at`, [principal.departmentId]),
        ]);
        return { recognitions, awards, disenchant, total: recognitions.length + awards.length + disenchant.length };
      }
      if (principal.role === 'Administrator') {
        const [accessRequests, disenchant] = await Promise.all([
          rows<any>(app.db, `SELECT request.*,account_user.email::text,employee.display_name AS employee_name
            FROM app.access_requests request LEFT JOIN app.users account_user ON account_user.id=request.resulting_user_id
            LEFT JOIN app.employees employee ON employee.user_id=account_user.id
            WHERE request.status='Pending' ORDER BY request.requested_at`),
          rows<any>(app.db, `SELECT request.*,employee.display_name AS employee_name,department.name AS department_name
            FROM app.disenchant_requests request JOIN app.employees employee ON employee.id=request.employee_id
            JOIN app.departments department ON department.id=request.department_id
            WHERE request.status IN ('Created','Exported') ORDER BY request.created_at`),
        ]);
        return { accessRequests, disenchant, total: accessRequests.length + disenchant.length };
      }
      return { recognitions: [], awards: [], disenchant: [], total: 0 };
    });

    protectedApp.post('/api/v1/recognitions', async (request, reply) => {
      const principal = principalOf(request);
      const input = jsonBody(
        z.object({ recipientId: idSchema, categoryId: idSchema, description: z.string().min(1).max(4000) }),
        request,
      );
      const result = await withIdempotency(app.db, principal.userId, 'recognitions:create', idempotencyKey(request), input, 201,
        async (db) => {
          const recognition = await createRecognition(db, principal, input, request.id);
          const approver = await maybeOne<{ user_id: string }>(db, `SELECT head.user_id FROM app.employees recipient
            JOIN app.departments department ON department.id=recipient.department_id
            JOIN app.employees head ON head.id=department.head_employee_id
            WHERE recipient.id=$1 AND head.user_id IS NOT NULL`, [input.recipientId]);
          if (approver) await createNotification(db, approver.user_id, 'ApprovalRequested', 'Peer Recognition approval',
            'A new Peer Recognition request needs your decision.', 'Recognition', recognition.id);
          await enqueueOutbox(db, 'RecognitionRequested', 'Recognition', recognition.id, recognition);
          await writeAudit(db, { actorUserId: principal.userId, action: 'RECOGNITION_REQUESTED', objectType: 'Recognition',
            objectId: recognition.id, after: input, requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
          return recognition;
        });
      return sendIdempotent(reply, result);
    });
    protectedApp.post('/api/v1/recognitions/:id/decision', async (request, reply) => {
      const principal = principalOf(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = jsonBody(z.object({ decision: z.enum(['Approved', 'Rejected']), reason: z.string().default('') }), request);
      const result = await withIdempotency(app.db, principal.userId, `recognitions:${id}:decision`, idempotencyKey(request), input, 200,
        async (db) => {
          await decideRecognition(db, principal, id, input.decision, input.reason, request.id);
          const subject = await one<{ nominator_user_id: string | null; recipient_user_id: string | null }>(db, `SELECT
            nominator.user_id AS nominator_user_id,recipient.user_id AS recipient_user_id
            FROM app.recognitions recognition JOIN app.employees nominator ON nominator.id=recognition.nominator_employee_id
            JOIN app.employees recipient ON recipient.id=recognition.recipient_employee_id WHERE recognition.id=$1`, [id]);
          const notificationType = input.decision === 'Approved' ? 'AwardApproved' : 'AwardRejected';
          if (subject.nominator_user_id) await createNotification(db, subject.nominator_user_id, notificationType,
            `Peer Recognition ${input.decision.toLowerCase()}`, input.reason || `Your request was ${input.decision.toLowerCase()}.`, 'Recognition', id);
          if (input.decision === 'Approved' && subject.recipient_user_id)
            await createNotification(db, subject.recipient_user_id, 'SparksCredited', 'White Sparks credited',
              'A Peer Recognition award was credited to your balance.', 'Recognition', id);
          await enqueueOutbox(db, `Recognition${input.decision}`, 'Recognition', id, { decision: input.decision });
          await writeAudit(db, { actorUserId: principal.userId, action: `RECOGNITION_${input.decision.toUpperCase()}`,
            objectType: 'Recognition', objectId: id, reason: input.reason, after: { status: input.decision },
            requestId: request.id, ip: request.ip, userAgent: request.headers['user-agent'] });
          return { id, status: input.decision };
        });
      return sendIdempotent(reply, result);
    });
    protectedApp.post('/api/v1/awards', async (request, reply) => {
      const principal = principalOf(request);
      const input = jsonBody(z.object({
        recipientId: idSchema,
        categoryId: idSchema.optional(),
        description: z.string().min(1).max(4000),
        radiantReason: z.string().optional(),
        fulfillmentContactId: idSchema.optional(),
        radiantRewardKind: z.enum(['RadiantAcrylic', 'RadiantVesselModel']).optional(),
        valuablePrizeDescription: z.string().trim().min(1).max(1000).optional(),
      }), request);
      const awardInput = {
        recipientId: input.recipientId,
        description: input.description,
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.radiantReason ? { radiantReason: input.radiantReason } : {}),
      };
      const result = await withIdempotency(app.db, principal.userId, 'awards:create', idempotencyKey(request), awardInput, 201,
        async (db) => {
          const award = await createAward(db, principal, awardInput, request.id);
          if (award.sparkType === 'Radiant') {
            if (!input.fulfillmentContactId || !input.radiantRewardKind || !input.valuablePrizeDescription)
              throw badRequest('RADIANT_FULFILLMENT_REQUIRED',
                'Choose the physical Radiant reward, responsible person and valuable prize description.');
            await createRadiantFulfillment(db, principal, award.id, input.recipientId, {
              contactId: input.fulfillmentContactId,
              rewardKind: input.radiantRewardKind,
              valuablePrizeDescription: input.valuablePrizeDescription,
            });
          }
          if (award.status === 'Pending') {
            const approver = await maybeOne<{ user_id: string }>(db, `SELECT head.user_id FROM app.employees recipient
              JOIN app.departments department ON department.id=recipient.department_id
              JOIN app.employees head ON head.id=department.head_employee_id
              WHERE recipient.id=$1 AND head.user_id IS NOT NULL`, [input.recipientId]);
            if (approver) await createNotification(db, approver.user_id, 'ApprovalRequested', 'Spark award approval',
              'A new Spark award request needs your decision.', 'Award', award.id);
          } else {
            const recipient = await maybeOne<{ user_id: string }>(db,
              `SELECT user_id FROM app.employees WHERE id=$1 AND user_id IS NOT NULL`, [input.recipientId]);
            if (recipient) await createNotification(db, recipient.user_id, 'SparksCredited', `${award.sparkType} Sparks credited`,
              'A direct award was credited to your balance.', 'Award', award.id);
          }
          await enqueueOutbox(db, 'AwardCreated', 'Award', award.id, award);
          await writeAudit(db, { actorUserId: principal.userId, action: 'AWARD_CREATED', objectType: 'Award',
            objectId: award.id, after: awardInput, requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
          return award;
        });
      return sendIdempotent(reply, result);
    });
    protectedApp.post('/api/v1/award-requests/:id/decision', async (request, reply) => {
      const principal = principalOf(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = jsonBody(z.object({ decision: z.enum(['Approved', 'Rejected']), reason: z.string().default('') }), request);
      const result = await withIdempotency(app.db, principal.userId, `awards:${id}:decision`, idempotencyKey(request), input, 200,
        async (db) => {
          await decideAward(db, principal, id, input.decision, input.reason, request.id);
          const subject = await one<{ requester_user_id: string | null; recipient_user_id: string | null }>(db, `SELECT
            requester.user_id AS requester_user_id,recipient.user_id AS recipient_user_id
            FROM app.award_requests award JOIN app.employees requester ON requester.id=award.requested_by_employee_id
            JOIN app.employees recipient ON recipient.id=award.recipient_employee_id WHERE award.id=$1`, [id]);
          const notificationType = input.decision === 'Approved' ? 'AwardApproved' : 'AwardRejected';
          if (subject.requester_user_id) await createNotification(db, subject.requester_user_id, notificationType,
            `Award request ${input.decision.toLowerCase()}`, input.reason || `Your request was ${input.decision.toLowerCase()}.`, 'Award', id);
          if (input.decision === 'Approved' && subject.recipient_user_id)
            await createNotification(db, subject.recipient_user_id, 'SparksCredited', 'Sparks credited',
              'An approved award was credited to your balance.', 'Award', id);
          await enqueueOutbox(db, `Award${input.decision}`, 'Award', id, { decision: input.decision });
          await writeAudit(db, { actorUserId: principal.userId, action: `AWARD_${input.decision.toUpperCase()}`,
            objectType: 'Award', objectId: id, reason: input.reason, after: { status: input.decision },
            requestId: request.id, ip: request.ip, userAgent: request.headers['user-agent'] });
          return { id, status: input.decision };
        });
      return sendIdempotent(reply, result);
    });

    protectedApp.post('/api/v1/conversions', async (request, reply) => {
      const principal = principalOf(request);
      const input = jsonBody(z.object({ from: z.enum(['White', 'Yellow']), amount: z.number().int().positive() }), request);
      const result = await withIdempotency(app.db, principal.userId, 'conversions:create', idempotencyKey(request), input, 201,
        async (db) => {
          const conversion = await convertSparks(db, principal, input.from, input.amount, request.id);
          await enqueueOutbox(db, 'SparksConverted', 'Conversion', conversion.id, conversion);
          await writeAudit(db, { actorUserId: principal.userId, action: 'SPARKS_CONVERTED', objectType: 'Conversion',
            objectId: conversion.id, after: input, requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
          return conversion;
        });
      return sendIdempotent(reply, result);
    });
    protectedApp.post('/api/v1/disenchant-requests', async (request, reply) => {
      const principal = principalOf(request);
      const input = jsonBody(z.object({ sparkType: z.enum(['White', 'Yellow', 'Blue']), amount: z.number().int().positive() }), request);
      const result = await withIdempotency(app.db, principal.userId, 'disenchant:create', idempotencyKey(request), input, 201,
        async (db) => {
          const created = await createDisenchantRequest(db, principal, input.sparkType, input.amount, request.id);
          const id = String(created.id);
          const response = disenchantResponse(created);
          const head = await maybeOne<{ user_id: string }>(db, `SELECT employee.user_id FROM app.departments department
            JOIN app.employees employee ON employee.id=department.head_employee_id
            WHERE department.id=$1 AND employee.user_id IS NOT NULL`, [principal.departmentId]);
          if (head) await createNotification(db, head.user_id, 'ApprovalRequested', 'New Disenchant request',
            'A new department Disenchant request is ready for review.', 'Disenchant', id);
          await enqueueOutbox(db, 'DisenchantRequested', 'Disenchant', id, response);
          await writeAudit(db, { actorUserId: principal.userId, action: 'DISENCHANT_REQUESTED', objectType: 'DisenchantRequest',
            objectId: id, after: input, requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
          return response;
        });
      return sendIdempotent(reply, result);
    });
    protectedApp.get('/api/v1/me/disenchant-requests', async (request) => {
      const principal = principalOf(request);
      const query = pagination(request);
      const values = (await rows<any>(app.db, `SELECT request.*,request.created_at::text AS created_at
        FROM app.disenchant_requests request WHERE employee_id=$1
        AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
        ORDER BY created_at DESC,id DESC LIMIT $4`, [principal.employeeId, query.cursor?.value ?? null,
        query.cursor?.id ?? null, query.limit + 1])).map(disenchantResponse);
      return cursorPage(values, query.limit, 'createdAt');
    });
    protectedApp.get('/api/v1/department/disenchant-requests', async (request) => {
      const principal = requireRole(principalOf(request), ['Head']);
      const query = pagination(request);
      const values = (await rows<any>(app.db, `SELECT request.*,request.created_at::text AS created_at,
        employee.display_name AS employee_name
        FROM app.disenchant_requests request JOIN app.employees employee ON employee.id=request.employee_id
        WHERE request.department_id=$1
          AND ($2::timestamptz IS NULL OR (request.created_at,request.id)<($2::timestamptz,$3::uuid))
        ORDER BY request.created_at DESC,request.id DESC LIMIT $4`,
      [principal.departmentId, query.cursor?.value ?? null, query.cursor?.id ?? null,
        query.limit + 1])).map(disenchantResponse);
      return cursorPage(values, query.limit, 'createdAt');
    });
    protectedApp.get('/api/v1/department/disenchant-reports', async (request) => {
      const principal = requireRole(principalOf(request), ['Head']);
      const query = pagination(request, 24);
      const reports = await listDepartmentDisenchantReports(app.db, principal.departmentId);
      return cursorSlice(reports, query.limit, query.cursor, 'createdAt');
    });
    protectedApp.post('/api/v1/department/disenchant-reports', async (request, reply) => {
      const principal = requireRole(principalOf(request), ['Head']);
      const input = jsonBody(z.object({ reportMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }), request);
      const result = await withIdempotency(app.db, principal.userId, `disenchant:monthly-report:${input.reportMonth}`,
        idempotencyKey(request), input, 201, (db) => createMonthlyDisenchantReport(db, principal, input.reportMonth, {
          requestId: request.id,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        }));
      return sendIdempotent(reply, result);
    });
    protectedApp.post('/api/v1/department/disenchant-reports/current', async (request, reply) => {
      const principal = requireRole(principalOf(request), ['Head']);
      const reportMonth = new Date().toISOString().slice(0, 7);
      const result = await withIdempotency(app.db, principal.userId, 'disenchant:monthly-report',
        idempotencyKey(request), {}, 201, (db) => createMonthlyDisenchantReport(db, principal, reportMonth, {
          requestId: request.id,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        }));
      return sendIdempotent(reply, result);
    });
    protectedApp.get('/api/v1/reward-fulfillment-contacts', async () => listFulfillmentContacts(app.db));
    protectedApp.get('/api/v1/me/achievements', async (request) => {
      const principal = principalOf(request);
      const query = pagination(request);
      const values = await rows<any>(app.db, `SELECT achievement.*,achievement.occurred_at::text AS occurred_at,
        version.name AS category
        FROM app.achievements achievement LEFT JOIN app.spark_category_versions version ON version.id=achievement.category_version_id
        WHERE achievement.employee_id=$1
          AND ($2::timestamptz IS NULL OR (achievement.occurred_at,achievement.id)<($2::timestamptz,$3::uuid))
        ORDER BY achievement.occurred_at DESC,achievement.id DESC LIMIT $4`,
      [principal.employeeId, query.cursor?.value ?? null, query.cursor?.id ?? null, query.limit + 1]);
      return cursorPage(values, query.limit, 'occurred_at');
    });
    protectedApp.get('/api/v1/me/performance', async (request) => {
      const principal = principalOf(request);
      const query = pagination(request);
      const values = await rows<any>(app.db, `SELECT * FROM app.performance_records WHERE employee_id=$1 AND status<>'Superseded'
        AND ($2::date IS NULL OR (period_start,id)<($2::date,$3::uuid))
        ORDER BY period_start DESC,id DESC LIMIT $4`, [principal.employeeId, query.cursor?.value ?? null,
        query.cursor?.id ?? null, query.limit + 1]);
      return cursorPage(values, query.limit, 'period_start');
    });

    protectedApp.post('/api/v1/quality-gates', async (request, reply) => {
      const principal = requireRole(principalOf(request), ['Head']);
      const input = jsonBody(z.object({ employeeId: idSchema, startDate: z.iso.date(), endDate: z.iso.date(), reason: z.string().min(1).max(2000) }), request);
      const result = await withIdempotency(app.db, principal.userId, 'quality-gates:create', idempotencyKey(request), input, 201,
        async (db) => {
          const employee = await one<{ department_id: string; user_id: string | null }>(db,
            `SELECT department_id,user_id FROM app.employees WHERE id=$1 AND is_active`, [input.employeeId]);
          if (employee.department_id !== principal.departmentId) throw new ApiError(403, 'FORBIDDEN', 'Employee is outside your department.');
          const gate = await one<any>(db, `INSERT INTO app.quality_gates
            (employee_id,department_id,starts_on,ends_on,reason,created_by_user_id)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [input.employeeId, principal.departmentId, input.startDate, input.endDate, input.reason, principal.userId]);
          if (employee.user_id) await createNotification(db, employee.user_id, 'System',
            'Quality Gate added', `A Quality Gate is active from ${input.startDate} through ${input.endDate}.`,
            'QualityGate', gate.id);
          await enqueueOutbox(db, 'QualityGateCreated', 'QualityGate', gate.id, {
            employeeId: input.employeeId, startDate: input.startDate, endDate: input.endDate,
          });
          await writeAudit(db, { actorUserId: principal.userId, action: 'QUALITY_GATE_CREATED',
            objectType: 'QualityGate', objectId: gate.id, after: input, requestId: request.id,
            ip: request.ip, userAgent: request.headers['user-agent'] });
          return gate;
        });
      return sendIdempotent(reply, result);
    });
    protectedApp.delete('/api/v1/quality-gates/:employeeId/active', async (request, reply) => {
      const principal = requireRole(principalOf(request), ['Head']);
      const { employeeId } = z.object({ employeeId: idSchema }).parse(request.params);
      const result = await withIdempotency(app.db, principal.userId, `quality-gates:${employeeId}:cancel`, idempotencyKey(request), {}, 200,
        async (db) => {
          const gate = await one<any>(db, `SELECT * FROM app.quality_gates
            WHERE employee_id=$1 AND status='Active' AND ends_on>=CURRENT_DATE ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [employeeId]);
          if (gate.department_id !== principal.departmentId) throw new ApiError(403, 'FORBIDDEN', 'Gate is outside your department.');
          await db.query(`UPDATE app.quality_gates SET status='Cancelled',cancelled_by_user_id=$2,cancelled_at=clock_timestamp(),
            cancellation_reason='Cancelled by department head' WHERE id=$1`, [gate.id, principal.userId]);
          const owner = await maybeOne<{ user_id: string }>(db,
            `SELECT user_id FROM app.employees WHERE id=$1 AND user_id IS NOT NULL`, [employeeId]);
          if (owner) await createNotification(db, owner.user_id, 'System',
            'Quality Gate cancelled', 'Your active Quality Gate was cancelled.', 'QualityGate', gate.id);
          await enqueueOutbox(db, 'QualityGateCancelled', 'QualityGate', gate.id, { employeeId });
          await writeAudit(db, { actorUserId: principal.userId, action: 'QUALITY_GATE_CANCELLED',
            objectType: 'QualityGate', objectId: gate.id, before: gate,
            after: { ...gate, status: 'Cancelled' }, requestId: request.id,
            ip: request.ip, userAgent: request.headers['user-agent'] });
          return { id: gate.id, status: 'Cancelled' };
        });
      return sendIdempotent(reply, result);
    });

    const shopGet = async (request: FastifyRequest) =>
      withTransaction(app.db, (db) => shopSnapshot(db, principalOf(request)), { readOnly: true });
    protectedApp.get('/api/v1/shop', shopGet);
    protectedApp.get('/api/shop', shopGet);
    protectedApp.get('/api/v1/shop/products', async (request) => (await shopGet(request)).products);
    const shopPurchase = async (request: FastifyRequest, reply: FastifyReply) => {
      const principal = principalOf(request);
      const input = jsonBody(z.object({
        productId: idSchema,
        requestId: z.string().optional(),
        fulfillment: z.object({
          deliveryMethod: z.enum(['OfficePickup','EmployeePaidDelivery','WorkEmail','InternalCoordination']),
          officeName: z.string().trim().min(1).max(200).optional(),
        }).optional(),
      }), request);
      const key = idempotencyKey(request) ?? input.requestId;
      const result = await withIdempotency(app.db, principal.userId, 'shop:purchase', key, { productId: input.productId }, 201,
        async (db) => {
          const purchase = await purchaseProduct(db, principal, input.productId, request.id);
          const product = purchase.inventoryItem.product;
          const fulfillment = await createShopFulfillment(db, principal, purchase.purchase.id,
            purchase.purchase.productName, product.fulfillmentKind, product.fulfillmentContactId, input.fulfillment);
          await createNotification(db, principal.userId, 'PurchaseCompleted', 'Purchase completed',
            `Your purchase of ${purchase.purchase.productName} is complete.`, 'Purchase', purchase.purchase.id);
          await enqueueOutbox(db, 'PurchaseCompleted', 'Purchase', purchase.purchase.id, purchase.purchase);
          await writeAudit(db, { actorUserId: principal.userId, action: 'PURCHASE_COMPLETED', objectType: 'Purchase',
            objectId: purchase.purchase.id, after: { productId: input.productId, pricePaid: purchase.purchase.pricePaid,
              sparkType: purchase.purchase.sparkTypePaid }, requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
          return { ...(await shopSnapshot(db, principal)), ...purchase, fulfillment };
        });
      return sendIdempotent(reply, result);
    };
    protectedApp.post('/api/v1/shop/purchases', shopPurchase);
    protectedApp.post('/api/shop/purchase', shopPurchase);
    const activate = async (request: FastifyRequest, reply: FastifyReply) => {
      const principal = principalOf(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const result = await withIdempotency(
        app.db,
        principal.userId,
        `inventory:${id}:activate`,
        idempotencyKey(request),
        {},
        200,
        async (db) => {
        await activateInventoryItem(db, principal, id);
        await createNotification(db, principal.userId, 'InventoryActivated', 'Item activated',
          'Your inventory item is now active.', 'InventoryItem', id);
        await enqueueOutbox(db, 'InventoryActivated', 'InventoryItem', id, { employeeId: principal.employeeId });
        await writeAudit(db, { actorUserId: principal.userId, action: 'INVENTORY_ACTIVATED', objectType: 'InventoryItem',
          objectId: id, requestId: request.id, ip: request.ip, userAgent: request.headers['user-agent'] });
        return shopSnapshot(db, principal);
        },
      );
      return sendIdempotent(reply, result);
    };
    protectedApp.post('/api/v1/me/inventory/:id/activate', activate);
    protectedApp.post('/api/shop/inventory/:id/activate', activate);
    protectedApp.post('/api/v1/me/inventory/:id/use', async () => {
      throw conflict('EFFECT_NOT_SUPPORTED', 'Consumable effects are disabled until their business behavior is approved.');
    });
    protectedApp.get('/api/v1/me/inventory', async (request) => {
      const query = pagination(request);
      return cursorSlice((await shopGet(request)).inventory, query.limit, query.cursor, 'createdAt');
    });
    protectedApp.get('/api/v1/me/purchases', async (request) => {
      const query = pagination(request);
      return cursorSlice((await shopGet(request)).transactions, query.limit, query.cursor, 'createdAt');
    });

    protectedApp.get('/api/v1/me/notifications', async (request) => {
      const principal = principalOf(request);
      const query = pagination(request);
      const values = await rows<any>(app.db, `SELECT id,notification_type AS type,title,body AS text,object_type,object_id,
        link_path,created_at::text AS created_at,read_at FROM app.notifications WHERE recipient_user_id=$1
        AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
        ORDER BY created_at DESC,id DESC LIMIT $4`, [principal.userId, query.cursor?.value ?? null,
        query.cursor?.id ?? null, query.limit + 1]);
      return cursorPage(values, query.limit, 'created_at');
    });
    protectedApp.post('/api/v1/me/notifications/read-all', async (request) => {
      const principal = principalOf(request);
      await app.db.query(`UPDATE app.notifications SET read_at=clock_timestamp() WHERE recipient_user_id=$1 AND read_at IS NULL`, [principal.userId]);
      return { updated: true };
    });

    await protectedApp.register(async (adminApp) => {
      adminApp.addHook('preHandler', async (request) => { requireRole(principalOf(request), ['Administrator']); });
      adminApp.get('/api/v1/admin/employees', async () => rows<any>(app.db, `SELECT employee.id,employee.display_name AS name,
        COALESCE(position.title,'') AS title,employee.department_id,employee.manager_employee_id,employee.is_active,
        COALESCE(employee.contact_email,account_user.email)::text AS email,COALESCE(role.code,employee.provisioned_role_code) AS role
        FROM app.employees employee LEFT JOIN app.users account_user ON account_user.id=employee.user_id
        LEFT JOIN app.positions position ON position.id=employee.position_id
        LEFT JOIN LATERAL (SELECT value.code FROM app.role_assignments assignment JOIN app.roles value ON value.id=assignment.role_id
          WHERE assignment.user_id=account_user.id AND assignment.starts_at<=clock_timestamp()
            AND (assignment.ends_at IS NULL OR assignment.ends_at>clock_timestamp()) LIMIT 1) role ON true
        ORDER BY employee.display_name`));
      adminApp.get('/api/v1/admin/departments', async () => rows<any>(app.db,
        `SELECT id,code,name,head_employee_id,is_active,created_at,updated_at FROM app.departments ORDER BY name`));
      adminApp.get('/api/v1/admin/projects', async () => rows<any>(app.db,
        `SELECT project.*,COALESCE(jsonb_agg(jsonb_build_object('employeeId',member.employee_id,'role',member.member_role,
          'workedHours',member.worked_hours)) FILTER (WHERE member.employee_id IS NOT NULL),'[]'::jsonb) AS members
          FROM app.projects project LEFT JOIN app.project_members member ON member.project_id=project.id AND member.is_active
          GROUP BY project.id ORDER BY project.name`));
      const projectInput = z.object({
        id: idSchema.optional(), name: z.string().min(1).max(200), description: z.string().max(4000).optional(),
        departmentId: idSchema.nullable().optional(), managerId: idSchema.nullable().optional(),
        status: z.enum(['Planned','Active','Completed','Archived']).default('Active'), active: z.boolean().default(true),
        members: z.array(z.object({ employeeId: idSchema, responsibility: z.string().max(100).default('Member'),
          workedHours: z.number().nonnegative().default(0) })).default([]),
      });
      const saveProject = async (request: FastifyRequest) => {
        const principal = principalOf(request);
        const input = jsonBody(projectInput, request);
        const routeId = (request.params as { id?: string }).id;
        const id = routeId ?? input.id ?? randomUUID();
        await withTransaction(app.db, async (db) => {
          if (routeId) {
            await db.query(`UPDATE app.projects SET name=$2,description=$3,department_id=$4,manager_employee_id=$5,
              status=$6,is_active=$7 WHERE id=$1`, [id, input.name.trim(), input.description?.trim() ?? null,
              input.departmentId ?? null, input.managerId ?? null, input.status, input.active]);
            await db.query(`UPDATE app.project_members SET is_active=false,left_on=CURRENT_DATE
              WHERE project_id=$1 AND is_active`, [id]);
          } else await db.query(`INSERT INTO app.projects
            (id,code,name,description,department_id,manager_employee_id,status,is_active)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, `PROJECT-${id.slice(0,8)}`, input.name.trim(),
            input.description?.trim() ?? null, input.departmentId ?? null, input.managerId ?? null, input.status, input.active]);
          for (const member of input.members) await db.query(`INSERT INTO app.project_members
            (id,project_id,employee_id,member_role,worked_hours) VALUES ($1,$2,$3,$4,$5)`, [
            randomUUID(), id, member.employeeId, member.responsibility, member.workedHours,
          ]);
          await writeAudit(db, { actorUserId: principal.userId, action: routeId ? 'PROJECT_UPDATED' : 'PROJECT_CREATED',
            objectType: 'Project', objectId: id, after: input, requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
        });
        return { id };
      };
      adminApp.post('/api/v1/admin/projects', saveProject);
      adminApp.patch('/api/v1/admin/projects/:id', saveProject);
      adminApp.get('/api/v1/admin/spark-categories', async () => rows<any>(app.db, `SELECT category.id,category.code,
        category.spark_type,category.usage_type,category.is_active,version.id AS version_id,version.version,
        version.name,version.description,version.amount,version.repeat_period,version.effective_from
        FROM app.spark_categories category LEFT JOIN LATERAL (SELECT value.* FROM app.spark_category_versions value
          WHERE value.category_id=category.id ORDER BY value.version DESC LIMIT 1) version ON true
        ORDER BY category.spark_type,version.name`));

      const shopAdminGet = async () => withTransaction(app.db, shopAdminSnapshot, { readOnly: true });
      adminApp.get('/api/v1/admin/shop', shopAdminGet);
      adminApp.get('/api/shop/admin', shopAdminGet);
      adminApp.get('/api/v1/admin/products', async () => (await shopAdminGet()).products);
      const productInput = z.object({
        id: idSchema.optional(), name: z.string().min(1).max(200), description: z.string().max(4000).default(''),
        imageUrl: z.string().max(2000).nullable().optional(), icon: z.string().max(100).optional(),
        category: z.enum(['Popular','Boosters','Customization','Features','Exclusive']),
        rarity: z.enum(['Common','Rare','Epic','Legendary']), price: z.number().int().positive(),
        priceSparkType: z.enum(['White','Yellow','Blue']), productType: z.enum(['Consumable','Activatable','Permanent']),
        durationHours: z.number().positive().nullable(), stock: z.number().int().nonnegative().nullable(),
        isActive: z.boolean(), isFeatured: z.boolean(), isLimited: z.boolean(),
        availableFrom: z.iso.datetime().nullable(), availableUntil: z.iso.datetime().nullable(),
        fulfillmentKind: z.enum(['Virtual','Physical','Certificate','ITEquipment']).default('Virtual'),
        fulfillmentContactId: idSchema.nullable().default(null),
        effectCode: z.enum(['theme_unlock','profile_frame','badge_unlock','focus_mode','double_white',
          'streak_shield','mission_reroll','mystery_pack']).optional(),
      });
      const saveProduct = async (request: FastifyRequest, reply: FastifyReply) => {
        const principal = principalOf(request);
        const parsed = jsonBody(productInput, request);
        const routeId = (request.params as { id?: string }).id;
        const input = routeId ? { ...parsed, id: routeId } : parsed;
        const result = await withIdempotency(app.db, principal.userId, 'admin:product:save', idempotencyKey(request), input, 200,
          async (db) => {
          const saved = await saveAdminProduct(db, principal, input);
          await writeAudit(db, { actorUserId: principal.userId, action: input.id ? 'PRODUCT_VERSION_CREATED' : 'PRODUCT_CREATED',
            objectType: 'Product', objectId: saved.productId, after: { ...input, ...saved }, requestId: request.id,
            ip: request.ip, userAgent: request.headers['user-agent'] });
          return shopAdminSnapshot(db);
        });
        return sendIdempotent(reply, result);
      };
      adminApp.post('/api/v1/admin/products', saveProduct);
      adminApp.patch('/api/v1/admin/products/:id', saveProduct);
      adminApp.post('/api/shop/admin/products', saveProduct);
      const deleteProduct = async (request: FastifyRequest) => {
        const principal = principalOf(request);
        const { id } = z.object({ id: idSchema }).parse(request.params);
        return withTransaction(app.db, async (db) => {
          const deleted = await deleteAdminProduct(db, principal, id);
          await writeAudit(db, {
            actorUserId: principal.userId,
            action: 'PRODUCT_DELETED',
            objectType: 'Product',
            objectId: id,
            before: deleted,
            after: { catalogVisible: false },
            requestId: request.id,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
          });
          return shopAdminSnapshot(db);
        });
      };
      adminApp.delete('/api/v1/admin/products/:id', deleteProduct);
      adminApp.delete('/api/shop/admin/products/:id', deleteProduct);
      const uploadProductImage = async (request: FastifyRequest, reply: FastifyReply) => {
        const principal = principalOf(request);
        let result: { id: string; imageUrl: string } | null = null;
        for await (const part of request.parts()) {
          if (part.type !== 'file') continue;
          if (result) throw badRequest('TOO_MANY_FILES', 'Upload one image at a time.');
          const contents = await part.toBuffer();
          result = await storeImage(app.db, environment.MEDIA_ROOT, principal.userId, part.filename, part.mimetype, contents);
        }
        if (!result) throw badRequest('FILE_REQUIRED', 'Choose an image file.');
        return reply.status(201).send(result);
      };
      adminApp.post('/api/v1/admin/products/images', uploadProductImage);
      adminApp.post('/api/shop/admin/images', uploadProductImage);
      adminApp.get('/api/v1/admin/reward-fulfillments', async () => listRewardFulfillments(app.db));
      adminApp.post('/api/v1/admin/reward-fulfillments/:id/status', async (request, reply) => {
        const principal = principalOf(request);
        const { id } = z.object({ id: idSchema }).parse(request.params);
        const input = jsonBody(z.object({
          status: z.enum(['InProgress','Ordered','Ready','Delivered','Cancelled']),
          notes: z.string().trim().max(2000).optional(),
        }), request);
        const result = await withIdempotency(app.db, principal.userId, `reward-fulfillment:${id}:status`,
          idempotencyKey(request), input, 200, async (db) => {
            const current = await one<any>(db, `SELECT fulfillment.*,employee.user_id
              FROM app.reward_fulfillments fulfillment
              JOIN app.employees employee ON employee.id=fulfillment.recipient_employee_id
              WHERE fulfillment.id=$1 FOR UPDATE OF fulfillment`, [id]);
            if (['Delivered','Cancelled'].includes(current.status))
              throw conflict('FULFILLMENT_FINAL', 'A completed or cancelled fulfillment cannot be changed.');
            await db.query(`UPDATE app.reward_fulfillments SET status=$2,notes=COALESCE($3,notes),
              updated_by_user_id=$4,updated_at=clock_timestamp(),
              completed_at=CASE WHEN $2='Delivered' THEN clock_timestamp() ELSE completed_at END WHERE id=$1`,
            [id, input.status, input.notes ?? null, principal.userId]);
            if (current.user_id) await createNotification(db, current.user_id, 'System',
              `Reward fulfillment ${input.status.toLowerCase()}`,
              input.notes || `Your reward fulfillment is now ${input.status}.`, 'RewardFulfillment', id);
            await enqueueOutbox(db, 'RewardFulfillmentStatusChanged', 'RewardFulfillment', id, {
              previousStatus: current.status, status: input.status, notes: input.notes ?? null,
            });
            await writeAudit(db, { actorUserId: principal.userId, action: 'REWARD_FULFILLMENT_STATUS_CHANGED',
              objectType: 'RewardFulfillment', objectId: id, before: { status: current.status }, after: input,
              requestId: request.id, ip: request.ip, userAgent: request.headers['user-agent'] });
            return { id, status: input.status };
          });
        return sendIdempotent(reply, result);
      });
      adminApp.get('/api/v1/admin/disenchant-reports', async () => rows<any>(app.db, `
        SELECT report.*,department.name AS department_name,count(item.disenchant_request_id)::int AS item_count,
               COALESCE(sum(item.money_amount),0)::numeric(18,2) AS money_total
          FROM app.disenchant_reports report
          JOIN app.departments department ON department.id=report.department_id
          LEFT JOIN app.disenchant_report_items item ON item.report_id=report.id
         GROUP BY report.id,department.name ORDER BY report.report_month DESC,department.name`));

      adminApp.post('/api/v1/admin/performance-imports/preview', async (request, reply) => {
        const principal = principalOf(request);
        const fields: Record<string, string> = {};
        let fileName = '';
        let fileContents: Buffer | null = null;
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (fileContents) throw badRequest('TOO_MANY_FILES', 'Upload one CSV file at a time.');
            fileName = part.filename;
            fileContents = await part.toBuffer();
          } else fields[part.fieldname] = String(part.value);
        }
        if (!fileContents) throw badRequest('FILE_REQUIRED', 'Choose a CSV file.');
        const parsed = z.object({ kind: z.enum(['KPI', 'Evaluation']), quarter: z.string().regex(/^Q[1-4] \d{4}$/) }).parse(fields);
        const result = await withTransaction(app.db,
          (db) => previewPerformanceCsv(db, principal, parsed.kind, parsed.quarter, fileName, fileContents!),
          { isolationLevel: 'REPEATABLE READ' });
        return reply.status(201).send(result);
      });
      adminApp.post('/api/v1/admin/performance-imports/:id/commit', async (request, reply) => {
        const principal = principalOf(request);
        const { id } = z.object({ id: idSchema }).parse(request.params);
        const input = jsonBody(z.object({ replace: z.boolean().default(false) }), request);
        const result = await withIdempotency(app.db, principal.userId, `performance-import:${id}:commit`,
          idempotencyKey(request), input, 200,
          (db) => commitPerformanceImport(db, principal, id, input.replace, request.id));
        return sendIdempotent(reply, result);
      });

      adminApp.get('/api/v1/admin/disenchant-requests', async () => (await rows<any>(app.db, `SELECT request.*,
        employee.display_name AS employee_name,department.name AS department_name
        FROM app.disenchant_requests request JOIN app.employees employee ON employee.id=request.employee_id
        JOIN app.departments department ON department.id=request.department_id ORDER BY request.created_at DESC`)).map(disenchantResponse));
      adminApp.post('/api/v1/admin/disenchant-requests/export', async (request, reply) => {
        const principal = principalOf(request);
        const input = jsonBody(z.object({
          requestIds: z.array(idSchema).min(1).max(500),
          exportReference: z.string().trim().min(1).max(200),
        }).refine((value) => new Set(value.requestIds).size === value.requestIds.length, {
          message: 'Disenchant request IDs must be unique.',
          path: ['requestIds'],
        }), request);
        const result = await withIdempotency(app.db, principal.userId, 'disenchant:batch-export',
          idempotencyKey(request), input, 200, async (db) => {
            const selected = await rows<any>(db, `SELECT request.*,employee.display_name AS employee_name,
              COALESCE(employee.contact_email,account_user.email)::text AS employee_email,
              department.name AS department_name
              FROM app.disenchant_requests request
              JOIN app.employees employee ON employee.id=request.employee_id
              LEFT JOIN app.users account_user ON account_user.id=employee.user_id
              JOIN app.departments department ON department.id=request.department_id
              WHERE request.id=ANY($1::uuid[])
              ORDER BY request.created_at,request.id FOR UPDATE OF request`, [input.requestIds]);
            if (selected.length !== input.requestIds.length)
              throw badRequest('DISENCHANT_REQUEST_NOT_FOUND', 'One or more Disenchant requests no longer exist.');
            const invalid = selected.find((item) => item.status !== 'Created');
            if (invalid)
              throw conflict('INVALID_STATUS_TRANSITION', 'Only created requests can be exported.', {
                requestId: invalid.id,
                status: invalid.status,
              });
            await db.query(`UPDATE app.disenchant_requests SET status='Exported',exported_at=clock_timestamp(),
              export_reference=$2,status_changed_by_user_id=$3 WHERE id=ANY($1::uuid[])`,
            [input.requestIds, input.exportReference, principal.userId]);
            for (const item of selected) {
              await db.query(`INSERT INTO app.approval_actions
                (subject_type,subject_id,action,actor_user_id,previous_status,resulting_status,request_id,ip_address,user_agent)
                VALUES ('Disenchant',$1,'Exported',$2,'Created','Exported',$3,$4,$5)`,
              [item.id, principal.userId, request.id, request.ip, request.headers['user-agent'] ?? null]);
              await writeAudit(db, { actorUserId: principal.userId, action: 'DISENCHANT_EXPORTED',
                objectType: 'DisenchantRequest', objectId: item.id, before: { status: 'Created' },
                after: { status: 'Exported', exportReference: input.exportReference }, requestId: request.id,
                ip: request.ip, userAgent: request.headers['user-agent'] });
              const owner = await maybeOne<{ user_id: string }>(db,
                `SELECT user_id FROM app.employees WHERE id=$1 AND user_id IS NOT NULL`, [item.employee_id]);
              if (owner) await createNotification(db, owner.user_id, 'DisenchantStatusChanged',
                'Disenchant request exported', 'Your Disenchant request is now Exported.',
                'Disenchant', item.id);
              await enqueueOutbox(db, 'DisenchantExported', 'Disenchant', item.id, {
                previousStatus: 'Created',
                exportReference: input.exportReference,
              });
            }
            const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
            const csvRows = [
              ['Request ID','Employee','Email','Department','Spark type','Spark amount','Rate','Money amount','Currency','Created at','Accounting period','Export reference'],
              ...selected.map((item) => [item.id,item.employee_name,item.employee_email,item.department_name,
                item.spark_type,Number(item.spark_amount),Number(item.rate_snapshot),Number(item.money_amount),
                item.currency,new Date(item.created_at).toISOString(),new Date(item.created_at).toISOString().slice(0,7),
                input.exportReference]),
            ];
            const safeReference = input.exportReference.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'export';
            return {
              fileName: `disenchant-${safeReference}.csv`,
              csv: `\uFEFF${csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
              requestIds: input.requestIds,
              status: 'Exported',
            };
          });
        return sendIdempotent(reply, result);
      });
      adminApp.post('/api/v1/admin/disenchant-requests/:id/status', async (request, reply) => {
        const principal = principalOf(request);
        const { id } = z.object({ id: idSchema }).parse(request.params);
        const input = jsonBody(z.object({ status: z.enum(['Exported', 'Paid']), exportReference: z.string().min(1).max(200).optional() }), request);
        const result = await withIdempotency(app.db, principal.userId, `disenchant:${id}:status`, idempotencyKey(request), input, 200,
          async (db) => {
            const current = await one<any>(db, `SELECT * FROM app.disenchant_requests WHERE id=$1 FOR UPDATE`, [id]);
            if (input.status === 'Exported') {
              if (current.status !== 'Created') throw conflict('INVALID_STATUS_TRANSITION', 'Only a created request can be exported.');
              if (!input.exportReference) throw badRequest('EXPORT_REFERENCE_REQUIRED', 'An export reference is required.');
              await db.query(`UPDATE app.disenchant_requests SET status='Exported',exported_at=clock_timestamp(),
                export_reference=$2,status_changed_by_user_id=$3 WHERE id=$1`, [id, input.exportReference, principal.userId]);
            } else {
              if (current.status !== 'Exported') throw conflict('INVALID_STATUS_TRANSITION', 'Only an exported request can be marked paid.');
              await db.query(`UPDATE app.disenchant_requests SET status='Paid',paid_at=clock_timestamp(),
                status_changed_by_user_id=$2 WHERE id=$1`, [id, principal.userId]);
            }
            await db.query(`INSERT INTO app.approval_actions
              (subject_type,subject_id,action,actor_user_id,previous_status,resulting_status,request_id,ip_address,user_agent)
              VALUES ('Disenchant',$1,$2,$3,$4,$5,$6,$7,$8)`, [id, input.status, principal.userId, current.status,
              input.status, request.id, request.ip, request.headers['user-agent'] ?? null]);
            await writeAudit(db, { actorUserId: principal.userId, action: `DISENCHANT_${input.status.toUpperCase()}`,
              objectType: 'DisenchantRequest', objectId: id, before: { status: current.status }, after: input,
              requestId: request.id, ip: request.ip, userAgent: request.headers['user-agent'] });
            const owner = await maybeOne<{ user_id: string }>(db,
              `SELECT user_id FROM app.employees WHERE id=$1 AND user_id IS NOT NULL`, [current.employee_id]);
            if (owner) await createNotification(db, owner.user_id, 'DisenchantStatusChanged',
              `Disenchant request ${input.status.toLowerCase()}`, `Your Disenchant request is now ${input.status}.`,
              'Disenchant', id);
            await enqueueOutbox(db, `Disenchant${input.status}`, 'Disenchant', id, { previousStatus: current.status });
            return { id, status: input.status };
          });
        return sendIdempotent(reply, result);
      });

      adminApp.get('/api/v1/admin/access-requests', async () => {
        const accounts = await rows<any>(app.db, `SELECT u.id,e.id AS "employeeId",u.email::text,u.account_status AS status,
          ar.requested_at AS "requestedAt",ar.reviewed_at AS "reviewedAt",ar.reviewed_by_user_id AS "reviewedBy",
          ar.rejection_reason AS "rejectionReason",ar.first_name AS "firstName",ar.last_name AS "lastName",
          ar.employee_number AS "employeeNumber",ar.requested_department_id AS "requestedDepartmentId",
          microsoft_identity.claims->>'jobTitle' AS "suggestedJobTitle",
          microsoft_identity.claims->>'department' AS "suggestedDepartmentName",
          microsoft_identity.claims->>'businessRole' AS "suggestedRole",
          microsoft_identity.claims#>>'{manager,displayName}' AS "suggestedManagerName",
          microsoft_identity.claims#>>'{manager,email}' AS "suggestedManagerEmail",
          suggested_manager.id AS "suggestedManagerId",
          u.auth_provider AS "authProvider",'Registration'::text AS source
          FROM app.users u LEFT JOIN app.employees e ON e.user_id=u.id
          LEFT JOIN app.external_identities microsoft_identity
            ON microsoft_identity.user_id=u.id AND microsoft_identity.provider='microsoft'
          LEFT JOIN LATERAL (
            SELECT candidate.id
              FROM app.employees candidate
              LEFT JOIN app.users candidate_user ON candidate_user.id=candidate.user_id
             WHERE candidate.is_active
               AND lower(COALESCE(candidate.contact_email::text,candidate_user.email::text))=
                   lower(microsoft_identity.claims#>>'{manager,email}')
             ORDER BY candidate.id LIMIT 1
          ) suggested_manager ON true
          LEFT JOIN LATERAL (SELECT value.* FROM app.access_requests value WHERE value.resulting_user_id=u.id ORDER BY requested_at DESC LIMIT 1) ar ON true
          ORDER BY ar.requested_at DESC NULLS LAST`);
        const auditEvents = await rows<any>(app.db, `SELECT audit.id::text,account_user.id AS "accountId",
          CASE audit.action WHEN 'ACCESS_REQUESTED' THEN 'REGISTRATION_SUBMITTED'
            WHEN 'MICROSOFT_ACCESS_REQUESTED' THEN 'REGISTRATION_SUBMITTED'
            WHEN 'ACCESS_APPROVED' THEN 'REGISTRATION_APPROVED'
            WHEN 'ACCESS_REJECTED' THEN 'REGISTRATION_REJECTED' ELSE audit.action END AS action,
          COALESCE(actor_employee.id::text,actor_user_id::text,'system') AS "actorId",
          occurred_at AS "createdAt",COALESCE(reason,audit.action) AS details FROM app.audit_events audit
          LEFT JOIN app.access_requests request ON audit.entity_id=request.id::text
          LEFT JOIN app.users account_user ON account_user.id=request.resulting_user_id
          LEFT JOIN app.employees actor_employee ON actor_employee.user_id=audit.actor_user_id
          WHERE entity_type='AccessRequest' ORDER BY occurred_at DESC LIMIT 200`);
        return { accounts, auditEvents };
      });
      adminApp.post('/api/v1/admin/access-requests/:id/decision', async (request) => {
        const principal = principalOf(request);
        const { id } = z.object({ id: idSchema }).parse(request.params);
        const input = jsonBody(z.object({
          decision: z.enum(['Approved', 'Rejected']),
          reason: z.string().max(2000).optional(),
          employee: accessApprovalEmployeeInput.optional(),
        }), request);
        if (input.decision === 'Rejected' && !input.reason?.trim()) throw badRequest('REJECTION_REASON_REQUIRED', 'A rejection reason is required.');
        return withTransaction(app.db, async (db) => {
          const access = await one<any>(db, `SELECT * FROM app.access_requests WHERE resulting_user_id=$1 AND status='Pending'
            ORDER BY requested_at DESC LIMIT 1 FOR UPDATE`, [id]).catch(() => { throw notFound('Pending access request'); });
          const account = await one<{ email: string; auth_provider: 'local' | 'entra' }>(db,
            `SELECT email::text,auth_provider FROM app.users WHERE id=$1 FOR UPDATE`, [id]);
          let employee = await maybeOne<any>(db, `SELECT employee.*,COALESCE(position.title,'') AS title
            FROM app.employees employee LEFT JOIN app.positions position ON position.id=employee.position_id
            WHERE employee.user_id=$1 FOR UPDATE OF employee`, [id]);
          if (!employee)
            employee = await maybeOne<any>(db, `SELECT employee.*,COALESCE(position.title,'') AS title
              FROM app.employees employee LEFT JOIN app.positions position ON position.id=employee.position_id
              WHERE lower(employee.contact_email::text)=lower($1) FOR UPDATE OF employee`, [account.email]);
          const employeeBefore = employee ? { ...employee } : undefined;

          if (input.decision === 'Approved') {
            if (!employee && !input.employee)
              throw badRequest('EMPLOYEE_PROFILE_REQUIRED', 'Complete the employee profile before approving this request.');
            if (employee?.user_id && employee.user_id !== id)
              throw conflict('EMPLOYEE_ACCOUNT_CONFLICT', 'This work email is already linked to another account.');

            const profile = input.employee ?? {
              name: employee.display_name,
              title: employee.title,
              departmentId: employee.department_id,
              role: employee.provisioned_role_code,
              managerId: employee.manager_employee_id ?? undefined,
            };
            const department = await maybeOne<{ id: string }>(db,
              `SELECT id FROM app.departments WHERE id=$1 AND is_active`, [profile.departmentId]);
            if (!department) throw badRequest('INVALID_DEPARTMENT', 'Choose an active department.');
            if (profile.managerId) {
              const manager = await maybeOne<{ id: string }>(db,
                `SELECT id FROM app.employees WHERE id=$1 AND is_active`, [profile.managerId]);
              if (!manager || manager.id === employee?.id)
                throw badRequest('INVALID_MANAGER', 'Choose another active employee as manager.');
            }
            const role = await maybeOne<{ id: string }>(db, `SELECT id FROM app.roles WHERE code=$1`, [profile.role]);
            if (!role) throw badRequest('INVALID_ROLE', 'Choose a valid business role.');
            let position = await maybeOne<{ id: string }>(db,
              `SELECT id FROM app.positions WHERE lower(title)=lower($1) LIMIT 1`, [profile.title]);
            if (!position) {
              position = { id: randomUUID() };
              await db.query(`INSERT INTO app.positions (id,code,title) VALUES ($1,$2,$3)`,
                [position.id, `POSITION-${position.id}`, profile.title]);
            }
            const employeeId = employee?.id ?? randomUUID();
            const [firstName, ...remainingName] = profile.name.trim().split(/\s+/);
            const lastName = remainingName.join(' ') || '-';
            if (employee) {
              await db.query(`UPDATE app.employees SET user_id=$2,first_name=$3,last_name=$4,display_name=$5,
                contact_email=$6,department_id=$7,position_id=$8,manager_employee_id=$9,is_active=true,
                termination_date=NULL,provisioned_role_code=$10,updated_at=clock_timestamp(),row_version=row_version+1
                WHERE id=$1`, [employeeId, id, firstName, lastName, profile.name, account.email,
                profile.departmentId, position.id, profile.managerId || null, profile.role]);
            } else {
              await db.query(`INSERT INTO app.employees
                (id,user_id,employee_number,first_name,last_name,display_name,contact_email,department_id,position_id,
                 manager_employee_id,is_active,provisioned_role_code)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
              [employeeId, id, `EMP-${employeeId.slice(0,8)}`, firstName, lastName, profile.name, account.email,
                profile.departmentId, position.id, profile.managerId || null, profile.role]);
            }
            await db.query(`UPDATE app.role_assignments SET ends_at=clock_timestamp()
              WHERE user_id=$1 AND ends_at IS NULL`, [id]);
            await db.query(`INSERT INTO app.role_assignments (user_id,role_id,assigned_by_user_id)
              VALUES ($1,$2,$3)`, [id, role.id, principal.userId]);
            await db.query(`INSERT INTO app.spark_accounts (employee_id,spark_type)
              SELECT $1,value FROM unnest(ARRAY['White','Yellow','Blue','Radiant']::text[]) value
              ON CONFLICT (employee_id,spark_type) DO NOTHING`, [employeeId]);
            await db.query(`UPDATE app.access_requests SET first_name=$2,last_name=$3,
              employee_number=(SELECT employee_number FROM app.employees WHERE id=$4),requested_department_id=$5
              WHERE id=$1`, [access.id, firstName, lastName, employeeId, profile.departmentId]);
            await writeAudit(db, { actorUserId: principal.userId,
              action: employeeBefore ? 'EMPLOYEE_UPDATED_ON_ACCESS_APPROVAL' : 'EMPLOYEE_CREATED_ON_ACCESS_APPROVAL',
              objectType: 'Employee', objectId: employeeId, before: employeeBefore,
              after: { ...profile, email: account.email, active: true, userId: id }, requestId: request.id,
              ip: request.ip, userAgent: request.headers['user-agent'] });
            employee = { ...(employee ?? {}), id: employeeId, display_name: profile.name,
              department_id: profile.departmentId, provisioned_role_code: profile.role };
          }
          await db.query(`UPDATE app.access_requests SET status=$2,reviewed_at=clock_timestamp(),reviewed_by_user_id=$3,rejection_reason=$4 WHERE id=$1`,
            [access.id, input.decision, principal.userId, input.reason?.trim() ?? null]);
          await db.query(`UPDATE app.users SET account_status=$2,approved_at=CASE WHEN $2='Approved' THEN clock_timestamp() ELSE approved_at END,
            approved_by_user_id=CASE WHEN $2='Approved' THEN $3 ELSE approved_by_user_id END WHERE id=$1`, [id, input.decision, principal.userId]);
          await writeAudit(db, { actorUserId: principal.userId, action: `ACCESS_${input.decision.toUpperCase()}`,
            objectType: 'AccessRequest', objectId: access.id, reason: input.reason,
            before: { status: 'Pending', employeeId: employee?.id ?? null },
            after: { status: input.decision, employeeId: employee?.id ?? null, employee: input.employee }, requestId: request.id,
            ip: request.ip, userAgent: request.headers['user-agent'] });
          await createNotification(db, id, 'System',
            `Access request ${input.decision.toLowerCase()}`,
            input.reason?.trim() || `Your access request was ${input.decision.toLowerCase()}.`, 'AccessRequest', access.id);
          await enqueueOutbox(db, `Access${input.decision}`, 'AccessRequest', access.id, { userId: id });
          return { id, employeeId: employee?.id, email: access.email, status: input.decision, source: 'Registration',
            firstName: access.first_name, lastName: access.last_name, authProvider: account.auth_provider,
            requestedAt: access.requested_at, reviewedAt: new Date().toISOString(), reviewedBy: principal.userId,
            rejectionReason: input.reason };
        });
      });

      const adjustBalance = async (request: FastifyRequest, reply: FastifyReply) => {
        const principal = principalOf(request);
        const rawInput = jsonBody(z.object({ employeeId: idSchema.optional(), userId: idSchema.optional(),
          sparkType: z.enum(['White','Yellow','Blue','Radiant']), amount: z.number().int(),
          reason: z.string().min(3).max(2000) }).refine((value) => value.employeeId || value.userId,
            { message: 'employeeId is required.' }), request);
        const employeeId = rawInput.employeeId ?? rawInput.userId!;
        const input = { employeeId, sparkType: rawInput.sparkType, amount: rawInput.amount, reason: rawInput.reason };
        if (input.amount === 0) throw badRequest('INVALID_AMOUNT', 'Adjustment cannot be zero.');
        const result = await withIdempotency(app.db, principal.userId, 'admin:balance-adjustment', idempotencyKey(request), input, 201,
          async (db) => {
            const ledger = await postLedgerOperation(db, { operationType: 'AdministrativeAdjustment', actorUserId: principal.userId,
              subjectEmployeeId: input.employeeId, sourceType: 'AdministrativeAdjustment', requestId: request.id,
              description: input.reason, entries: [{ employeeId: input.employeeId, sparkType: input.sparkType, amount: input.amount,
                entryKind: input.amount > 0 ? 'Credit' : 'Debit', sourceType: 'AdministrativeAdjustment', description: input.reason }] });
            await writeAudit(db, { actorUserId: principal.userId, action: 'BALANCE_ADJUSTED', objectType: 'SparkOperation',
              objectId: ledger.operationId, reason: input.reason, after: input, requestId: request.id, ip: request.ip,
              userAgent: request.headers['user-agent'] });
            return { operationId: ledger.operationId };
          });
        if (request.url.startsWith('/api/shop/')) {
          if (result.replayed) void reply.header('idempotency-replayed', 'true');
          return reply.status(result.statusCode).send(await withTransaction(app.db, shopAdminSnapshot, { readOnly: true }));
        }
        return sendIdempotent(reply, result);
      };
      adminApp.post('/api/v1/admin/balance-adjustments', adjustBalance);
      adminApp.post('/api/shop/admin/balances/adjust', adjustBalance);
      const saveEmployee = async (request: FastifyRequest) => {
        const principal = principalOf(request);
        const input = jsonBody(employeeInput, request);
        if (!input.active)
          throw badRequest('EMPLOYEE_DEACTIVATION_DISABLED', 'Employees are deleted instead of archived. Use the delete action.');
        const routeId = (request.params as { id?: string }).id;
        const employeeId = routeId ?? (input.id || randomUUID());
        const [firstName, ...rest] = input.name.trim().split(/\s+/);
        const lastName = rest.join(' ') || '-';
        return withTransaction(app.db, async (db) => {
          const existing = routeId
            ? await one<any>(db, `SELECT * FROM app.employees WHERE id=$1 FOR UPDATE`, [routeId])
            : null;
          const position = await maybeOne<{ id: string }>(db, `SELECT id FROM app.positions WHERE lower(title)=lower($1) LIMIT 1`, [input.title]);
          const positionId = position?.id ?? randomUUID();
          if (!position)
            await db.query(`INSERT INTO app.positions (id,code,title) VALUES ($1,$2,$3)`, [positionId, `POSITION-${positionId}`, input.title]);
          if (existing) {
            await db.query(`UPDATE app.employees SET first_name=$2,last_name=$3,display_name=$4,contact_email=$5,
              department_id=$6,position_id=$7,manager_employee_id=$8,is_active=$9,provisioned_role_code=$10 WHERE id=$1`,
              [employeeId, firstName, lastName, input.name.trim(), input.email, input.departmentId, positionId,
                input.managerId ?? null, input.active, input.role]);
            if (existing.user_id) {
              await db.query(`UPDATE app.users SET email=$2,account_status=CASE WHEN $3 THEN 'Approved' ELSE 'Disabled' END,
                disabled_at=CASE WHEN $3 THEN NULL ELSE clock_timestamp() END WHERE id=$1`, [existing.user_id, input.email, input.active]);
              await db.query(`UPDATE app.role_assignments SET ends_at=clock_timestamp() WHERE user_id=$1 AND ends_at IS NULL`, [existing.user_id]);
              if (input.active)
                await db.query(`INSERT INTO app.role_assignments (user_id,role_id,assigned_by_user_id)
                  SELECT $1,id,$2 FROM app.roles WHERE code=$3`, [existing.user_id, principal.userId, input.role]);
            }
          } else {
            await db.query(`INSERT INTO app.employees
              (id,employee_number,first_name,last_name,display_name,contact_email,department_id,position_id,
               manager_employee_id,is_active,provisioned_role_code)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [employeeId, `EMP-${employeeId.slice(0,8)}`, firstName, lastName, input.name.trim(), input.email,
                input.departmentId, positionId, input.managerId ?? null, input.active, input.role]);
          }
          await writeAudit(db, { actorUserId: principal.userId, action: existing ? 'EMPLOYEE_UPDATED' : 'EMPLOYEE_CREATED',
            objectType: 'Employee', objectId: employeeId, before: existing ?? undefined, after: input,
            requestId: request.id, ip: request.ip, userAgent: request.headers['user-agent'] });
          return { id: employeeId };
        });
      };
      adminApp.post('/api/v1/admin/employees', saveEmployee);
      adminApp.patch('/api/v1/admin/employees/:id', saveEmployee);
      adminApp.delete('/api/v1/admin/employees/:id', async (request, reply) => {
        const principal = principalOf(request);
        const { id } = z.object({ id: idSchema }).parse(request.params);
        if (id === principal.employeeId)
          throw conflict('SELF_DELETE_FORBIDDEN', 'You cannot delete your own employee profile.');
        await withTransaction(app.db, async (db) => {
          const employee = await maybeOne<any>(db, `SELECT employee.*,account_user.account_status
            FROM app.employees employee LEFT JOIN app.users account_user ON account_user.id=employee.user_id
            WHERE employee.id=$1 FOR UPDATE OF employee`, [id]);
          if (!employee) throw notFound('Employee');
          if (employee.user_id)
            await db.query(`SELECT id FROM app.users WHERE id=$1 FOR UPDATE`, [employee.user_id]);

          if (employee.provisioned_role_code === 'Administrator' && employee.user_id) {
            const otherAdministrators = await one<{ count: string }>(db, `SELECT count(DISTINCT assignment.user_id)::text AS count
              FROM app.role_assignments assignment JOIN app.roles role ON role.id=assignment.role_id
              JOIN app.users account_user ON account_user.id=assignment.user_id AND account_user.account_status='Approved'
              JOIN app.employees administrator ON administrator.user_id=account_user.id AND administrator.is_active
              WHERE role.code='Administrator' AND assignment.ends_at IS NULL AND administrator.id<>$1`, [id]);
            if (Number(otherAdministrators.count) === 0)
              throw conflict('LAST_ADMINISTRATOR', 'Assign another active Administrator before deleting this employee.');
          }

          const history = await one<{ exists: boolean }>(db, `SELECT EXISTS (
            SELECT 1 FROM app.spark_accounts account
              JOIN app.spark_ledger_entries entry ON entry.account_id=account.id WHERE account.employee_id=$1
            UNION ALL SELECT 1 FROM app.spark_operations WHERE subject_employee_id=$1
            UNION ALL SELECT 1 FROM app.quality_gates WHERE employee_id=$1
            UNION ALL SELECT 1 FROM app.recognitions WHERE nominator_employee_id=$1 OR recipient_employee_id=$1
            UNION ALL SELECT 1 FROM app.award_requests WHERE requested_by_employee_id=$1 OR recipient_employee_id=$1
            UNION ALL SELECT 1 FROM app.quota_reservations WHERE owner_employee_id=$1
            UNION ALL SELECT 1 FROM app.performance_import_rows WHERE employee_id=$1
            UNION ALL SELECT 1 FROM app.performance_records WHERE employee_id=$1
            UNION ALL SELECT 1 FROM app.achievements WHERE employee_id=$1
            UNION ALL SELECT 1 FROM app.conversion_operations WHERE employee_id=$1
            UNION ALL SELECT 1 FROM app.disenchant_requests WHERE employee_id=$1
            UNION ALL SELECT 1 FROM app.purchases WHERE employee_id=$1
            UNION ALL SELECT 1 FROM app.inventory_items WHERE owner_employee_id=$1
            UNION ALL SELECT 1 FROM app.effect_grants WHERE employee_id=$1
          ) AS exists`, [id]);
          await writeAudit(db, { actorUserId: principal.userId, action: 'EMPLOYEE_DELETED',
            objectType: 'Employee', objectId: id, before: employee,
            after: { deleted: true, deletionMode: history.exists ? 'PseudonymizedTombstone' : 'HardDelete' },
            reason: 'Deleted from Employee Directory', requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
          await db.query(`DELETE FROM app.project_members WHERE employee_id=$1`, [id]);
          if (history.exists) {
            await db.query(`UPDATE app.departments SET head_employee_id=NULL WHERE head_employee_id=$1`, [id]);
            await db.query(`UPDATE app.projects SET manager_employee_id=NULL WHERE manager_employee_id=$1`, [id]);
            await db.query(`UPDATE app.project_teams SET coordinator_employee_id=NULL
              WHERE coordinator_employee_id=$1`, [id]);
            await db.query(`UPDATE app.project_teams SET gpm_employee_id=NULL WHERE gpm_employee_id=$1`, [id]);
            await db.query(`UPDATE app.employees SET manager_employee_id=NULL WHERE manager_employee_id=$1`, [id]);
            await db.query(`UPDATE app.employees
              SET user_id=NULL,employee_number=$2,first_name='Deleted',last_name='Employee',
                  display_name=$3,contact_email=NULL,position_id=NULL,manager_employee_id=NULL,
                  termination_date=COALESCE(termination_date,current_date),worked_hours=0,
                  provisioned_role_code='Employee',is_active=false,
                  updated_at=clock_timestamp(),row_version=row_version+1
              WHERE id=$1`, [id, `DELETED-${id}`, `Deleted employee ${id.slice(0, 8)}`]);
          } else {
            await db.query(`DELETE FROM app.spark_accounts WHERE employee_id=$1`, [id]);
            await db.query(`DELETE FROM app.employees WHERE id=$1`, [id]);
          }

          if (employee.user_id) {
            await db.query(`DELETE FROM app.external_identities WHERE user_id=$1`, [employee.user_id]);
            await db.query(`DELETE FROM app.user_preferences WHERE user_id=$1`, [employee.user_id]);
            await db.query(`UPDATE app.sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),
              revoked_reason=COALESCE(revoked_reason,'Employee deleted') WHERE user_id=$1`, [employee.user_id]);
            await db.query(`UPDATE app.role_assignments SET ends_at=clock_timestamp()
              WHERE user_id=$1 AND ends_at IS NULL`, [employee.user_id]);
            await db.query(`UPDATE app.users SET email=$2,account_status='Disabled',disabled_at=clock_timestamp(),
              disabled_by_user_id=$3,disabled_reason='Employee deleted',
              provider_subject=CASE WHEN auth_provider='entra' THEN $4 ELSE provider_subject END,
              updated_at=clock_timestamp(),row_version=row_version+1 WHERE id=$1`,
            [employee.user_id, `deleted.${employee.user_id}@invalid.local`, principal.userId,
              `deleted:${employee.user_id}`]);
          }
        });
        return reply.status(204).send();
      });

      const departmentInput = z.object({
        id: z.string().uuid().or(z.literal('')).optional(), name: z.string().min(1).max(200),
        headId: idSchema.optional(), active: z.boolean(),
      });
      const saveDepartment = async (request: FastifyRequest) => {
        const principal = principalOf(request);
        const input = jsonBody(departmentInput, request);
        const routeId = (request.params as { id?: string }).id;
        const id = routeId ?? (input.id || randomUUID());
        await withTransaction(app.db, async (db) => {
          if (routeId)
            await db.query(`UPDATE app.departments SET name=$2,head_employee_id=$3,is_active=$4 WHERE id=$1`, [id, input.name.trim(), input.headId ?? null, input.active]);
          else
            await db.query(`INSERT INTO app.departments (id,code,name,head_employee_id,is_active) VALUES ($1,$2,$3,$4,$5)`,
              [id, `DEPT-${id.slice(0,8)}`, input.name.trim(), input.headId ?? null, input.active]);
          await writeAudit(db, { actorUserId: principal.userId, action: routeId ? 'DEPARTMENT_UPDATED' : 'DEPARTMENT_CREATED',
            objectType: 'Department', objectId: id, after: input, requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
        });
        return { id };
      };
      adminApp.post('/api/v1/admin/departments', saveDepartment);
      adminApp.patch('/api/v1/admin/departments/:id', saveDepartment);

      const categoryInput = z.object({
        id: z.string().uuid().or(z.literal('')).optional(), name: z.string().min(1).max(200),
        description: z.string().max(4000).default(''), sparkType: z.enum(['White','Yellow','Blue']),
        usageType: z.enum(['PeerRecognition','Award','Performance','Administrative']),
        amount: z.number().int().min(1).max(100), period: z.enum(['Quarterly','Yearly','One-time','Unrestricted']),
        active: z.boolean(),
      });
      const saveCategory = async (request: FastifyRequest) => {
        const principal = principalOf(request);
        const input = jsonBody(categoryInput, request);
        if (input.usageType === 'PeerRecognition' &&
          (input.sparkType !== 'White' || input.amount !== 1 || input.period !== 'Unrestricted'))
          throw badRequest('PEER_CATEGORY_INVARIANT',
            'Peer Recognition categories must award exactly 1 White Spark and use the unrestricted period.');
        const routeId = (request.params as { id?: string }).id;
        const id = routeId ?? (input.id || randomUUID());
        await withTransaction(app.db, async (db) => {
          const existing = routeId ? await one<any>(db, `SELECT * FROM app.spark_categories WHERE id=$1 FOR UPDATE`, [id]) : null;
          if (existing && existing.spark_type !== input.sparkType)
            throw conflict('SPARK_TYPE_IMMUTABLE', 'Create a new category to change its Spark type.');
          if (existing && existing.usage_type !== input.usageType)
            throw conflict('USAGE_TYPE_IMMUTABLE', 'Create a new category to change its usage type.');
          if (!existing)
            await db.query(`INSERT INTO app.spark_categories (id,code,spark_type,usage_type,is_active)
              VALUES ($1,$2,$3,$4,$5)`, [id, `category-${id}`, input.sparkType, input.usageType, input.active]);
          else {
            await db.query(`UPDATE app.spark_categories SET is_active=$2 WHERE id=$1`, [id, input.active]);
            await db.query(`UPDATE app.spark_category_versions SET status='Retired',effective_to=clock_timestamp()
              WHERE category_id=$1 AND status='Active' AND effective_to IS NULL`, [id]);
          }
          const version = await one<{ next: number }>(db, `SELECT COALESCE(max(version),0)::int+1 AS next FROM app.spark_category_versions WHERE category_id=$1`, [id]);
          const period = input.period === 'One-time' ? 'OneTime' : input.period === 'Unrestricted' ? 'Unlimited' : input.period;
          await db.query(`INSERT INTO app.spark_category_versions
            (category_id,version,name,description,amount,repeat_period,status,effective_from,created_by_user_id)
            VALUES ($1,$2,$3,$4,$5,$6,'Active',clock_timestamp(),$7)`,
            [id, version.next, input.name.trim(), input.description.trim(), input.amount, period, principal.userId]);
          await writeAudit(db, { actorUserId: principal.userId, action: existing ? 'CATEGORY_VERSION_CREATED' : 'CATEGORY_CREATED',
            objectType: 'SparkCategory', objectId: id, after: input, requestId: request.id, ip: request.ip,
            userAgent: request.headers['user-agent'] });
        });
        return { id };
      };
      adminApp.post('/api/v1/admin/spark-categories', saveCategory);
      adminApp.patch('/api/v1/admin/spark-categories/:id', saveCategory);

      adminApp.post('/api/v1/admin/rule-sets', async (request) => {
        const principal = principalOf(request);
        const input = jsonBody(z.object({
          whiteToYellow: z.number().int().positive().optional(), yellowToBlue: z.number().int().positive().optional(),
          conversionFee: z.number().int().nonnegative().optional(), yellowQuarterlyLimit: z.number().int().positive().optional(),
          peerBaseLimit: z.number().int().positive().optional(), coordinatorTeamMultiplier: z.number().int().positive().optional(),
          disenchantRate: z.number().positive().max(1).optional(), currency: z.enum(['EUR','USD','GBP']).optional(),
          sparkMoneyValues: z.object({ White: z.number().positive(), Yellow: z.number().positive(), Blue: z.number().positive() }).optional(),
          performanceThresholds: performanceThresholdsSchema.optional(),
        }), request);
        return withTransaction(app.db, async (db) => {
          const current = await effectiveRuleSet(db);
          const currentConfiguration = current.configuration && typeof current.configuration === 'object'
            ? current.configuration
            : {};
          const performanceThresholds = input.performanceThresholds ??
            performanceThresholdsFromConfiguration(currentConfiguration);
          const nextConfiguration = { ...currentConfiguration, performanceThresholds };
          const version = await one<{ next: number }>(db, `SELECT COALESCE(max(version),0)::int+1 AS next FROM app.rule_set_versions`);
          await db.query(`UPDATE app.rule_set_versions SET status='Retired',effective_to=clock_timestamp()
            WHERE id=$1`, [current.id]);
          const id = randomUUID();
          const rate = input.disenchantRate ?? 1;
          await db.query(`INSERT INTO app.rule_set_versions
            (id,version,name,status,effective_from,white_to_yellow_input,white_to_yellow_output,white_to_yellow_fee,
             yellow_to_blue_input,yellow_to_blue_output,yellow_to_blue_fee,peer_quarterly_limit,yellow_quarterly_limit,
             coordinator_team_multiplier,disenchant_currency,white_disenchant_rate,yellow_disenchant_rate,
             blue_disenchant_rate,configuration,created_by_user_id)
            VALUES ($1,$2,$3,'Active',clock_timestamp(),$4,1,$5,$6,1,$5,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)`,
            [id, version.next, `Rule set ${version.next}`, input.whiteToYellow ?? Number(current.white_to_yellow_input),
              input.conversionFee ?? Number(current.white_to_yellow_fee), input.yellowToBlue ?? Number(current.yellow_to_blue_input),
              input.peerBaseLimit ?? Number(current.peer_quarterly_limit), input.yellowQuarterlyLimit ?? Number(current.yellow_quarterly_limit),
              input.coordinatorTeamMultiplier ?? Number(current.coordinator_team_multiplier), input.currency ?? current.disenchant_currency,
              (input.sparkMoneyValues?.White ?? Number(current.white_disenchant_rate)) * rate,
              (input.sparkMoneyValues?.Yellow ?? Number(current.yellow_disenchant_rate)) * rate,
              (input.sparkMoneyValues?.Blue ?? Number(current.blue_disenchant_rate)) * rate,
              JSON.stringify(nextConfiguration), principal.userId]);
          await writeAudit(db, { actorUserId: principal.userId, action: 'RULE_SET_VERSION_CREATED', objectType: 'RuleSet',
            objectId: id, after: input, requestId: request.id, ip: request.ip, userAgent: request.headers['user-agent'] });
          return { id, version: version.next };
        });
      });
      adminApp.get('/api/v1/admin/audit-events', async (request) => {
        const query = pagination(request, 100);
        const values = await rows<any>(app.db, `SELECT event.*,event.occurred_at::text AS occurred_at FROM app.audit_events event
          WHERE ($1::timestamptz IS NULL OR (occurred_at,id)<($1::timestamptz,$2::bigint))
          ORDER BY occurred_at DESC,id DESC LIMIT $3`, [query.cursor?.value ?? null,
          query.cursor?.id ?? null, query.limit + 1]);
        return cursorPage(values, query.limit, 'occurred_at');
      });
    });
  });
};
