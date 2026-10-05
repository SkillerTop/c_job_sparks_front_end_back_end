import type {
  ActiveSession,
  InterfaceLanguage,
  NotificationPreferences,
  ProfilePreferences,
} from '@/models/profile';
import { apiRequest } from './apiClient';

export const apiProfileService = {
  getPreferences: (_employeeId: string, _accountEmail: string) =>
    apiRequest<ProfilePreferences>('/api/v1/me/preferences'),

  requestEmailVerification: (_employeeId: string, _accountEmail: string, nextEmail: string) =>
    apiRequest<ProfilePreferences>('/api/v1/me/email-change', {
      method: 'POST',
      body: JSON.stringify({ email: nextEmail }),
    }),

  savePreferences: (
    _employeeId: string,
    _accountEmail: string,
    language: InterfaceLanguage,
    notifications: NotificationPreferences,
  ) =>
    apiRequest<ProfilePreferences>('/api/v1/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ language, notifications }),
    }),

  saveAvatar: async (_employeeId: string, _accountEmail: string, avatarDataUrl?: string) =>
    apiRequest<ProfilePreferences>('/api/v1/me/avatar', {
      method: avatarDataUrl ? 'POST' : 'DELETE',
      body: avatarDataUrl ? JSON.stringify({ avatarDataUrl }) : undefined,
    }),

  getSessions: (_employeeId: string, _currentSessionId: string) =>
    apiRequest<ActiveSession[]>('/api/v1/me/sessions'),

  async terminateSession(_employeeId: string, sessionId: string) {
    await apiRequest<void>(`/api/v1/me/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  },

  async terminateAllSessions(_employeeId: string, _sessionIds: string[]) {
    await apiRequest<void>('/api/v1/me/sessions', { method: 'DELETE' });
  },
};
