import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccountStatus, AuthenticatedPrincipal, Role } from './domain.js';
import { ApiError, badRequest, conflict, forbidden, unauthorized } from './errors.js';
import { hashPassword, opaqueToken, tokenHash, validatePassword, verifyPassword } from './security.js';
import { maybeOne, one, rows } from './sql.js';

export const SESSION_COOKIE = 'c_job_sparks_session';
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

interface PrincipalRow {
  session_id: string;
  user_id: string;
  email: string;
  account_status: AccountStatus;
  employee_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  department_id: string;
  role: Role;
  expires_at: Date | string;
}

const principalQuery = `
  SELECT s.id AS session_id, u.id AS user_id, u.email::text, u.account_status,
         e.id AS employee_id, e.display_name, e.first_name, e.last_name,
         pos.title, e.department_id, r.code AS role, s.expires_at
    FROM app.sessions s
    JOIN app.users u ON u.id=s.user_id
    JOIN app.employees e ON e.user_id=u.id AND e.is_active
    LEFT JOIN app.positions pos ON pos.id=e.position_id
    JOIN LATERAL (
      SELECT role.code FROM app.role_assignments assignment
      JOIN app.roles role ON role.id=assignment.role_id
      WHERE assignment.user_id=u.id AND assignment.starts_at <= clock_timestamp()
        AND (assignment.ends_at IS NULL OR assignment.ends_at > clock_timestamp())
      ORDER BY assignment.starts_at DESC LIMIT 1
    ) r ON true`;

export const authenticate = async (pool: Pool, request: FastifyRequest, cookieName = SESSION_COOKIE) => {
  const token = request.cookies[cookieName];
  if (!token) throw unauthorized();
  const result = await pool.query<PrincipalRow>(
    `${principalQuery}
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
        AND u.account_status='Approved'`,
    [tokenHash(token)],
  );
  const row = result.rows[0];
  if (!row) throw unauthorized('Your session has expired.');
  request.principal = {
    userId: row.user_id,
    accountId: row.user_id,
    employeeId: row.employee_id,
    email: row.email,
    role: row.role,
    departmentId: row.department_id,
    sessionId: row.session_id,
  };
  if (Math.random() < 0.05)
    void pool.query(`UPDATE app.sessions SET last_seen_at=clock_timestamp() WHERE id=$1`, [row.session_id]);
  return request.principal;
};

export const publicUser = async (db: Pool | PoolClient, userId: string) => {
  const row = await one<PrincipalRow>(
    db,
    `${principalQuery}
      WHERE u.id=$1 AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      ORDER BY (s.id IS NOT NULL) DESC LIMIT 1`,
    [userId],
  );
  return {
    accountId: row.user_id,
    employeeId: row.employee_id,
    email: row.email,
    name: row.display_name,
    initials: `${row.first_name[0] ?? ''}${row.last_name[0] ?? ''}`.toUpperCase(),
    title: row.title ?? '',
    departmentId: row.department_id,
    role: row.role,
  };
};

export const meResponse = async (pool: Pool, principal: AuthenticatedPrincipal) => ({
  user: await publicUser(pool, principal.userId),
  session: {
    id: principal.sessionId,
    expiresAt: (
      await one<{ expires_at: Date | string }>(pool, `SELECT expires_at FROM app.sessions WHERE id=$1`, [principal.sessionId])
    ).expires_at,
  },
});

export const createAccessRequest = async (
  db: PoolClient,
  input: { email: string; password: string; confirmPassword: string },
  metadata: { ip?: string | null; userAgent?: string | null },
) => {
  const email = input.email.trim().toLowerCase();
  if (input.password !== input.confirmPassword) throw badRequest('PASSWORD_MISMATCH', 'Passwords do not match.');
  const passwordValidation = validatePassword(input.password);
  if (!passwordValidation.valid)
    throw badRequest('INVALID_PASSWORD', 'Password does not meet the security requirements.', {
      issues: passwordValidation.issues,
    });
  const employee = await maybeOne<{
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    department_id: string | null;
    user_id: string | null;
  }>(
    db,
    `SELECT id, employee_number, first_name, last_name, department_id, user_id
       FROM app.employees WHERE lower(contact_email::text)=lower($1) AND is_active FOR UPDATE`,
    [email],
  );
  if (!employee)
    throw badRequest('DIRECTORY_NOT_FOUND', 'Ask an administrator to add your email to the employee directory first.');
  const existing = await maybeOne<{ id: string; account_status: AccountStatus }>(
    db,
    `SELECT id, account_status FROM app.users WHERE lower(email::text)=lower($1) FOR UPDATE`,
    [email],
  );
  if (existing && existing.account_status !== 'Rejected')
    throw conflict('ACCOUNT_EXISTS', 'An access account or pending request already exists for this email.');
  if (employee.user_id && employee.user_id !== existing?.id)
    throw conflict('ACCOUNT_EXISTS', 'This employee already has an access account.');
  const passwordDigest = await hashPassword(input.password);
  const userId = existing?.id ?? randomUUID();
  if (existing) {
    await db.query(
      `UPDATE app.users SET password_hash=$2, account_status='Pending', failed_login_attempts=0,
              locked_until=NULL, updated_at=clock_timestamp(), row_version=row_version+1
        WHERE id=$1`,
      [userId, passwordDigest],
    );
  } else {
    await db.query(
      `INSERT INTO app.users (id, email, password_hash, account_status) VALUES ($1,$2,$3,'Pending')`,
      [userId, email, passwordDigest],
    );
  }
  await db.query(`UPDATE app.employees SET user_id=$2 WHERE id=$1 AND (user_id IS NULL OR user_id=$2)`, [employee.id, userId]);
  const request = await one<Record<string, unknown>>(
    db,
    `INSERT INTO app.access_requests
      (email, first_name, last_name, employee_number, requested_department_id, resulting_user_id,
       request_ip, request_user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, resulting_user_id AS "accountId", email::text, status, requested_at AS "requestedAt"`,
    [
      email,
      employee.first_name,
      employee.last_name,
      employee.employee_number,
      employee.department_id,
      userId,
      metadata.ip ?? null,
      metadata.userAgent ?? null,
    ],
  );
  return { ...request, id: userId, employeeId: employee.id, source: 'Registration' };
};

