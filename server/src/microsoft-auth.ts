import { createHash, createPublicKey, randomUUID, verify as verifySignature, type JsonWebKey } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Environment } from './config/env.js';
import { createAuthenticatedSession } from './auth.js';
import { createNotification, enqueueOutbox, writeAudit } from './audit.js';
import { ApiError, badRequest, forbidden } from './errors.js';
import type { Queryable } from './sql.js';
import { maybeOne } from './sql.js';
import { opaqueToken, safeEqual, tokenHash } from './security.js';

export const MICROSOFT_STATE_COOKIE = 'c_job_sparks_microsoft_state';
const MICROSOFT_SCOPES = 'openid profile email User.Read User.Read.All';
const CLOCK_SKEW_SECONDS = 60;

const MICROSOFT_APP_ROLE_TO_BUSINESS_ROLE = {
  'CJob.Employee': 'Employee',
  'CJob.Coordinator': 'Coordinator',
  'CJob.GPM': 'GPM',
  'CJob.Head': 'Head',
  'CJob.TopManagement': 'Top Management',
  'CJob.Administrator': 'Administrator',
} as const;

type BusinessRole = typeof MICROSOFT_APP_ROLE_TO_BUSINESS_ROLE[keyof typeof MICROSOFT_APP_ROLE_TO_BUSINESS_ROLE];

interface OpenIdConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
  jwks_uri: string;
}

interface CachedValue<T> {
  value: T;
  expiresAt: number;
}

interface MicrosoftAuthRequestRow {
  id: string;
  nonce: string;
  code_verifier: string;
  return_path: string;
}

interface MicrosoftClaims extends Record<string, unknown> {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  name?: string;
  nbf?: number;
  nonce?: string;
  oid?: string;
  preferred_username?: string;
  roles?: unknown;
  sub?: string;
  tid?: string;
  upn?: string;
}

interface MicrosoftIdentity {
  appRoles?: readonly string[];
  businessRole?: BusinessRole | null;
  department?: string | null;
  email: string;
  givenName?: string | null;
  jobTitle: string | null;
  manager?: MicrosoftGraphManager | null | undefined;
  name: string | null;
  surname?: string | null;
  subject: string;
  tenantId: string;
}

interface MicrosoftGraphProfile {
  department: string | null;
  displayName: string | null;
  givenName: string | null;
  jobTitle: string | null;
  surname: string | null;
}

interface MicrosoftGraphManager {
  displayName: string | null;
  email: string | null;
  id: string | null;
}

interface MicrosoftAccountRow {
  user_id: string | null;
  employee_id: string | null;
  employee_number: string | null;
  first_name: string | null;
  last_name: string | null;
  department_id: string | null;
  email: string | null;
  account_status: string | null;
  auth_provider: 'local' | 'entra' | null;
  provider_subject: string | null;
  is_active: boolean | null;
}

const discoveryCache = new Map<string, CachedValue<OpenIdConfiguration>>();
const jwksCache = new Map<string, CachedValue<readonly Record<string, unknown>[]>>();

const microsoftSettings = (environment: Environment) => {
  if (
    !environment.MICROSOFT_AUTH_ENABLED ||
    !environment.MICROSOFT_TENANT_ID ||
    !environment.MICROSOFT_CLIENT_ID ||
    !environment.MICROSOFT_CLIENT_SECRET ||
    !environment.MICROSOFT_REDIRECT_URI
  ) throw new ApiError(503, 'MICROSOFT_AUTH_DISABLED', 'Microsoft sign-in is not configured.');
  return {
    tenantId: environment.MICROSOFT_TENANT_ID,
    clientId: environment.MICROSOFT_CLIENT_ID,
    clientSecret: environment.MICROSOFT_CLIENT_SECRET,
    redirectUri: environment.MICROSOFT_REDIRECT_URI,
  };
};

const isMicrosoftHttpsUrl = (value: string) => {
  const url = new URL(value);
  return url.protocol === 'https:' &&
    (url.hostname === 'login.microsoftonline.com' || url.hostname.endsWith('.login.microsoftonline.com'));
};

