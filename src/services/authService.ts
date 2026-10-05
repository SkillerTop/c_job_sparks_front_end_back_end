import { DEMO_AUTH_ACCOUNTS, DEMO_PASSWORD } from '@/data/mockAuthData';
import type {
  AuthAccessState,
  AuthAccount,
  AuthAccountStatus,
  AuthAuditEvent,
  AuthUser,
  LoginInput,
  PasswordChangeInput,
  RegistrationInput,
} from '@/models/auth';
import { sparkService } from '@/services/sparkService';

const AUTH_STATE_KEY = 'c-job-auth-state-v1';
const AUTH_SESSION_KEY = 'c-job-auth-session-v1';
const LAST_ACCOUNT_KEY = 'c-job-auth-last-account-v1';
const AUTH_WRITE_LOCK = 'c-job-auth-write-v1';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const AUTH_CHANGE_EVENT = 'c-job-auth-change';
export const AUTH_STATE_STORAGE_KEY = AUTH_STATE_KEY;
export const MAX_PASSWORD_LENGTH = 128;

type AuthErrorCode =
  | 'ACCOUNT_EXISTS'
  | 'ACCOUNT_DISABLED'
  | 'DIRECTORY_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_PASSWORD'
  | 'INVALID_REVIEW'
  | 'NOT_AUTHORIZED'
  | 'REQUEST_PENDING';

interface StoredAccount extends AuthAccount {
  passwordHash: string;
  passwordSalt: string;
}

interface StoredAuthState {
  version: 1;
  accounts: StoredAccount[];
  auditEvents: AuthAuditEvent[];
}

interface StoredSession {
  accountId: string;
  createdAt: string;
  sessionId: string;
}

export class AuthServiceError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

const localFallback = new Map<string, string>();
const sessionFallback = new Map<string, string>();
const storageModes: Record<'local' | 'session', 'native' | 'memory' | null> = {
  local: null,
  session: null,
};
let initialization: Promise<void> | null = null;
let seededAccounts: Promise<StoredAccount[]> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const storageMap = (kind: 'local' | 'session') => (kind === 'local' ? localFallback : sessionFallback);

const nativeStorage = (kind: 'local' | 'session') => {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const readValue = (kind: 'local' | 'session', key: string) => {
  if (storageModes[kind] === 'memory') return storageMap(kind).get(key) ?? null;
  const storage = nativeStorage(kind);
  if (storage) {
    try {
      const value = storage.getItem(key);
      storageModes[kind] = 'native';
      if (value === null) storageMap(kind).delete(key);
      else storageMap(kind).set(key, value);
      return value;
    } catch {
      storageModes[kind] = 'memory';
    }
  } else {
    storageModes[kind] = 'memory';
  }
  return storageMap(kind).get(key) ?? null;
};

const writeValue = (kind: 'local' | 'session', key: string, value: string) => {
  storageMap(kind).set(key, value);
  if (storageModes[kind] === 'memory') return;
  try {
    const storage = nativeStorage(kind);
    if (!storage) throw new Error('Storage is unavailable.');
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error('Storage write could not be verified.');
    storageModes[kind] = 'native';
  } catch {
    storageModes[kind] = 'memory';
  }
};

const removeValue = (kind: 'local' | 'session', key: string) => {
  storageMap(kind).delete(key);
  if (storageModes[kind] === 'memory') return;
  try {
    const storage = nativeStorage(kind);
    if (!storage) throw new Error('Storage is unavailable.');
    storage.removeItem(key);
    if (storage.getItem(key) !== null) throw new Error('Storage removal could not be verified.');
    storageModes[kind] = 'native';
  } catch {
    storageModes[kind] = 'memory';
  }
};

const emitChange = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

const withMemoryWriteLock = async <T>(operation: () => Promise<T>) => {
  const previous = writeQueue;
  let release: () => void = () => {};
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
};

const withAuthWriteLock = <T>(operation: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(AUTH_WRITE_LOCK, () => operation()).then((result) => result);
  return withMemoryWriteLock(operation);
};

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const validatePassword = (password: string) => {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Use at least 8 characters.');
  if (password.length > MAX_PASSWORD_LENGTH) issues.push(`Use no more than ${MAX_PASSWORD_LENGTH} characters.`);
  if (!/[a-z]/.test(password)) issues.push('Add a lowercase letter.');
  if (!/[A-Z]/.test(password)) issues.push('Add an uppercase letter.');
  if (!/\d/.test(password)) issues.push('Add a number.');
  return { valid: issues.length === 0, issues };
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex: string) => {
  if (!/^[a-f\d]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error('Invalid password salt.');
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
};

const randomHex = (length: number) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};

const derivePasswordHash = async (password: string, salt: string) => {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const result = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 120_000, salt: hexToBytes(salt) },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(result));
};