interface LoginUserRow {
  id: string;
  email: string;
  password_hash: string | null;
  account_status: AccountStatus;
  failed_login_attempts: number;
  locked_until: Date | string | null;
}

const loginEvent = (
  db: PoolClient,
  userId: string | null,
  email: string,
  outcome: 'Succeeded' | 'Failed' | 'Blocked' | 'LoggedOut' | 'SessionRevoked',
  reason: string,
  metadata: { ip?: string | null; userAgent?: string | null; requestId?: string | null },
) =>
  db.query(
    `INSERT INTO app.login_events
      (user_id, email, outcome, reason, ip_address, user_agent, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, email, outcome, reason, metadata.ip ?? null, metadata.userAgent ?? null, metadata.requestId ?? null],
  );

export const login = async (
  db: PoolClient,
  input: { email: string; password: string },
  metadata: { ip?: string | null; userAgent?: string | null; requestId?: string | null },
  sessionTtlHours = 24 * 7,
) => {
  const email = input.email.trim().toLowerCase();
  const user = await maybeOne<LoginUserRow>(
    db,
    `SELECT id, email::text, password_hash, account_status, failed_login_attempts, locked_until
       FROM app.users WHERE lower(email::text)=lower($1) FOR UPDATE`,
    [email],
  );
  const locked = user?.locked_until && new Date(user.locked_until).getTime() > Date.now();
  if (locked) {
    await loginEvent(db, user.id, email, 'Blocked', 'Account is temporarily locked.', metadata);
    throw new ApiError(429, 'LOGIN_THROTTLED', 'Too many failed attempts. Try again later.');
  }
  const valid = Boolean(user?.password_hash && (await verifyPassword(user.password_hash, input.password)));
  if (!user || !valid) {
    if (user) {
      const failed = user.failed_login_attempts + 1;
      await db.query(
        `UPDATE app.users SET failed_login_attempts=$2,
          locked_until=CASE WHEN $2 >= $3 THEN clock_timestamp() + ($4 || ' minutes')::interval ELSE NULL END
         WHERE id=$1`,
        [user.id, failed, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
    }
    await loginEvent(db, user?.id ?? null, email, 'Failed', 'Invalid credentials.', metadata);
    throw unauthorized('Invalid email or password.');
  }
  if (user.account_status !== 'Approved') {
    await loginEvent(db, user.id, email, 'Blocked', `Account status is ${user.account_status}.`, metadata);
    const messages: Record<AccountStatus, string> = {
      Pending: 'Your access request is still pending.',
      Rejected: 'Your access request was rejected.',
      Disabled: 'Your account is disabled.',
      Approved: '',
    };
    throw forbidden(messages[user.account_status]);
  }
  const sessionId = randomUUID();
  const token = opaqueToken();
  const expiresAt = new Date(Date.now() + sessionTtlHours * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO app.sessions
      (id, user_id, token_hash, expires_at, ip_address, user_agent, device_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [sessionId, user.id, tokenHash(token), expiresAt, metadata.ip ?? null, metadata.userAgent ?? null, 'Web browser'],
  );
  await db.query(
    `UPDATE app.users SET failed_login_attempts=0, locked_until=NULL, last_login_at=clock_timestamp() WHERE id=$1`,
    [user.id],
  );
  await loginEvent(db, user.id, email, 'Succeeded', 'Password login succeeded.', metadata);
  return { userId: user.id, sessionId, token, expiresAt };
};

export const setSessionCookie = (
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  secure: boolean,
  cookieName = SESSION_COOKIE,
) =>
  reply.setCookie(cookieName, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    expires: expiresAt,
  });

export const clearSessionCookie = (reply: FastifyReply, secure: boolean, cookieName = SESSION_COOKIE) =>
  reply.clearCookie(cookieName, { path: '/', httpOnly: true, secure, sameSite: 'lax' });

export const revokeSession = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  sessionId: string,
  reason = 'User requested session termination.',
) => {
  const result = await db.query(
    `UPDATE app.sessions SET revoked_at=clock_timestamp(), revoked_reason=$3
      WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`,
    [sessionId, principal.userId, reason],
  );
  if (result.rowCount === 0) throw conflict('SESSION_NOT_ACTIVE', 'This session is no longer active.');
};

export const listSessions = (db: Pool | PoolClient, principal: AuthenticatedPrincipal) =>
  rows<Record<string, unknown>>(
    db,
    `SELECT id, COALESCE(device_name,'Web browser') AS "deviceName",
            COALESCE(user_agent,'Unknown client') AS "deviceDetails",
            COALESCE(host(ip_address),'Unknown') AS location,
            last_seen_at AS "lastActiveAt", (id=$2) AS current,
            CASE WHEN user_agent ~* 'Mobile|Android|iPhone|iPad' THEN 'mobile' ELSE 'desktop' END AS device
       FROM app.sessions
      WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > clock_timestamp()
      ORDER BY created_at DESC`,
    [principal.userId, principal.sessionId],
  );
