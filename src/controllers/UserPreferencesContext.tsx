import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LANGUAGE_LOCALES, translate, type TranslationKey } from '@/constants/translations';
import type { InterfaceLanguage, ProfilePreferences } from '@/models/profile';
import {
  PROFILE_PREFERENCES_CHANGE_EVENT,
  PROFILE_LANGUAGE_STORAGE_KEY,
  profileService,
} from '@/services/profileService';
import { useAuth } from './AuthContext';
import { useDocumentLocalization } from '@/hooks/useDocumentLocalization';

interface UserPreferencesContextValue {
  preferences: ProfilePreferences | null;
  language: InterfaceLanguage;
  locale: string;
  refreshPreferences: () => Promise<ProfilePreferences | null>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

const readDeviceLanguage = (): InterfaceLanguage => {
  try {
    const stored = window.localStorage.getItem(PROFILE_LANGUAGE_STORAGE_KEY);
    if (stored === 'uk' || stored === 'ru' || stored === 'en') return stored;
  } catch {
    // The default remains available when browser storage is blocked.
  }
  return 'en';
};

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<ProfilePreferences | null>(null);
  const [deviceLanguage, setDeviceLanguage] = useState<InterfaceLanguage>(readDeviceLanguage);

  const refreshPreferences = useCallback(async () => {
    if (!user) {
      setPreferences(null);
      return null;
    }
    const next = await profileService.getPreferences(user.employeeId, user.email);
    setPreferences(next);
    setDeviceLanguage(next.language);
    return next;
  }, [user]);

  useEffect(() => {
    void refreshPreferences();
  }, [refreshPreferences]);

  useEffect(() => {
    const sync = () => void refreshPreferences();
    window.addEventListener(PROFILE_PREFERENCES_CHANGE_EVENT, sync);
    return () => window.removeEventListener(PROFILE_PREFERENCES_CHANGE_EVENT, sync);
  }, [refreshPreferences]);

  const language = preferences?.language ?? deviceLanguage;
  useDocumentLocalization(language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      preferences,
      language,
      locale: LANGUAGE_LOCALES[language],
      refreshPreferences,
      t: (key, params) => translate(language, key, params),
    }),
    [preferences, language, refreshPreferences],
  );

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences() {
  const value = useContext(UserPreferencesContext);
  if (!value) throw new Error('useUserPreferences must be used inside UserPreferencesProvider.');
  return value;
}