const passwordRecord = async (password: string) => {
  const passwordSalt = randomHex(16);
  return { passwordSalt, passwordHash: await derivePasswordHash(password, passwordSalt) };
};

const publicAccount = ({ passwordHash: _hash, passwordSalt: _salt, ...account }: StoredAccount) => account;

const parseState = (value: string | null): StoredAuthState | null => {
  if (!value) return null;
  try {
    const state = JSON.parse(value) as StoredAuthState;
    if (state.version !== 1 || !Array.isArray(state.accounts) || !Array.isArray(state.auditEvents)) return null;
    return state;
  } catch {
    return null;
  }
};

const readState = () => parseState(readValue('local', AUTH_STATE_KEY));

const saveState = (state: StoredAuthState) => {
  writeValue('local', AUTH_STATE_KEY, JSON.stringify(state));
  emitChange();
};

const createSeedAccounts = async () => {
  const snapshot = await sparkService.getSnapshot();
  const createdAt = new Date().toISOString();
  return Promise.all(
    DEMO_AUTH_ACCOUNTS.map(async ({ employeeId }) => {
      const employee = snapshot.employees.find((item) => item.id === employeeId);
      if (!employee) throw new Error(`Missing demo employee ${employeeId}.`);
      return {
        id: `account-${employee.id}`,
        employeeId: employee.id,
        email: normalizeEmail(employee.email),
        status: 'Approved' as const,
        source: 'Seed' as const,
        requestedAt: createdAt,
        reviewedAt: createdAt,
        reviewedBy: 'system',
        ...(await passwordRecord(DEMO_PASSWORD)),
      };
    }),
  );
};

const ensureInitialized = async () => {
  if (readState()) return;
  if (!initialization) {
    initialization = withAuthWriteLock(async () => {
      if (readState()) return;
      seededAccounts ??= createSeedAccounts();
      saveState({ version: 1, accounts: structuredClone(await seededAccounts), auditEvents: [] });
    });
  }
  const pendingInitialization = initialization;
  try {
    await pendingInitialization;
  } finally {
    if (initialization === pendingInitialization) initialization = null;
  }
};

const requiredState = () => {
  const state = readState();
  if (!state) throw new Error('Authentication data is unavailable.');
  return state;
};

