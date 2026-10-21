import type {
  AuthAccessState,
  AccessApprovalEmployeeInput,
  AuthAccount,
  AuthAccountStatus,
  AuthUser,
  LoginInput,
  PasswordChangeInput,
  RegistrationInput,
} from '@/models/auth';
import { ApiClientError, apiRequest, apiUrl } from './apiClient';

interface MeResponse {
  user: AuthUser;
  session?: { id: string; expiresAt: string };
}

let cachedSession: MeResponse['session'];
let lastRegistration: AuthAccount | null = null;

const me = async () => {
  try {
    const response = await apiRequest<MeResponse>('/api/v1/me');
    cachedSession = response.session;
    return response.user;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      cachedSession = undefined;
      return null;
    }
    throw error;
  }
};

export const apiAuthService = {
  getMicrosoftAuthConfig: () => apiRequest<{ enabled: boolean; registrationEnabled: boolean }>('/api/v1/auth/microsoft/config'),

  microsoftSignInUrl(returnTo = '/') {
    const query = new URLSearchParams({ returnTo });
    return apiUrl(`/api/v1/auth/microsoft/start?${query.toString()}`);
  },

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
    cachedSession = response.session;
    lastRegistration = null;
    return response.account;
  },

  logout() {
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
    employee?: AccessApprovalEmployeeInput,
  ) {
    return apiRequest<AuthAccount>(`/api/v1/admin/access-requests/${encodeURIComponent(accountId)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason, employee }),
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

  async deleteEmployeeAccount(_employeeId: string) {
    // The API deletes or tombstones the linked account in the same database transaction as the employee.
  },

  resetForTesting() {
    cachedSession = undefined;
    lastRegistration = null;
  },
};