const fetchJson = async (url: string, init?: RequestInit) => {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ApiError(502, 'MICROSOFT_AUTH_UNAVAILABLE', 'Microsoft sign-in is temporarily unavailable.');
  }
  if (!response.ok) {
    throw new ApiError(502, 'MICROSOFT_AUTH_UNAVAILABLE', 'Microsoft sign-in is temporarily unavailable.');
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new ApiError(502, 'MICROSOFT_AUTH_INVALID_RESPONSE', 'Microsoft returned an invalid authentication response.');
  }
};

const microsoftProfilePhoto = async (accessToken: string | null) => {
  if (!accessToken) return null;
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (!contentType || !['image/jpeg', 'image/png'].includes(contentType)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 2_000_000) return null;
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
};

const microsoftGraphProfile = async (accessToken: string | null): Promise<MicrosoftGraphProfile | null> => {
  if (!accessToken) return null;
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,givenName,surname,jobTitle,department', {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const source = await response.json() as Record<string, unknown>;
    const optionalText = (value: unknown, maxLength = 200) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
    return {
      department: optionalText(source.department),
      displayName: optionalText(source.displayName),
      givenName: optionalText(source.givenName, 100),
      jobTitle: optionalText(source.jobTitle),
      surname: optionalText(source.surname, 100),
    };
  } catch {
    return null;
  }
};

const microsoftGraphManager = async (accessToken: string | null): Promise<MicrosoftGraphManager | null | undefined> => {
  if (!accessToken) return undefined;
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/manager?$select=id,displayName,mail,userPrincipalName',
      {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) return undefined;
    const source = await response.json() as Record<string, unknown>;
    const optionalText = (value: unknown, maxLength = 200) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
    const email = optionalText(source.mail, 320) ?? optionalText(source.userPrincipalName, 320);
    return {
      displayName: optionalText(source.displayName),
      email: email?.toLowerCase() ?? null,
      id: optionalText(source.id, 100),
    };
  } catch {
    return undefined;
  }
};

const mappedBusinessRole = (appRoles: readonly string[]) => {
  const recognized = [...new Set(appRoles
    .map((role) => MICROSOFT_APP_ROLE_TO_BUSINESS_ROLE[role as keyof typeof MICROSOFT_APP_ROLE_TO_BUSINESS_ROLE])
    .filter((role): role is BusinessRole => Boolean(role)))];
  return recognized.length === 1 ? recognized[0]! : null;
};

const microsoftIdentityClaims = (identity: MicrosoftIdentity) => ({
  appRoles: identity.appRoles ?? [],
  businessRole: identity.businessRole ?? null,
  department: identity.department ?? null,
  givenName: identity.givenName ?? null,
  jobTitle: identity.jobTitle,
  manager: identity.manager,
  name: identity.name,
  surname: identity.surname ?? null,
});

