import { LANGUAGE_LOCALES } from '@/constants/translations';
import type { InterfaceLanguage } from '@/models/profile';

export function getActiveLocale() {
  if (typeof document === 'undefined') return LANGUAGE_LOCALES.en;
  const language = document.documentElement.lang as InterfaceLanguage;
  return LANGUAGE_LOCALES[language] ?? LANGUAGE_LOCALES.en;
}
