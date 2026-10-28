import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ActiveSession,
  InterfaceLanguage,
  NotificationPreferences,
  PasswordChangeInput,
} from '@/models/profile';
import { authService } from '@/services/authService';
import { profileService } from '@/services/profileService';
import { useAuth } from '@/controllers/AuthContext';
import { useSpark } from '@/controllers/SparkContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

export type ProfileAction = 'preferences' | 'password' | 'session' | 'all-sessions';

export function useProfileController() {
  const { user, logout } = useAuth();
  const { snapshot, currentUserId, activeRole } = useSpark();
  const { preferences, refreshPreferences } = useUserPreferences();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<ProfileAction | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const employee = snapshot?.employees.find((item) => item.id === currentUserId) ?? null;
  const department = snapshot?.departments.find((item) => item.id === employee?.departmentId) ?? null;
  const directoryManager = snapshot?.employees.find((item) => item.id === employee?.managerId) ?? null;
  const managerName = employee?.managerName ?? directoryManager?.name ?? null;

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const currentSession = authService.getCurrentSession();
      const [, nextSessions] = await Promise.all([
        refreshPreferences(),
        profileService.getSessions(user.employeeId, currentSession?.sessionId ?? `current-${user.employeeId}`),
      ]);
      setSessions(nextSessions);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Could not load profile settings.');
    } finally {
      setLoading(false);
    }
  }, [user, refreshPreferences]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const execute = async <T,>(action: ProfileAction, operation: () => Promise<T>) => {
    setBusyAction(action);
    try {
      return await operation();
    } finally {
      setBusyAction(null);
    }
  };

  const savePreferences = (language: InterfaceLanguage, notifications: NotificationPreferences) =>
    execute('preferences', async () => {
      if (!user) throw new Error('Sign in to update your preferences.');
      const next = await profileService.savePreferences(user.employeeId, user.email, language, notifications);
      await refreshPreferences();
      return next;
    });

  const changePassword = (input: PasswordChangeInput) =>
    execute('password', async () => {
      if (!user) throw new Error('Sign in to change your password.');
      await authService.changePassword(user.employeeId, input);
    });

  const terminateSession = (sessionItem: ActiveSession) =>
    execute('session', async () => {
      if (!user) return;
      await profileService.terminateSession(user.employeeId, sessionItem.id);
      if (sessionItem.current) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== sessionItem.id));
    });

  const signOutAll = () =>
    execute('all-sessions', async () => {
      if (!user) return;
      await profileService.terminateAllSessions(user.employeeId, sessions.map((item) => item.id));
      logout();
      navigate('/login', { replace: true });
    });

  const profile = useMemo(
    () => ({ employee, department, managerName, role: activeRole, user }),
    [employee, department, managerName, activeRole, user],
  );

  return {
    profile,
    preferences,
    sessions,
    loading,
    busyAction,
    loadError,
    refresh,
    savePreferences,
    changePassword,
    terminateSession,
    signOutAll,
  };
}
