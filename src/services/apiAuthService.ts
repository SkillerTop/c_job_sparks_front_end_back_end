import type {
  AuthAccessState,
  AuthAccount,
  AuthAccountStatus,
  AuthUser,
  LoginInput,
  PasswordChangeInput,
  RegistrationInput,
} from '@/models/auth';
import { ApiClientError, apiRequest } from './apiClient';

interface MeResponse {
  user: AuthUser;
  session?: { id: string; expiresAt: string };
}

let cachedUser: AuthUser | null = null;
let cachedSession: MeResponse['session'];
let lastRegistration: AuthAccount | null = null;

const me = async () => {
  try {
    const response = await apiRequest<MeResponse>('/api/v1/me');
    cachedUser = response.user;
    cachedSession = response.session;
    return response.user;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      cachedUser = null;
      cachedSession = undefined;
      return null;
    }
    throw error;
  }
};

export const apiAuthService = {
  async initialize() {
    await me();
  },

  getAccessState: () => apiRequest<AuthAccessState>('/api/v1/admin/access-requests'),

  restoreSession: me,

  async getLastRegistration(): Promise<AuthAccount | null> {
    if (lastRegistration) return lastRegistration;
    try {
      return await apiRequest<AuthAccount>('/api/v1/auth/access-requests/me');
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 404)) return null;
      throw error;
    }
  },

  async register(input: RegistrationInput) {
    lastRegistration = await apiRequest<AuthAccount>('/api/v1/auth/access-requests', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return lastRegistration;
  },

  async login(input: LoginInput) {
    const response = await apiRequest<{ account: AuthAccount; user: AuthUser; session?: MeResponse['session'] }>(
      '/api/v1/auth/login',
      { method: 'POST', body: JSON.stringify(input) },
    );
    cachedUser = response.user;
    cachedSession = response.session;
    lastRegistration = null;
    return response.account;
  },

  logout() {
    cachedUser = null;
    cachedSession = undefined;
    void apiRequest<void>('/api/v1/auth/logout', { method: 'POST' });
  },

  clearRegistrationView() {
    lastRegistration = null;
  },

  getSessionExpiry() {
    return cachedSession ? Date.parse(cachedSession.expiresAt) : null;
  },

  getCurrentSession() {
    return cachedSession ? { sessionId: cachedSession.id, createdAt: new Date().toISOString() } : null;
  },

  async changePassword(_employeeId: string, input: PasswordChangeInput) {
    await apiRequest<void>('/api/v1/me/password', { method: 'POST', body: JSON.stringify(input) });
  },

  async reviewRegistration(
    accountId: string,
    decision: Extract<AuthAccountStatus, 'Approved' | 'Rejected'>,
    reason?: string,
  ) {
    return apiRequest<AuthAccount>(`/api/v1/admin/access-requests/${encodeURIComponent(accountId)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    });
  },

  async assertActiveSession(employeeId: string) {
    const user = await me();
    if (!user || user.employeeId !== employeeId) throw new Error('Your session has expired.');
    return user;
  },

  async assertAdministratorSession(employeeId: string) {
    const user = await me();
    if (!user || user.employeeId !== employeeId || user.role !== 'Administrator')
      throw new Error('Administrator access is required.');
    return user;
  },

  async withEmployeeIdentityGuard<T>(_employeeId: string, _email: string, operation: () => Promise<T>) {
    return operation();
  },

  resetForTesting() {
    cachedUser = null;
    cachedSession = undefined;
    lastRegistration = null;
  },
};