const createId = (prefix: string) =>
  `${prefix}-${globalThis.crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

const addAudit = (
  state: StoredAuthState,
  account: StoredAccount,
  action: AuthAuditEvent['action'],
  actorId: string,
  details: string,
) => {
  state.auditEvents.unshift({
    id: createId('access-audit'),
    accountId: account.id,
    action,
    actorId,
    createdAt: new Date().toISOString(),
    details,
  });
};

const accountUser = async (
  account: StoredAccount,
  snapshot?: Awaited<ReturnType<typeof sparkService.getSnapshot>>,
): Promise<AuthUser | null> => {
  const currentSnapshot = snapshot ?? (await sparkService.getSnapshot());
  const employee = currentSnapshot.employees.find(
    (item) => item.id === account.employeeId && item.active && normalizeEmail(item.email) === account.email,
  );
  if (!employee) return null;
  return {
    accountId: account.id,
    employeeId: employee.id,
    email: normalizeEmail(employee.email),
    name: employee.name,
    initials: employee.initials,
    title: employee.title,
    departmentId: employee.departmentId,
    role: employee.role,
  };
};

const session = () => {
  try {
    const parsed = JSON.parse(readValue('session', AUTH_SESSION_KEY) ?? '') as StoredSession;
    const createdAt = Date.parse(parsed.createdAt);
    if (
      typeof parsed.accountId !== 'string' ||
      !parsed.accountId ||
      typeof parsed.sessionId !== 'string' ||
      !parsed.sessionId ||
      !Number.isFinite(createdAt) ||
      Date.now() - createdAt > SESSION_TTL_MS ||
      createdAt > Date.now() + 60_000
    ) {
      removeValue('session', AUTH_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const sessionExpiry = () => {
  const activeSession = session();
  return activeSession ? Date.parse(activeSession.createdAt) + SESSION_TTL_MS : null;
};

const setLastAccount = (accountId: string) => writeValue('session', LAST_ACCOUNT_KEY, accountId);

const sameSession = (expected: StoredSession) => {
  const current = session();
  return (
    current?.accountId === expected.accountId &&
    current.createdAt === expected.createdAt &&
    current.sessionId === expected.sessionId
  );
};

const requireAdministrator = async (state: StoredAuthState) => {
  const activeSession = session();
  const account = state.accounts.find(
    (item) => item.id === activeSession?.accountId && item.status === 'Approved',
  );
  const user = account ? await accountUser(account) : null;
  if (!activeSession || !sameSession(activeSession) || !user || user.role !== 'Administrator')
    throw new AuthServiceError('NOT_AUTHORIZED', 'Administrator access is required.');
  return { user, activeSession };
};

export const authService = {
  async initialize() {
    await ensureInitialized();
  },

  async getAccessState(): Promise<AuthAccessState> {
    await ensureInitialized();
    const authorization = await requireAdministrator(requiredState());
    if (!sameSession(authorization.activeSession))
      throw new AuthServiceError('NOT_AUTHORIZED', 'Administrator access is required.');
    const state = requiredState();
    return {
      accounts: state.accounts.map(publicAccount),
      auditEvents: structuredClone(state.auditEvents),
    };
  },

  async restoreSession(): Promise<AuthUser | null> {
    await ensureInitialized();
    const state = requiredState();
    const activeSession = session();
    const account = state.accounts.find(
      (item) => item.id === activeSession?.accountId && item.status === 'Approved',
    );
    if (!account) {
      removeValue('session', AUTH_SESSION_KEY);
      return null;
    }
    const user = await accountUser(account);
    if (!activeSession || !sameSession(activeSession)) return null;
    const currentAccount = requiredState().accounts.find(
      (item) =>
        item.id === account.id &&
        item.employeeId === account.employeeId &&
        item.status === 'Approved',
    );
    if (!user || !currentAccount) {
      if (sameSession(activeSession)) removeValue('session', AUTH_SESSION_KEY);
      return null;
    }
    return user;
  },

  async getLastRegistration(): Promise<AuthAccount | null> {
    await ensureInitialized();
    const accountId = readValue('session', LAST_ACCOUNT_KEY);
    const account = requiredState().accounts.find((item) => item.id === accountId);
    if (account?.source !== 'Registration') return null;
    return publicAccount(account);
  },

  async register(input: RegistrationInput): Promise<AuthAccount> {
    await ensureInitialized();
    const email = normalizeEmail(input.email);
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.valid || input.password !== input.confirmPassword)
      throw new AuthServiceError('INVALID_PASSWORD', 'Check the password requirements and confirmation.');

    const initialSnapshot = await sparkService.getSnapshot();
    const employee = initialSnapshot.employees.find(
      (item) => item.active && normalizeEmail(item.email) === email,
    );
    if (!employee)
      throw new AuthServiceError(
        'DIRECTORY_NOT_FOUND',
        'This email is not linked to an active employee profile. Ask an administrator to update the directory.',
      );

    return withAuthWriteLock(async () => {
      const snapshot = await sparkService.getSnapshot();
      const currentEmployee = snapshot.employees.find(
        (item) => item.id === employee.id && item.active && normalizeEmail(item.email) === email,
      );
      if (!currentEmployee)
        throw new AuthServiceError(
          'DIRECTORY_NOT_FOUND',
          'This directory profile changed while the request was being prepared. Try again.',
        );
      const state = requiredState();
      const existing = state.accounts.find((item) => item.employeeId === currentEmployee.id);
      if (existing && existing.email !== email)
        throw new AuthServiceError(
          'ACCOUNT_DISABLED',
          'This employee email is linked to another local account identity. Contact an administrator.',
        );
      if (existing?.status === 'Approved')
        throw new AuthServiceError('ACCOUNT_EXISTS', 'An approved account already exists for this email. Sign in instead.');
      if (existing?.status === 'Disabled')
        throw new AuthServiceError('ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.');
      if (existing?.status === 'Pending') {
        const matches = (await derivePasswordHash(input.password, existing.passwordSalt)) === existing.passwordHash;
        if (!matches)
          throw new AuthServiceError(
            'REQUEST_PENDING',
            'A registration request already exists for this email. Use the original password to view its status.',
          );
        setLastAccount(existing.id);
        return publicAccount(existing);
      }
      if (existing?.status === 'Rejected') {
        const matches = (await derivePasswordHash(input.password, existing.passwordSalt)) === existing.passwordHash;
        if (!matches)
          throw new AuthServiceError(
            'INVALID_CREDENTIALS',
            'This registration already exists. Use its original password to submit it again.',
          );
        Object.assign(existing, {
          email,
          status: 'Pending' satisfies AuthAccountStatus,
          requestedAt: new Date().toISOString(),
          reviewedAt: undefined,
          reviewedBy: undefined,
          rejectionReason: undefined,
        });
        addAudit(state, existing, 'REGISTRATION_RESUBMITTED', currentEmployee.id, `${email} resubmitted access.`);
        saveState(state);
        setLastAccount(existing.id);
        return publicAccount(existing);
      }

      const credentials = await passwordRecord(input.password);
      const account: StoredAccount = {
        id: createId('account'),
        employeeId: currentEmployee.id,
        email,
        status: 'Pending',
        source: 'Registration',
        requestedAt: new Date().toISOString(),
        ...credentials,
      };
      state.accounts.push(account);
      addAudit(state, account, 'REGISTRATION_SUBMITTED', currentEmployee.id, `${email} requested access.`);
      saveState(state);
      setLastAccount(account.id);
      return publicAccount(account);
    });
  },

  async login(input: LoginInput): Promise<AuthAccount> {
    await ensureInitialized();
    const email = normalizeEmail(input.email);
    const snapshot = await sparkService.getSnapshot();
    const employee = snapshot.employees.find((item) => item.active && normalizeEmail(item.email) === email);
    const initialAccount = employee
      ? requiredState().accounts.find((item) => item.employeeId === employee.id && item.email === email)
      : undefined;
    const matches = initialAccount
      ? (await derivePasswordHash(input.password, initialAccount.passwordSalt)) === initialAccount.passwordHash
      : false;
    const account = initialAccount
      ? requiredState().accounts.find((item) => item.id === initialAccount.id)
      : undefined;
    if (!account || !matches || account.passwordHash !== initialAccount?.passwordHash)
      throw new AuthServiceError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    if (account.status === 'Disabled')
      throw new AuthServiceError('ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.');
    if (account.status !== 'Approved') {
      removeValue('session', AUTH_SESSION_KEY);
      setLastAccount(account.id);
      return publicAccount(account);
    }
    if (!(await accountUser(account, snapshot)))
      throw new AuthServiceError('ACCOUNT_DISABLED', 'This employee profile is inactive or no longer matches the account.');
    writeValue(
      'session',
      AUTH_SESSION_KEY,
      JSON.stringify({
        accountId: account.id,
        createdAt: new Date().toISOString(),
        sessionId: createId('session'),
      } satisfies StoredSession),
    );
    removeValue('session', LAST_ACCOUNT_KEY);
    emitChange();
    return publicAccount(account);
  },

  logout() {
    removeValue('session', AUTH_SESSION_KEY);
    emitChange();
  },

  async changePassword(employeeId: string, input: PasswordChangeInput) {
    await ensureInitialized();
    const validation = validatePassword(input.newPassword);
    if (!validation.valid || input.newPassword !== input.confirmPassword)
      throw new AuthServiceError('INVALID_PASSWORD', 'Check the new password requirements and confirmation.');
    if (input.currentPassword === input.newPassword)
      throw new AuthServiceError('INVALID_PASSWORD', 'Choose a password you have not used for this account.');

    return withAuthWriteLock(async () => {
      const activeSession = session();
      const state = requiredState();
      const account = state.accounts.find(
        (item) => item.id === activeSession?.accountId && item.employeeId === employeeId && item.status === 'Approved',
      );
      if (!activeSession || !account || !sameSession(activeSession))
        throw new AuthServiceError('NOT_AUTHORIZED', 'Your demo session has expired. Sign in again.');
      const matches = (await derivePasswordHash(input.currentPassword, account.passwordSalt)) === account.passwordHash;
      if (!matches) throw new AuthServiceError('INVALID_CREDENTIALS', 'Current password is incorrect.');
      Object.assign(account, await passwordRecord(input.newPassword));
      addAudit(state, account, 'PASSWORD_CHANGED', employeeId, 'Account password changed.');
      saveState(state);
    });
  },

  clearRegistrationView() {
    removeValue('session', LAST_ACCOUNT_KEY);
    emitChange();
  },

  async reviewRegistration(
    accountId: string,
    decision: Extract<AuthAccountStatus, 'Approved' | 'Rejected'>,
    reason = '',
  ): Promise<AuthAccount> {
    await ensureInitialized();
    return withAuthWriteLock(async () => {
      const state = requiredState();
      const authorization = await requireAdministrator(state);
      const account = state.accounts.find((item) => item.id === accountId && item.source === 'Registration');
      if (!account) throw new AuthServiceError('INVALID_REVIEW', 'Registration request was not found.');
      const snapshot = await sparkService.getSnapshot();
      if (account.status === decision) return publicAccount(account);
      if (account.status !== 'Pending')
        throw new AuthServiceError('INVALID_REVIEW', 'This registration request has already been reviewed.');
      const user = await accountUser(account, snapshot);
      if (decision === 'Approved' && !user)
        throw new AuthServiceError(
          'INVALID_REVIEW',
          'The linked employee is inactive or no longer exists in the directory.',
        );
      const rejectionReason = reason.trim();
      if (decision === 'Rejected' && rejectionReason.length < 5)
        throw new AuthServiceError('INVALID_REVIEW', 'Add a short reason before rejecting this request.');
      if (!sameSession(authorization.activeSession))
        throw new AuthServiceError('NOT_AUTHORIZED', 'Administrator access is required.');

      if (user) account.email = normalizeEmail(user.email);
      account.status = decision;
      account.reviewedAt = new Date().toISOString();
      account.reviewedBy = authorization.user.employeeId;
      account.rejectionReason = decision === 'Rejected' ? rejectionReason : undefined;
      addAudit(
        state,
        account,
        decision === 'Approved' ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED',
        authorization.user.employeeId,
        decision === 'Approved'
          ? `${user!.email} approved.`
          : `${account.email} rejected: ${rejectionReason}`,
      );
      saveState(state);
      return publicAccount(account);
    });
  },

  getSessionExpiry() {
    return sessionExpiry();
  },

  getCurrentSession() {
    const activeSession = session();
    return activeSession ? structuredClone(activeSession) : null;
  },

  async assertActiveSession(employeeId: string) {
    const user = await this.restoreSession();
    if (!user || user.employeeId !== employeeId) {
      emitChange();
      throw new AuthServiceError('NOT_AUTHORIZED', 'Your demo session has expired. Sign in again.');
    }
    return user;
  },

  async assertAdministratorSession(employeeId: string) {
    await ensureInitialized();
    const authorization = await requireAdministrator(requiredState());
    if (authorization.user.employeeId !== employeeId || !sameSession(authorization.activeSession))
      throw new AuthServiceError('NOT_AUTHORIZED', 'Administrator access is required.');
    return authorization.user;
  },

  async withEmployeeIdentityGuard<T>(
    employeeId: string,
    email: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    await ensureInitialized();
    return withAuthWriteLock(async () => {
      const state = requiredState();
      const authorization = await requireAdministrator(state);
      const linkedAccount = state.accounts.find((account) => account.employeeId === employeeId);
      if (linkedAccount && linkedAccount.email !== normalizeEmail(email))
        throw new AuthServiceError(
          'INVALID_REVIEW',
          'Email is locked because this employee already has a local access account.',
        );
      if (!sameSession(authorization.activeSession))
        throw new AuthServiceError('NOT_AUTHORIZED', 'Administrator access is required.');
      return operation();
    });
  },

  resetForTesting() {
    removeValue('local', AUTH_STATE_KEY);
    removeValue('session', AUTH_SESSION_KEY);
    removeValue('session', LAST_ACCOUNT_KEY);
    initialization = null;
    writeQueue = Promise.resolve();
    storageModes.local = null;
    storageModes.session = null;
  },
};