const openIdConfiguration = async (tenantId: string) => {
  const cached = discoveryCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const discoveryUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0/.well-known/openid-configuration`;
  const source = await fetchJson(discoveryUrl);
  if (!source || typeof source !== 'object')
    throw new ApiError(502, 'MICROSOFT_AUTH_INVALID_RESPONSE', 'Microsoft returned invalid OpenID configuration.');
  const candidate = source as Partial<OpenIdConfiguration>;
  for (const value of [candidate.authorization_endpoint, candidate.token_endpoint, candidate.jwks_uri]) {
    if (typeof value !== 'string' || !isMicrosoftHttpsUrl(value))
      throw new ApiError(502, 'MICROSOFT_AUTH_INVALID_RESPONSE', 'Microsoft returned unsafe OpenID endpoints.');
  }
  if (typeof candidate.issuer !== 'string' || !candidate.issuer.startsWith('https://login.microsoftonline.com/'))
    throw new ApiError(502, 'MICROSOFT_AUTH_INVALID_RESPONSE', 'Microsoft returned an invalid token issuer.');
  const value: OpenIdConfiguration = {
    authorization_endpoint: candidate.authorization_endpoint!,
    token_endpoint: candidate.token_endpoint!,
    issuer: candidate.issuer,
    jwks_uri: candidate.jwks_uri!,
  };
  discoveryCache.set(tenantId, { value, expiresAt: Date.now() + 60 * 60 * 1000 });
  return value;
};

const signingKeys = async (jwksUri: string, forceRefresh = false) => {
  const cached = jwksCache.get(jwksUri);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const source = await fetchJson(jwksUri);
  const keys = source && typeof source === 'object' && Array.isArray((source as { keys?: unknown }).keys)
    ? (source as { keys: Record<string, unknown>[] }).keys
    : null;
  if (!keys) throw new ApiError(502, 'MICROSOFT_AUTH_INVALID_RESPONSE', 'Microsoft returned invalid signing keys.');
  jwksCache.set(jwksUri, { value: keys, expiresAt: Date.now() + 60 * 60 * 1000 });
  return keys;
};

const parseJwt = (token: string) => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2])
    throw badRequest('MICROSOFT_TOKEN_INVALID', 'Microsoft returned an invalid identity token.');
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>,
      claims: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as MicrosoftClaims,
      signature: Buffer.from(parts[2], 'base64url'),
      signingInput: Buffer.from(`${parts[0]}.${parts[1]}`),
    };
  } catch {
    throw badRequest('MICROSOFT_TOKEN_INVALID', 'Microsoft returned an invalid identity token.');
  }
};

const validateIdToken = async (
  idToken: string,
  expectedNonce: string,
  environment: Environment,
  configuration: OpenIdConfiguration,
): Promise<MicrosoftIdentity> => {
  const settings = microsoftSettings(environment);
  const parsed = parseJwt(idToken);
  if (parsed.header.alg !== 'RS256' || typeof parsed.header.kid !== 'string')
    throw badRequest('MICROSOFT_TOKEN_INVALID', 'Microsoft returned a token with an unsupported signature.');

  let keys = await signingKeys(configuration.jwks_uri);
  let key = keys.find((candidate) => candidate.kid === parsed.header.kid && candidate.kty === 'RSA');
  if (!key) {
    keys = await signingKeys(configuration.jwks_uri, true);
    key = keys.find((candidate) => candidate.kid === parsed.header.kid && candidate.kty === 'RSA');
  }
  if (!key) throw badRequest('MICROSOFT_TOKEN_INVALID', 'Microsoft token signing key was not found.');
  let publicKey;
  try {
    publicKey = createPublicKey({ key: key as JsonWebKey, format: 'jwk' });
  } catch {
    throw badRequest('MICROSOFT_TOKEN_INVALID', 'Microsoft token signing key is invalid.');
  }
  if (!verifySignature('RSA-SHA256', parsed.signingInput, publicKey, parsed.signature))
    throw badRequest('MICROSOFT_TOKEN_INVALID', 'Microsoft token signature is invalid.');

  const now = Math.floor(Date.now() / 1000);
  const audience = parsed.claims.aud;
  const audienceMatches = audience === settings.clientId || (Array.isArray(audience) && audience.includes(settings.clientId));
  if (
    parsed.claims.iss !== configuration.issuer ||
    !audienceMatches ||
    typeof parsed.claims.exp !== 'number' || parsed.claims.exp < now - CLOCK_SKEW_SECONDS ||
    (typeof parsed.claims.nbf === 'number' && parsed.claims.nbf > now + CLOCK_SKEW_SECONDS) ||
    typeof parsed.claims.nonce !== 'string' || !safeEqual(parsed.claims.nonce, expectedNonce)
  ) throw badRequest('MICROSOFT_TOKEN_INVALID', 'Microsoft identity token validation failed.');

  const tenantId = typeof parsed.claims.tid === 'string' ? parsed.claims.tid : '';
  if (/^[0-9a-f-]{36}$/i.test(settings.tenantId) && tenantId.toLowerCase() !== settings.tenantId.toLowerCase())
    throw forbidden('This Microsoft tenant is not allowed.');
  const subject = typeof parsed.claims.oid === 'string'
    ? parsed.claims.oid
    : typeof parsed.claims.sub === 'string' ? parsed.claims.sub : '';
  const emailValue = [parsed.claims.email, parsed.claims.preferred_username, parsed.claims.upn]
    .find((value): value is string => typeof value === 'string' && value.includes('@'));
  if (!tenantId || !subject || !emailValue)
    throw forbidden('Your Microsoft account does not provide a usable work email identity.');
  const appRoles = Array.isArray(parsed.claims.roles)
    ? parsed.claims.roles.filter((role): role is string => typeof role === 'string' && role.trim().length > 0)
      .map((role) => role.trim().slice(0, 200))
    : [];
  return {
    appRoles,
    businessRole: mappedBusinessRole(appRoles),
    department: null,
    email: emailValue.trim().toLowerCase(),
    givenName: null,
    jobTitle: null,
    manager: undefined,
    name: typeof parsed.claims.name === 'string' ? parsed.claims.name : null,
    surname: null,
    subject,
    tenantId,
  };
};

export const safeReturnPath = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value.slice(0, 2000) : '/';

export const createMicrosoftAuthorization = async (
  db: Queryable,
  environment: Environment,
  returnTo: unknown,
  metadata: { ip?: string | null; userAgent?: string | null },
) => {
  const settings = microsoftSettings(environment);
  const configuration = await openIdConfiguration(settings.tenantId);
  const state = opaqueToken(32);
  const nonce = opaqueToken(32);
  const codeVerifier = opaqueToken(64);
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  await db.query(
    `INSERT INTO app.microsoft_auth_requests
      (state_hash, nonce, code_verifier, return_path, request_ip, request_user_agent, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '10 minutes')`,
    [tokenHash(state), nonce, codeVerifier, safeReturnPath(returnTo), metadata.ip ?? null, metadata.userAgent ?? null],
  );
  const authorizationUrl = new URL(configuration.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    client_id: settings.clientId,
    response_type: 'code',
    redirect_uri: settings.redirectUri,
    response_mode: 'query',
    scope: MICROSOFT_SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { state, authorizationUrl: authorizationUrl.toString() };
};

export const findMicrosoftAuthRequest = (db: Pool, state: string) =>
  maybeOne<MicrosoftAuthRequestRow>(
    db,
    `SELECT id, nonce, code_verifier, return_path
       FROM app.microsoft_auth_requests
      WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp()`,
    [tokenHash(state)],
  );

export const exchangeMicrosoftCode = async (
  code: string,
  authRequest: MicrosoftAuthRequestRow,
  environment: Environment,
) => {
  const settings = microsoftSettings(environment);
  const configuration = await openIdConfiguration(settings.tenantId);
  const source = await fetchJson(configuration.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      code,
      redirect_uri: settings.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: authRequest.code_verifier,
      scope: MICROSOFT_SCOPES,
    }),
  });
  const idToken = source && typeof source === 'object' && typeof (source as { id_token?: unknown }).id_token === 'string'
    ? (source as { id_token: string }).id_token
    : null;
  if (!idToken) throw new ApiError(502, 'MICROSOFT_TOKEN_EXCHANGE_FAILED', 'Microsoft sign-in could not be completed.');
  const identity = await validateIdToken(idToken, authRequest.nonce, environment, configuration);
  const accessToken = source && typeof source === 'object' && typeof (source as { access_token?: unknown }).access_token === 'string'
    ? (source as { access_token: string }).access_token
    : null;
  const [profile, manager, avatarDataUrl] = await Promise.all([
    microsoftGraphProfile(accessToken),
    microsoftGraphManager(accessToken),
    microsoftProfilePhoto(accessToken),
  ]);
  return {
    identity: {
      ...identity,
      department: profile?.department ?? null,
      givenName: profile?.givenName ?? null,
      name: profile?.displayName ?? identity.name,
      jobTitle: profile?.jobTitle ?? null,
      manager,
      surname: profile?.surname ?? null,
    },
    avatarDataUrl,
  };
};

const directorySuggestions = async (db: Queryable, identity: MicrosoftIdentity) => {
  let department = identity.department
    ? await maybeOne<{ id: string; is_active: boolean }>(db,
      `SELECT id,is_active FROM app.departments
        WHERE lower(btrim(name))=lower(btrim($1))
        ORDER BY is_active DESC,id LIMIT 1`, [identity.department])
    : null;
  if (identity.department && department && !department.is_active) {
    await db.query(`UPDATE app.departments SET is_active=true,updated_at=clock_timestamp() WHERE id=$1`,
      [department.id]);
    department = { ...department, is_active: true };
  } else if (identity.department && !department) {
    const normalizedName = identity.department.trim().slice(0, 200);
    const code = `MICROSOFT-${createHash('sha256').update(normalizedName.toLocaleLowerCase()).digest('hex').slice(0, 16).toUpperCase()}`;
    department = await maybeOne<{ id: string; is_active: boolean }>(db,
      `INSERT INTO app.departments (id,code,name,is_active)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,is_active=true,updated_at=clock_timestamp()
       RETURNING id,is_active`, [randomUUID(), code, normalizedName]);
  }
  const manager = identity.manager?.email
    ? await maybeOne<{ id: string }>(db,
      `SELECT employee.id
         FROM app.employees employee
         LEFT JOIN app.users account_user ON account_user.id=employee.user_id
        WHERE employee.is_active
          AND lower(COALESCE(employee.contact_email::text,account_user.email::text))=lower($1)
        ORDER BY employee.id LIMIT 1`, [identity.manager.email])
    : null;
  return { departmentId: department?.id ?? null, managerId: manager?.id ?? null };
};

const managerAssignmentWouldCycle = async (
  db: Queryable,
  employeeId: string,
  managerId: string,
) => {
  if (employeeId === managerId) return true;
  const result = await maybeOne<{ found: boolean }>(db,
    `WITH RECURSIVE manager_chain AS (
       SELECT id,manager_employee_id,ARRAY[id]::uuid[] AS path
         FROM app.employees WHERE id=$1
       UNION ALL
       SELECT manager.id,manager.manager_employee_id,chain.path || manager.id
         FROM app.employees manager
         JOIN manager_chain chain ON manager.id=chain.manager_employee_id
        WHERE NOT manager.id=ANY(chain.path)
     )
     SELECT true AS found FROM manager_chain WHERE id=$2 LIMIT 1`,
    [managerId, employeeId]);
  return Boolean(result?.found);
};

const synchronizeMicrosoftDirectoryProfile = async (
  db: Queryable,
  userId: string,
  employeeId: string,
  identity: MicrosoftIdentity,
  metadata: { ip?: string | null; userAgent?: string | null; requestId?: string | null },
) => {
  const current = await maybeOne<{
    department_id: string | null;
    display_name: string;
    first_name: string;
    job_title: string | null;
    last_name: string;
    manager_employee_id: string | null;
    position_id: string | null;
  }>(db,
  `SELECT employee.first_name,employee.last_name,employee.display_name,employee.department_id,
          employee.manager_employee_id,employee.position_id,position.title AS job_title
     FROM app.employees employee
     LEFT JOIN app.positions position ON position.id=employee.position_id
    WHERE employee.id=$1`, [employeeId]);
  if (!current) return;

  const suggestions = await directorySuggestions(db, identity);
  const displayParts = identity.name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const firstName = identity.givenName?.trim() || displayParts[0] || current.first_name;
  const lastName = identity.surname?.trim() ||
    (!identity.givenName && displayParts.length > 1 ? displayParts.slice(1).join(' ') : current.last_name);
  const displayName = identity.name?.trim() || `${firstName} ${lastName}`.trim();

  let positionId = current.position_id;
  if (identity.jobTitle && identity.jobTitle.toLocaleLowerCase() !== current.job_title?.toLocaleLowerCase()) {
    let position = await maybeOne<{ id: string }>(db,
      `SELECT id FROM app.positions WHERE is_active AND lower(btrim(title))=lower(btrim($1)) ORDER BY id LIMIT 1`,
      [identity.jobTitle]);
    if (!position) {
      position = { id: randomUUID() };
      await db.query(`INSERT INTO app.positions (id,code,title) VALUES ($1,$2,$3)`,
        [position.id, `MICROSOFT-${position.id}`, identity.jobTitle]);
    }
    positionId = position.id;
  }

  let departmentId = current.department_id;
  if (suggestions.departmentId && suggestions.departmentId !== current.department_id) {
    await db.query(`UPDATE app.departments SET head_employee_id=NULL,updated_at=clock_timestamp()
      WHERE head_employee_id=$1`, [employeeId]);
    departmentId = suggestions.departmentId;
  }

  let managerId = current.manager_employee_id;
  if (identity.manager === null) {
    managerId = null;
  } else if (identity.manager !== undefined) {
    managerId = suggestions.managerId &&
      !(await managerAssignmentWouldCycle(db, employeeId, suggestions.managerId))
      ? suggestions.managerId
      : null;
  }

  const before = {
    departmentId: current.department_id,
    displayName: current.display_name,
    firstName: current.first_name,
    jobTitle: current.job_title,
    lastName: current.last_name,
    managerId: current.manager_employee_id,
    positionId: current.position_id,
  };
  const after = { departmentId, displayName, firstName, jobTitle: identity.jobTitle ?? current.job_title,
    lastName, managerId, positionId };
  if (JSON.stringify(before) === JSON.stringify(after)) return;

  await db.query(
    `UPDATE app.employees
        SET first_name=$2,last_name=$3,display_name=$4,department_id=$5,position_id=$6,
            manager_employee_id=$7,updated_at=clock_timestamp(),row_version=row_version+1
      WHERE id=$1`,
    [employeeId, firstName, lastName, displayName, departmentId, positionId, managerId],
  );
  await writeAudit(db, {
    actorUserId: userId,
    action: 'MICROSOFT_DIRECTORY_PROFILE_SYNCED',
    objectType: 'Employee',
    objectId: employeeId,
    before,
    after,
    requestId: metadata.requestId ?? randomUUID(),
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  });
};

export const completeMicrosoftLogin = async (
  db: PoolClient,
  state: string,
  identity: MicrosoftIdentity,
  avatarDataUrl: string | null,
  metadata: { ip?: string | null; userAgent?: string | null; requestId?: string | null },
  sessionTtlHours: number,
) => {
  const authRequest = await maybeOne<MicrosoftAuthRequestRow>(
    db,
    `SELECT id, nonce, code_verifier, return_path
       FROM app.microsoft_auth_requests
      WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp()
      FOR UPDATE`,
    [tokenHash(state)],
  );
  if (!authRequest) throw badRequest('MICROSOFT_STATE_INVALID', 'This Microsoft sign-in attempt is invalid or expired.');
  await db.query(`UPDATE app.microsoft_auth_requests SET consumed_at=clock_timestamp() WHERE id=$1`, [authRequest.id]);

  const linked = await maybeOne<MicrosoftAccountRow>(
    db,
    `SELECT identity.user_id, employee.id AS employee_id, employee.employee_number,
            employee.first_name, employee.last_name, employee.department_id,
            account_user.email::text, account_user.account_status, account_user.auth_provider,
            account_user.provider_subject, employee.is_active
       FROM app.external_identities identity
       JOIN app.users account_user ON account_user.id=identity.user_id
       LEFT JOIN app.employees employee ON employee.user_id=account_user.id
      WHERE identity.provider='microsoft' AND identity.provider_tenant=$1 AND identity.provider_subject=$2
      FOR UPDATE OF identity, account_user`,
    [identity.tenantId, identity.subject],
  );

  let account = linked;
  if (!account) {
    account = await maybeOne<MicrosoftAccountRow>(
      db,
      `SELECT account_user.id AS user_id, employee.id AS employee_id, employee.employee_number,
              employee.first_name, employee.last_name, employee.department_id,
              account_user.email::text, account_user.account_status, account_user.auth_provider,
              account_user.provider_subject, employee.is_active
         FROM app.employees employee
         LEFT JOIN app.users account_user ON account_user.id=employee.user_id
        WHERE lower(employee.contact_email::text)=lower($1)
        FOR UPDATE OF employee`,
      [identity.email],
    );

    if (!account) {
      account = await maybeOne<MicrosoftAccountRow>(db,
        `SELECT account_user.id AS user_id,NULL::uuid AS employee_id,NULL::text AS employee_number,
                NULL::text AS first_name,NULL::text AS last_name,NULL::uuid AS department_id,
                account_user.email::text,account_user.account_status,account_user.auth_provider,
                account_user.provider_subject,NULL::boolean AS is_active
           FROM app.users account_user
          WHERE lower(account_user.email::text)=lower($1)
          FOR UPDATE`, [identity.email]);
    }

    account ??= {
      user_id: null,
      employee_id: null,
      employee_number: null,
      first_name: null,
      last_name: null,
      department_id: null,
      email: null,
      account_status: null,
      auth_provider: null,
      provider_subject: null,
      is_active: null,
    };

    if (account.user_id) {
      const lockedUser = await maybeOne<{
        email: string;
        account_status: string;
        auth_provider: 'local' | 'entra';
        provider_subject: string | null;
      }>(db, `SELECT email::text,account_status,auth_provider,provider_subject
        FROM app.users WHERE id=$1 FOR UPDATE`, [account.user_id]);
      if (!lockedUser) throw forbidden('The linked employee account no longer exists.');
      account = { ...account, ...lockedUser };
    }

    if (!account.user_id) {
      const userId = randomUUID();
      await db.query(
        `INSERT INTO app.users
          (id,email,password_hash,auth_provider,provider_subject,account_status)
         VALUES ($1,$2,NULL,'entra',$3,'Pending')`,
        [userId, identity.email, `${identity.tenantId}:${identity.subject}`],
      );
      if (account.employee_id)
        await db.query(`UPDATE app.employees SET user_id=$2 WHERE id=$1 AND user_id IS NULL`, [account.employee_id, userId]);
      account = { ...account, user_id: userId, email: identity.email, account_status: 'Pending',
        auth_provider: 'entra', provider_subject: `${identity.tenantId}:${identity.subject}` };
    } else if (
      account.auth_provider === 'entra' && account.provider_subject &&
      account.provider_subject !== `${identity.tenantId}:${identity.subject}`
    ) {
      throw forbidden('This employee account is already linked to a different Microsoft identity.');
    }

    await db.query(
      `INSERT INTO app.external_identities
        (provider, provider_tenant, provider_subject, user_id, email, claims)
       VALUES ('microsoft',$1,$2,$3,$4,$5::jsonb)`,
      [identity.tenantId, identity.subject, account.user_id, identity.email,
        JSON.stringify(microsoftIdentityClaims(identity))],
    );
  } else {
    await db.query(
      `UPDATE app.external_identities
          SET email=$3,
              claims=(CASE WHEN $5::boolean THEN claims ELSE claims-'manager' END) || $4::jsonb,
              last_login_at=clock_timestamp()
        WHERE provider='microsoft' AND provider_tenant=$1 AND provider_subject=$2`,
      [identity.tenantId, identity.subject, identity.email,
        JSON.stringify(microsoftIdentityClaims(identity)), identity.manager === undefined],
    );
  }

  if (!account.user_id || !account.email)
    throw forbidden('Your C-Job Sparks account could not be prepared.');

  const avatarSettings = avatarDataUrl
    ? { avatarDataUrl, avatarSource: 'microsoft' }
    : { avatarSource: 'microsoft' };
  await db.query(
    `INSERT INTO app.user_preferences (user_id,accessibility_settings)
     VALUES ($1,$2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET accessibility_settings=
       (app.user_preferences.accessibility_settings-'avatarDataUrl'-'avatarSource') || EXCLUDED.accessibility_settings`,
    [account.user_id, JSON.stringify(avatarSettings)],
  );

  if (account.account_status === 'Rejected' || account.account_status === 'Disabled') {
    await db.query(
      `UPDATE app.users SET account_status='Pending',disabled_at=NULL,disabled_by_user_id=NULL,disabled_reason=NULL,
        updated_at=clock_timestamp(),row_version=row_version+1 WHERE id=$1`,
      [account.user_id],
    );
    account = { ...account, account_status: 'Pending' };
  }

  if (account.account_status === 'Pending') {
    const suggestedName = (identity.name?.trim() || identity.email.split('@', 1)[0]!)
      .split(/\s+|[._-]+/).filter(Boolean);
    const firstName = identity.givenName ?? account.first_name ?? suggestedName[0] ?? 'New';
    const lastName = identity.surname ?? account.last_name ?? (suggestedName.slice(1).join(' ') || 'Employee');
    const suggestions = await directorySuggestions(db, identity);
    let accessRequest = await maybeOne<{ id: string }>(
      db,
      `SELECT id FROM app.access_requests WHERE resulting_user_id=$1 AND status='Pending'
       ORDER BY requested_at DESC LIMIT 1 FOR UPDATE`,
      [account.user_id],
    );
    if (!accessRequest) {
      accessRequest = await maybeOne<{ id: string }>(
        db,
        `INSERT INTO app.access_requests
          (email,first_name,last_name,employee_number,requested_department_id,resulting_user_id,
           request_ip,request_user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [identity.email, firstName, lastName, account.employee_number,
          suggestions.departmentId ?? account.department_id,
          account.user_id, metadata.ip ?? null, metadata.userAgent ?? null],
      );
      if (!accessRequest) throw new ApiError(500, 'MICROSOFT_REGISTRATION_FAILED', 'Microsoft access request could not be created.');
      const administrators = await db.query<{ id: string }>(`SELECT DISTINCT account_user.id FROM app.users account_user
        JOIN app.role_assignments assignment ON assignment.user_id=account_user.id
        JOIN app.roles role ON role.id=assignment.role_id AND role.code='Administrator'
        WHERE account_user.account_status='Approved' AND assignment.ends_at IS NULL`);
      for (const administrator of administrators.rows)
        await createNotification(db, administrator.id, 'ApprovalRequested', 'New Microsoft access request',
          `${identity.email} requested access with Microsoft.`, 'AccessRequest', accessRequest.id);
      await enqueueOutbox(db, 'AccessRequested', 'AccessRequest', accessRequest.id,
        { userId: account.user_id, email: identity.email, provider: 'microsoft' });
      await writeAudit(db, {
        actorUserId: account.user_id,
        action: 'MICROSOFT_ACCESS_REQUESTED',
        objectType: 'AccessRequest',
        objectId: accessRequest.id,
        after: {
          department: identity.department ?? null,
          departmentId: suggestions.departmentId,
          email: identity.email,
          provider: 'microsoft',
        },
        requestId: metadata.requestId ?? randomUUID(),
        ip: metadata.ip,
        userAgent: metadata.userAgent,
      });
    } else {
      await db.query(
        `UPDATE app.access_requests
            SET first_name=$2,last_name=$3,requested_department_id=COALESCE($4,requested_department_id)
          WHERE id=$1`,
        [accessRequest.id, firstName, lastName, suggestions.departmentId ?? account.department_id],
      );
    }
    await db.query(`INSERT INTO app.login_events
      (user_id,email,outcome,reason,ip_address,user_agent,request_id)
      VALUES ($1,$2,'Blocked','Microsoft access request is pending.',$3,$4,$5)`,
    [account.user_id, account.email, metadata.ip ?? null, metadata.userAgent ?? null, metadata.requestId ?? null]);
    return { status: 'Pending' as const, email: identity.email, returnPath: authRequest.return_path };
  }

  if (account.account_status !== 'Approved')
    throw forbidden('Your C-Job Sparks account is disabled.');
  if (!account.employee_id || !account.is_active)
    throw forbidden('Your C-Job Sparks employee record is inactive.');
  await synchronizeMicrosoftDirectoryProfile(
    db,
    account.user_id!,
    account.employee_id,
    identity,
    metadata,
  );
  const session = await createAuthenticatedSession(
    db,
    { id: account.user_id!, email: identity.email },
    metadata,
    sessionTtlHours,
    'Microsoft login succeeded.',
  );
  return { status: 'Authenticated' as const, ...session, returnPath: authRequest.return_path };
};
