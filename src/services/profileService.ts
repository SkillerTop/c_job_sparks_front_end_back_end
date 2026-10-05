import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/constants/profile';
import type {
  ActiveSession,
  InterfaceLanguage,
  NotificationPreferences,
  ProfilePreferences,
} from '@/models/profile';
import { normalizeEmail } from '@/services/authService';

const PROFILE_STATE_KEY = 'c-job-profile-settings-v1';
export const PROFILE_LANGUAGE_STORAGE_KEY = 'c-job-interface-language';
export const PROFILE_PREFERENCES_CHANGE_EVENT = 'c-job-profile-preferences-change';

interface StoredProfileState {
  version: 1;
  profiles: Record<string, ProfilePreferences>;
  revokedSessionIds: Record<string, string[]>;
}

const fallback: StoredProfileState = { version: 1, profiles: {}, revokedSessionIds: {} };

const readState = (): StoredProfileState => {
  try {
    const value = window.localStorage.getItem(PROFILE_STATE_KEY);
    if (!value) return structuredClone(fallback);
    const parsed = JSON.parse(value) as StoredProfileState;
    if (parsed.version !== 1 || !parsed.profiles || !parsed.revokedSessionIds) return structuredClone(fallback);
    return parsed;
  } catch {
    return structuredClone(fallback);
  }
};

const saveState = (state: StoredProfileState) => {
  try {
    window.localStorage.setItem(PROFILE_STATE_KEY, JSON.stringify(state));
  } catch {
    Object.assign(fallback, structuredClone(state));
  }
  window.dispatchEvent(new Event(PROFILE_PREFERENCES_CHANGE_EVENT));
};

const profileFor = (state: StoredProfileState, employeeId: string, accountEmail: string) => {
  const stored = state.profiles[employeeId];
  return stored ?? {
    employeeId,
    contactEmail: normalizeEmail(accountEmail),
    language: 'en' as const,
    notifications: structuredClone(DEFAULT_NOTIFICATION_PREFERENCES),
  };
};

const browserLabel = () => {
  const agent = navigator.userAgent;
  if (/Edg\//.test(agent)) return 'Microsoft Edge';
  if (/Firefox\//.test(agent)) return 'Firefox';
  if (/Safari\//.test(agent) && !/Chrome\//.test(agent)) return 'Safari';
  return 'Chrome';
};

const platformLabel = () => {
  const agent = navigator.userAgent;
  if (/iPhone|iPad/.test(agent)) return 'iOS';
  if (/Android/.test(agent)) return 'Android';
  if (/Macintosh/.test(agent)) return 'macOS';
  return 'Windows';
};

export const profileService = {
  async getPreferences(employeeId: string, accountEmail: string): Promise<ProfilePreferences> {
    return structuredClone(profileFor(readState(), employeeId, accountEmail));
  },

  async requestEmailVerification(
    employeeId: string,
    accountEmail: string,
    nextEmail: string,
  ): Promise<ProfilePreferences> {
    const email = normalizeEmail(nextEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    const state = readState();
    const current = profileFor(state, employeeId, accountEmail);
    if (email === current.contactEmail) throw new Error('This is already your current contact email.');
    const next = {
      ...current,
      pendingEmail: email,
      verificationRequestedAt: new Date().toISOString(),
    };
    state.profiles[employeeId] = next;
    saveState(state);
    return structuredClone(next);
  },

  async savePreferences(
    employeeId: string,
    accountEmail: string,
    language: InterfaceLanguage,
    notifications: NotificationPreferences,
  ): Promise<ProfilePreferences> {
    const state = readState();
    const next = { ...profileFor(state, employeeId, accountEmail), language, notifications: { ...notifications } };
    state.profiles[employeeId] = next;
    saveState(state);
    try {
      window.localStorage.setItem(PROFILE_LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The in-memory preference remains active when browser storage is unavailable.
    }
    return structuredClone(next);
  },

  async saveAvatar(employeeId: string, accountEmail: string, avatarDataUrl?: string): Promise<ProfilePreferences> {
    const state = readState();
    const current = profileFor(state, employeeId, accountEmail);
    const next = { ...current, avatarDataUrl };
    state.profiles[employeeId] = next;
    saveState(state);
    return structuredClone(next);
  },

  async getSessions(employeeId: string, currentSessionId: string): Promise<ActiveSession[]> {
    const now = Date.now();
    const sessions: ActiveSession[] = [
      {
        id: currentSessionId,
        deviceName: 'This device',
        deviceDetails: `${platformLabel()} · ${browserLabel()}`,
        location: 'Current session',
        lastActiveAt: new Date(now).toISOString(),
        current: true,
        device: /iPhone|iPad|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop',
      },
      {
        id: `${employeeId}-office-workstation`,
        deviceName: 'Office workstation',
        deviceDetails: 'Windows 11 · Microsoft Edge',
        location: 'Nikolayev office',
        lastActiveAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        current: false,
        device: 'desktop',
      },
      {
        id: `${employeeId}-mobile`,
        deviceName: 'Mobile phone',
        deviceDetails: 'iOS · Safari',
        location: 'Remote',
        lastActiveAt: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
        current: false,
        device: 'mobile',
      },
    ];
    const revoked = new Set(readState().revokedSessionIds[employeeId] ?? []);
    return sessions.filter((item) => !revoked.has(item.id));
  },

  async terminateSession(employeeId: string, sessionId: string) {
    const state = readState();
    state.revokedSessionIds[employeeId] = Array.from(
      new Set([...(state.revokedSessionIds[employeeId] ?? []), sessionId]),
    );
    saveState(state);
  },

  async terminateAllSessions(employeeId: string, sessionIds: string[]) {
    const state = readState();
    state.revokedSessionIds[employeeId] = Array.from(
      new Set([...(state.revokedSessionIds[employeeId] ?? []), ...sessionIds]),
    );
    saveState(state);
  },
};
