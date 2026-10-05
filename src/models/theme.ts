export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

export const THEME_STORAGE_KEY = 'c-job-sparks:theme';
export const THEME_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#0c192b' };
