import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  EN_TRANSLATIONS,
  LANGUAGE_LOCALES,
  translate,
  type Dictionary,
  type TranslationKey,
} from '@/constants/translations';
import type { InterfaceLanguage, ProfilePreferences } from '@/models/profile';
import {
  PROFILE_PREFERENCES_CHANGE_EVENT,
  PROFILE_LANGUAGE_STORAGE_KEY,
  profileService,
} from '@/services/profileService';
import { useAuth } from '@/controllers/AuthContext';
import { useDocumentLocalization } from '@/hooks/useDocumentLocalization';

type ContentLocalizer = (language: InterfaceLanguage, value: string) => string;

interface UserPreferencesContextValue {
  preferences: ProfilePreferences | null;
  language: InterfaceLanguage;
  locale: string;
  refreshPreferences: () => Promise<ProfilePreferences | null>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  localize: (value: string) => string;
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
  const [dictionary, setDictionary] = useState<Dictionary>(EN_TRANSLATIONS);
  const [contentLocalizer, setContentLocalizer] = useState<ContentLocalizer | null>(null);

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
  useEffect(() => {
    let active = true;
    if (language === 'en') {
      setDictionary(EN_TRANSLATIONS);
      return () => { active = false; };
    }
    setDictionary(EN_TRANSLATIONS);
    const loadDictionary = language === 'uk'
      ? import('@/constants/translations.uk').then((module) => module.UK_TRANSLATIONS)
      : import('@/constants/translations.ru').then((module) => module.RU_TRANSLATIONS);
    void loadDictionary.then((next) => {
      if (active) setDictionary(next);
    });
    return () => { active = false; };
  }, [language]);
  useEffect(() => {
    let active = true;
    if (language === 'en') {
      setContentLocalizer(null);
      return () => { active = false; };
    }
    void import('@/services/contentLocalization').then((module) => {
      if (active) setContentLocalizer(() => module.localizeContent);
    });
    return () => { active = false; };
  }, [language]);
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
      t: (key, params) => translate(dictionary, key, params),
      localize: (text) => contentLocalizer?.(language, text) ?? text,
    }),
    [preferences, language, refreshPreferences, dictionary, contentLocalizer],
  );

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences() {
  const value = useContext(UserPreferencesContext);
  if (!value) throw new Error('useUserPreferences must be used inside UserPreferencesProvider.');
  return value;
}
