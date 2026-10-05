import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEME_STORAGE_KEY, type Theme, type ThemePreference } from '@/models/theme';
import { applyTheme, getSystemTheme, getThemePreference, saveThemePreference } from '@/services/themeService';

type ThemeController = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeController | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>(getThemePreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const theme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => setSystemTheme(media?.matches ? 'dark' : 'light');
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) updatePreference(getThemePreference());
    };
    syncSystemTheme();
    if (media?.addEventListener) media.addEventListener('change', syncSystemTheme);
    else media?.addListener?.(syncSystemTheme);
    window.addEventListener('storage', syncStoredTheme);
    return () => {
      if (media?.removeEventListener) media.removeEventListener('change', syncSystemTheme);
      else media?.removeListener?.(syncSystemTheme);
      window.removeEventListener('storage', syncStoredTheme);
    };
  }, []);

  useEffect(() => applyTheme(theme), [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    saveThemePreference(next);
    updatePreference(next);
  }, []);
  const toggleTheme = useCallback(
    () => setPreference(theme === 'dark' ? 'light' : 'dark'),
    [theme, setPreference],
  );
  const value = useMemo(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [theme, preference, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
